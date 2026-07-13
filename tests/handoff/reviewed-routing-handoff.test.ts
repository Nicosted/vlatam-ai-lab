import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeAndHash } from "../../src/evaluation/index.js";
import type {
  ExecutionProfile,
  GatewayOutcome,
} from "../../src/execution/index.js";
import {
  assertHandoffAuditMetadataOnly,
  InMemoryAuthorizationStateStore,
  ReviewedRoutingDecisionHandoff,
  handoffPolicyHash,
  type HandoffAuthorizationPolicy,
  type HandoffAuditEvent,
  type HandoffRequest,
} from "../../src/handoff/index.js";
import type { RoutingDecision } from "../../src/routing/index.js";
import { LOCAL_REPLAY_PRIVACY } from "../helpers/privacy.js";

const now = "2026-07-12T12:00:00.000Z";
const profile: ExecutionProfile = {
  profile_id: "profile.reviewed" as never,
  capability_id: "evidence.extraction.normative_claims" as never,
  provider_id: "replay" as never,
  model_id: "fixture" as never,
  mode: "replay",
  lifecycle_status: "candidate",
  enabled: true,
  contract_version: "1.1.0",
  configuration: { timeout_ms: 10, response_format: "json" },
  eligibility: {
    privacy_compatibility: "declared_not_enforced",
    budget_class: "development",
    evaluation_status: "fixture_verified",
  },
  privacy: LOCAL_REPLAY_PRIVACY,
  fixture_id: "safe",
};
const policy: HandoffAuthorizationPolicy = {
  schema_version: "1.0.0",
  policy_id: "handoff.reviewed-routing",
  policy_version: "1.0.0",
  allowed_authorizer_roles: ["ai-governance-authorizer"],
  allowed_routing_policies: [{ id: "routing.best-profile", version: "1.0.0" }],
  allowed_profile_lifecycle_states: ["candidate"],
  allowed_data_classifications: ["public", "internal"],
  allowed_budget_classes: ["development"],
  maximum_authorization_age_seconds: 3600,
  enforce_decision_ttl: true,
  authorization_mode: "single_use",
};
const makeDecision = (
  status: RoutingDecision["status"] = "selected",
): RoutingDecision => {
  const base = {
    schema_version: "1.0.0" as const,
    status,
    capability_id: "evidence.extraction.normative_claims",
    policy: {
      policy_id: "routing.best-profile",
      policy_version: "1.0.0",
      policy_hash: "a".repeat(64),
    },
    decision_reason:
      status === "fallback_selected"
        ? ("FALLBACK_ELIGIBLE" as const)
        : status === "selected"
          ? ("REVIEWED_WINNER_ELIGIBLE" as const)
          : status === "blocked"
            ? ("PROFILE_INELIGIBLE" as const)
            : ("REVIEW_REQUIRED" as const),
    execution_correlation_id: "execution.correlation",
    audit_correlation_id: "audit.correlation",
    created_at: "2026-07-12T11:30:00.000Z",
    expiry_at: "2026-07-12T12:30:00.000Z",
    selected_profile_id: "profile.reviewed",
    selected_profile_version: "1.1.0",
    canonical_profile_key: "profile.reviewed@1.1.0",
    benchmark_evidence: {
      schema_version: "1.0.0" as const,
      campaign_id: "campaign.reviewed",
      campaign_version: "1.0.0",
      campaign_execution_id: "campaign.execution",
      campaign_hash: "b".repeat(64),
      suite_id: "suite.reviewed",
      suite_version: "1.0.0",
      suite_hash: "c".repeat(64),
      ranking_policy_id: "ranking.default",
      ranking_policy_version: "1.0.0",
      selected_profile_id: "profile.reviewed",
      selected_profile_version: "1.1.0",
      profile_hash: "d".repeat(64),
      ranking_position: 1,
      evidence_created_at: "2026-07-12T11:00:00.000Z",
      supersession_status: "current" as const,
    },
    review_attestation: {
      attestation_id: "review.attestation",
      reviewer_role: "ai-governance-reviewer",
      decision: "approved" as const,
      reviewed_at: "2026-07-12T11:15:00.000Z",
    },
  };
  return { ...base, decision_hash: normalizeAndHash(base).hash };
};
const request = (
  status: RoutingDecision["status"] = "selected",
  authorizationPolicy: HandoffAuthorizationPolicy = policy,
): HandoffRequest => {
  const decision = makeDecision(status);
  return {
    schema_version: "1.0.0",
    handoff_id: "handoff.one",
    decision,
    capability_request: {
      schema_version: "1.0.0",
      request_id: "request.one",
      capability_id: "evidence.extraction.normative_claims" as never,
      input: {},
      context: { data_classification: "public" },
    },
    budget_class: "development",
    execution_correlation_id: decision.execution_correlation_id,
    audit_correlation_id: decision.audit_correlation_id,
    authorization: {
      schema_version: "1.0.0",
      authorization_id: "authorization.one",
      authorizer_role: "ai-governance-authorizer",
      authorization_decision: "approved",
      authorized_at: "2026-07-12T11:45:00.000Z",
      review_attestation_reference: "review.attestation",
      handoff_policy_id: authorizationPolicy.policy_id,
      handoff_policy_version: authorizationPolicy.policy_version,
      handoff_policy_hash: handoffPolicyHash(authorizationPolicy),
      decision_hash: decision.decision_hash,
      routing_policy_id: decision.policy.policy_id,
      routing_policy_version: decision.policy.policy_version,
      capability_id: decision.capability_id,
      selected_profile_id: decision.selected_profile_id!,
      selected_profile_version: decision.selected_profile_version!,
      canonical_profile_key: decision.canonical_profile_key!,
      benchmark_evidence_reference: "campaign.execution",
      decision_created_at: decision.created_at,
      ...(decision.expiry_at ? { decision_expiry_at: decision.expiry_at } : {}),
      execution_correlation_id: decision.execution_correlation_id,
      audit_correlation_id: decision.audit_correlation_id,
    },
  };
};
const outcome = (
  status: "succeeded" | "failed" | "blocked" = "succeeded",
): GatewayOutcome =>
  ({
    result: {
      schema_version: "1.0.0",
      request_id: "request.one",
      capability_id: "evidence.extraction.normative_claims",
      status,
      ...(status === "succeeded"
        ? { output: {} }
        : {
            error: {
              category: "policy",
              code: "EXECUTION_UNAVAILABLE",
              message: "blocked",
            },
          }),
      governance: {
        human_review_required: false,
        downstream_allowed: status === "succeeded",
        approval_state: "approved",
      },
    } as never,
    audit: {
      execution_id: "gateway.execution",
      request_id: "request.one",
      capability_id: "evidence.extraction.normative_claims",
      started_at: now,
      finished_at: now,
      duration_ms: 0,
      result_status: status,
      capability_contract_version: "1.0.0",
    },
  }) as GatewayOutcome;
const setup = (
  p = profile,
  mode = policy.authorization_mode,
  result: GatewayOutcome = outcome(),
  policyOverride?: HandoffAuthorizationPolicy,
) => {
  let calls = 0;
  const events: HandoffAuditEvent[] = [];
  const effectivePolicy =
    policyOverride ?? ({ ...policy, authorization_mode: mode } as const);
  const handoff = new ReviewedRoutingDecisionHandoff({
    policy: effectivePolicy,
    clock: () => new Date(now),
    id: (() => {
      let n = 0;
      return () => `event-${++n}`;
    })(),
    profileResolver: () => p,
    authorizationStore: new InMemoryAuthorizationStateStore(),
    auditSink: (e) => events.push(e),
    gateway: {
      execute: async (invocation) => {
        calls++;
        assert.equal(invocation.execution_profile_id, "profile.reviewed");
        assert.equal(invocation.expected_profile_contract_version, "1.1.0");
        return result;
      },
    },
  });
  return { handoff, events, calls: () => calls, policy: effectivePolicy };
};
const rebindDecision = (
  value: HandoffRequest,
  patch: Partial<RoutingDecision>,
): HandoffRequest => {
  const base = Object.fromEntries(
    Object.entries({ ...value.decision, ...patch }).filter(
      ([key]) => key !== "decision_hash",
    ),
  );
  const decision = {
    ...base,
    decision_hash: normalizeAndHash(base).hash,
  } as RoutingDecision;
  return {
    ...value,
    decision,
    authorization: {
      ...value.authorization,
      decision_hash: decision.decision_hash,
      decision_created_at: decision.created_at,
      ...(decision.expiry_at ? { decision_expiry_at: decision.expiry_at } : {}),
    },
  };
};

describe("AI-79 reviewed routing decision handoff", () => {
  it("accepts selected and fallback-selected with exact profile identity", async () => {
    for (const status of ["selected", "fallback_selected"] as const) {
      const s = setup();
      const result = await s.handoff.execute(request(status));
      assert.equal(result.execution_status, "succeeded");
      assert.equal(result.canonical_profile_key, "profile.reviewed@1.1.0");
      assert.equal(s.calls(), 1);
    }
  });
  it("rejects non-executable statuses, hash, capability, version, disabled, lifecycle, role and freshness conflicts before gateway", async () => {
    const cases: HandoffRequest[] = [
      request("blocked"),
      request("human_review_required"),
      request("rejected"),
    ];
    const hash = request();
    cases.push({
      ...hash,
      decision: { ...hash.decision, decision_hash: "0".repeat(64) },
    });
    const capability = request();
    cases.push({
      ...capability,
      capability_request: {
        ...capability.capability_request,
        capability_id: "unknown" as never,
      },
    });
    const role = request();
    cases.push({
      ...role,
      authorization: { ...role.authorization, authorizer_role: "operator" },
    });
    const future = request();
    cases.push({
      ...future,
      authorization: {
        ...future.authorization,
        authorized_at: "2026-07-12T13:00:00.000Z",
      },
    });
    const rejected = request();
    cases.push({
      ...rejected,
      authorization: {
        ...rejected.authorization,
        authorization_decision: "rejected",
      },
    });
    const expired = request();
    cases.push({
      ...expired,
      decision: { ...expired.decision, expiry_at: "2026-07-12T11:59:00.000Z" },
    });
    const futureDecision = request();
    cases.push({
      ...futureDecision,
      decision: {
        ...futureDecision.decision,
        created_at: "2026-07-12T13:00:00.000Z",
      },
    });
    for (const value of cases) {
      const s = setup();
      assert.notEqual(
        (await s.handoff.execute(value)).execution_status,
        "succeeded",
      );
      assert.equal(s.calls(), 0);
    }
    const disabled = setup({ ...profile, enabled: false });
    assert.equal(
      (await disabled.handoff.execute(request())).rejection_reason,
      "PROFILE_DISABLED",
    );
    const lifecycle = setup({ ...profile, lifecycle_status: "production" });
    assert.equal(
      (await lifecycle.handoff.execute(request())).rejection_reason,
      "PROFILE_LIFECYCLE_NOT_ALLOWED",
    );
    const version = setup({ ...profile, contract_version: "1.0.0" });
    assert.equal(
      (await version.handoff.execute(request())).rejection_reason,
      "PROFILE_REFERENCE_CONFLICT",
    );
  });
  it("atomically permits exactly one concurrent single-use execution and supports reusable mode", async () => {
    const single = setup();
    const results = await Promise.all([
      single.handoff.execute(request()),
      single.handoff.execute(request()),
      single.handoff.execute(request()),
    ]);
    assert.equal(
      results.filter((x) => x.execution_status === "succeeded").length,
      1,
    );
    assert.equal(single.calls(), 1);
    assert.equal(
      results.filter(
        (x) => x.rejection_reason === "AUTHORIZATION_ALREADY_CONSUMED",
      ).length,
      2,
    );
    const reusable = setup(profile, "reusable");
    await Promise.all([
      reusable.handoff.execute(request("selected", reusable.policy)),
      reusable.handoff.execute(request("selected", reusable.policy)),
    ]);
    assert.equal(reusable.calls(), 2);
  });
  it("preserves correlation, maps gateway failure, and emits metadata-only audits", async () => {
    const s = setup(profile, "single_use", outcome("blocked"));
    const result = await s.handoff.execute(request());
    assert.equal(result.execution_correlation_id, "execution.correlation");
    assert.equal(result.gateway_execution_id, "gateway.execution");
    assert.equal(result.execution_status, "blocked");
    assert.ok(s.events.some((e) => e.event_type === "execution_failed"));
    assert.ok(
      s.events.every((e) => assertHandoffAuditMetadataOnly(e).length === 0),
    );
    assert.doesNotMatch(
      JSON.stringify(s.events),
      /prompt|payload|provider_response|credential|personal/i,
    );
  });
  it("fails privacy and budget eligibility before gateway invocation", async () => {
    const privacy = request();
    const s1 = setup();
    assert.equal(
      (
        await s1.handoff.execute({
          ...privacy,
          capability_request: {
            ...privacy.capability_request,
            context: { data_classification: "restricted" },
          },
        })
      ).rejection_reason,
      "PRIVACY_CLASS_NOT_ELIGIBLE",
    );
    assert.equal(s1.calls(), 0);
    const budget = request();
    const s2 = setup();
    assert.equal(
      (await s2.handoff.execute({ ...budget, budget_class: "unclassified" }))
        .rejection_reason,
      "BUDGET_CLASS_NOT_ELIGIBLE",
    );
    assert.equal(s2.calls(), 0);
  });
  it("binds authorization to the exact canonical handoff policy", async () => {
    assert.equal(
      request().authorization.handoff_policy_hash,
      handoffPolicyHash(policy),
    );
    const mutations: Array<[string, HandoffAuthorizationPolicy]> = [
      ["wrong-id", { ...policy, policy_id: "handoff.other" }],
      ["wrong-version", { ...policy, policy_version: "1.0.1" }],
      ["changed-mode", { ...policy, authorization_mode: "reusable" }],
      [
        "changed-role",
        {
          ...policy,
          allowed_authorizer_roles: [
            "ai-governance-authorizer",
            "second-authorizer",
          ],
        },
      ],
      [
        "changed-lifecycle",
        {
          ...policy,
          allowed_profile_lifecycle_states: ["candidate", "production"],
        },
      ],
    ];
    for (const [, effective] of mutations) {
      const s = setup(
        profile,
        effective.authorization_mode,
        outcome(),
        effective,
      );
      const result = await s.handoff.execute(request());
      assert.equal(result.rejection_reason, "HANDOFF_POLICY_MISMATCH");
      assert.equal(s.calls(), 0);
    }
    const wrongHash = request();
    const s = setup();
    assert.equal(
      (
        await s.handoff.execute({
          ...wrongHash,
          authorization: {
            ...wrongHash.authorization,
            handoff_policy_hash: "0".repeat(64),
          },
        })
      ).rejection_reason,
      "HANDOFF_POLICY_MISMATCH",
    );
    assert.equal(s.calls(), 0);
  });
  it("rejects every unsupported public contract version before consumption", async () => {
    const variants = [
      { ...request(), schema_version: "2.0.0" },
      {
        ...request(),
        decision: { ...request().decision, schema_version: "2.0.0" },
      },
      {
        ...request(),
        authorization: { ...request().authorization, schema_version: "2.0.0" },
      },
    ] as unknown as HandoffRequest[];
    for (const variant of variants) {
      const s = setup();
      assert.equal(
        (await s.handoff.execute(variant)).rejection_reason,
        "UNSUPPORTED_CONTRACT_VERSION",
      );
      assert.equal(s.calls(), 0);
      assert.equal(
        (await s.handoff.execute(request())).execution_status,
        "succeeded",
      );
    }
    const invalidPolicy = {
      ...policy,
      schema_version: "2.0.0",
    } as unknown as HandoffAuthorizationPolicy;
    const s = setup(profile, "single_use", outcome(), invalidPolicy);
    assert.equal(
      (await s.handoff.execute(request())).rejection_reason,
      "UNSUPPORTED_CONTRACT_VERSION",
    );
    assert.equal(s.calls(), 0);
  });
  it("validates malformed nested identities and policy allowlists at runtime", async () => {
    const malformed = request();
    const s = setup();
    assert.equal(
      (
        await s.handoff.execute({
          ...malformed,
          authorization: {
            ...malformed.authorization,
            routing_policy_version: "v1",
          },
        })
      ).rejection_reason,
      "MALFORMED_IDENTITY",
    );
    assert.equal(s.calls(), 0);
    const duplicatePolicy = {
      ...policy,
      allowed_authorizer_roles: [
        "ai-governance-authorizer",
        "ai-governance-authorizer",
      ],
    };
    const duplicate = setup(profile, "single_use", outcome(), duplicatePolicy);
    assert.equal(
      (await duplicate.handoff.execute(request("selected", duplicatePolicy)))
        .rejection_reason,
      "INVALID_POLICY",
    );
    assert.equal(duplicate.calls(), 0);
  });
  it("enforces temporal ordering and exact millisecond boundaries", async () => {
    const equalExpiry = rebindDecision(request(), { expiry_at: now });
    assert.equal(
      (await setup().handoff.execute(equalExpiry)).rejection_reason,
      "DECISION_EXPIRED",
    );
    const beforeExpiry = rebindDecision(request(), {
      expiry_at: "2026-07-12T11:59:59.999Z",
    });
    assert.equal(
      (await setup().handoff.execute(beforeExpiry)).rejection_reason,
      "DECISION_EXPIRED",
    );
    const invalidExpiry = rebindDecision(request(), { expiry_at: "invalid" });
    assert.equal(
      (await setup().handoff.execute(invalidExpiry)).rejection_reason,
      "DECISION_EXPIRY_INVALID",
    );
    const sameAsCreated = rebindDecision(request(), {
      expiry_at: "2026-07-12T11:30:00.000Z",
    });
    assert.equal(
      (await setup().handoff.execute(sameAsCreated)).rejection_reason,
      "DECISION_EXPIRY_INVALID",
    );
    const earlyAuthorization = request();
    assert.equal(
      (
        await setup().handoff.execute({
          ...earlyAuthorization,
          authorization: {
            ...earlyAuthorization.authorization,
            authorized_at: "2026-07-12T11:29:59.999Z",
          },
        })
      ).rejection_reason,
      "AUTHORIZATION_BEFORE_DECISION",
    );
    const invalidAuthorization = request();
    assert.equal(
      (
        await setup().handoff.execute({
          ...invalidAuthorization,
          authorization: {
            ...invalidAuthorization.authorization,
            authorized_at: "invalid",
          },
        })
      ).rejection_reason,
      "INVALID_AUTHORIZATION",
    );
    const expiryMismatch = request();
    assert.equal(
      (
        await setup().handoff.execute({
          ...expiryMismatch,
          authorization: {
            ...expiryMismatch.authorization,
            decision_expiry_at: "2026-07-12T12:30:00.001Z",
          },
        })
      ).rejection_reason,
      "AUTHORIZATION_MISMATCH",
    );
    const oldDecision = rebindDecision(request(), {
      created_at: "2026-07-12T10:00:00.000Z",
    });
    const exactAge = {
      ...oldDecision,
      authorization: {
        ...oldDecision.authorization,
        authorized_at: "2026-07-12T11:00:00.000Z",
      },
    };
    assert.equal(
      (await setup().handoff.execute(exactAge)).execution_status,
      "succeeded",
    );
    const beyond = {
      ...oldDecision,
      authorization: {
        ...oldDecision.authorization,
        authorized_at: "2026-07-12T10:59:59.999Z",
      },
    };
    assert.equal(
      (await setup().handoff.execute(beyond)).rejection_reason,
      "AUTHORIZATION_EXPIRED",
    );
  });
  it("does not restore a consumed authorization after gateway failure or throw", async () => {
    const failed = setup(profile, "single_use", outcome("failed"));
    assert.equal(
      (await failed.handoff.execute(request())).execution_status,
      "failed",
    );
    assert.equal(
      (await failed.handoff.execute(request())).rejection_reason,
      "AUTHORIZATION_ALREADY_CONSUMED",
    );
    let calls = 0;
    const thrown = new ReviewedRoutingDecisionHandoff({
      policy,
      clock: () => new Date(now),
      profileResolver: () => profile,
      gateway: {
        execute: async () => {
          calls++;
          throw new Error("fixture failure");
        },
      },
    });
    assert.equal((await thrown.execute(request())).execution_status, "failed");
    assert.equal(
      (await thrown.execute(request())).rejection_reason,
      "AUTHORIZATION_ALREADY_CONSUMED",
    );
    assert.equal(calls, 1);
  });
});
