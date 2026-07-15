import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  OPENROUTER_SANDBOX_ACTIVATION_SCOPE,
  computeOpenRouterSandboxActivationReviewHash,
  computeOpenRouterSandboxRuntimeHash,
  defaultOpenRouterSandboxActivationReviewDependencies,
  evaluateOpenRouterSandboxActivationReview,
  loadOpenRouterSandboxActivationReview,
} from "../../src/providers/openrouter-sandbox-activation-review.js";
import {
  computeOpenRouterSandboxGoldCaseHash,
  loadOpenRouterSandboxGoldCase,
} from "../../src/providers/openrouter-sandbox-gold-case.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const AT = new Date("2026-07-15T12:00:00.000Z");

type Draft = Record<string, unknown>;
const rehash = (value: Draft): Draft => ({
  ...value,
  review_hash: computeOpenRouterSandboxActivationReviewHash(value),
});
const mutate = (change: (draft: Draft) => void): Draft => {
  const draft = structuredClone(
    loadOpenRouterSandboxActivationReview(),
  ) as unknown as Draft;
  change(draft);
  return rehash(draft);
};
const evaluate = (
  value: unknown,
  dependencies = defaultOpenRouterSandboxActivationReviewDependencies(),
) => evaluateOpenRouterSandboxActivationReview(value, AT, dependencies);

const reviewedHashes = () => {
  const review = loadOpenRouterSandboxActivationReview();
  const dependencies = defaultOpenRouterSandboxActivationReviewDependencies();
  return {
    dossier_hash: review.artifact_bindings.readiness_dossier.hash,
    evidence_pack_hash: review.artifact_bindings.external_evidence_pack.hash,
    proposal_hash: review.artifact_bindings.sandbox_proposal.hash,
    gold_case_hash: review.artifact_bindings.gold_case.hash,
    runtime_configuration_hash: computeOpenRouterSandboxRuntimeHash(
      dependencies.runtime,
    ),
  };
};
const approvedDecision = (reviewerId: string, role: string): Draft => ({
  status: "approved",
  reviewer_id: reviewerId,
  reviewer_role: role,
  decision: "approve",
  reason: "Reviewed the bound artifacts end to end.",
  decided_at: "2026-07-15T09:00:00.000Z",
  reviewed_hashes: reviewedHashes(),
});

describe("OpenRouter sandbox activation human review", () => {
  it("validates the repository review against its versioned JSON Schema", () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      load("schemas/ai-openrouter-sandbox-activation-review.schema.json"),
    );
    assert.equal(
      validate(load("config/ai-openrouter-sandbox-activation-review.json")),
      true,
      JSON.stringify(validate.errors),
    );
  });

  it("evaluates the honest repository state as blocked with pending human decisions", () => {
    const first = evaluate(loadOpenRouterSandboxActivationReview());
    const second = evaluate(loadOpenRouterSandboxActivationReview());
    assert.deepEqual(first, second);
    assert.ok(Object.isFrozen(first));
    assert.equal(first.outcome, "blocked");
    assert.deepEqual(first.reason_codes, [
      "pricing_policy_unresolved",
      "privacy_zdr_evidence_unresolved",
      "sandbox_proposal_blocked",
    ]);
    assert.deepEqual(first.pending_human_decisions, [
      "activation_approval_pending",
      "evidence_review_pending",
      "exact_routing_limitation_unacknowledged",
      "gold_case_acceptance_pending",
      "incident_owner_unassigned",
      "kill_switch_owner_unassigned",
    ]);
  });

  it("reports execution, secret, and runtime invariants false on every outcome", () => {
    const outcomes = [
      evaluate(loadOpenRouterSandboxActivationReview()),
      evaluate(null),
      evaluate(mutate((draft) => (draft["lifecycle"] = "rejected"))),
      evaluate(
        mutate((draft) => (draft["expires_at"] = "2026-07-01T00:00:00.000Z")),
      ),
    ];
    for (const result of outcomes) {
      assert.equal(result.execution_authorized, false, result.outcome);
      assert.equal(result.provider_call_performed, false, result.outcome);
      assert.equal(result.secret_access_allowed, false, result.outcome);
      assert.equal(result.runtime_enabled, false, result.outcome);
      assert.equal(
        result.activation_configuration_authorized,
        false,
        result.outcome,
      );
    }
  });

  it("detects tampering through the canonical review hash", () => {
    const tampered = structuredClone(
      loadOpenRouterSandboxActivationReview(),
    ) as unknown as Draft;
    (tampered["ceilings"] as Draft)["maximum_total_spend_usd"] = "0.04";
    const result = evaluate(tampered);
    assert.equal(result.outcome, "invalid_review");
    assert.ok(result.reason_codes.includes("review_hash_mismatch"));
  });

  it("rejects any approval scope other than the single bounded synthetic scope", () => {
    assert.equal(
      OPENROUTER_SANDBOX_ACTIVATION_SCOPE,
      "one_synthetic_gold_case_sandbox_activation",
    );
    for (const scope of [
      "sandbox_activation",
      "provider_wide_approval",
      "production_execution",
      "recurring_execution",
      "autonomous_execution",
      "customer_data_processing",
      "unrestricted",
    ]) {
      const result = evaluate(mutate((draft) => (draft["scope"] = scope)));
      assert.equal(result.outcome, "invalid_review", scope);
      assert.ok(result.reason_codes.includes("approval_scope_forbidden"));
    }
  });

  it("handles lifecycle transitions: expiry, rejection, and supersession", () => {
    const expired = evaluate(
      mutate((draft) => (draft["expires_at"] = "2026-07-15T11:59:59.000Z")),
    );
    assert.equal(expired.outcome, "expired");
    assert.deepEqual(expired.reason_codes, ["review_expired"]);

    const lifecycleExpired = evaluate(
      mutate((draft) => (draft["lifecycle"] = "expired")),
    );
    assert.equal(lifecycleExpired.outcome, "expired");

    const rejected = evaluate(
      mutate((draft) => (draft["lifecycle"] = "rejected")),
    );
    assert.equal(rejected.outcome, "rejected");
    assert.deepEqual(rejected.reason_codes, ["review_rejected"]);

    const superseded = evaluate(
      mutate((draft) => {
        draft["lifecycle"] = "superseded";
        draft["superseded_by"] =
          "openrouter.minimax-m2.7.sandbox-activation-review.v2";
      }),
    );
    assert.equal(superseded.outcome, "blocked");
    assert.ok(superseded.reason_codes.includes("review_superseded"));

    const orphanSuperseded = evaluate(
      mutate((draft) => (draft["lifecycle"] = "superseded")),
    );
    assert.equal(orphanSuperseded.outcome, "invalid_review");
    assert.ok(
      orphanSuperseded.reason_codes.includes("superseded_without_successor"),
    );

    const danglingSuccessor = evaluate(
      mutate(
        (draft) =>
          (draft["superseded_by"] =
            "openrouter.minimax-m2.7.sandbox-activation-review.v2"),
      ),
    );
    assert.ok(
      danglingSuccessor.reason_codes.includes(
        "successor_without_superseded_lifecycle",
      ),
    );
  });

  it("enforces reviewer independence and forbids self-approval", () => {
    const withDecisions = (evidenceReviewer: string, approver: string): Draft =>
      mutate((draft) => {
        draft["lifecycle"] = "approved";
        (draft["decisions"] as Draft)["evidence_review"] = approvedDecision(
          evidenceReviewer,
          "evidence_reviewer",
        );
        (draft["decisions"] as Draft)["activation_approval"] = approvedDecision(
          approver,
          "sandbox_activation_approver",
        );
      });

    const sameHuman = evaluate(withDecisions("maria.gomez", "maria.gomez"));
    assert.equal(sameHuman.outcome, "invalid_review");
    assert.ok(
      sameHuman.reason_codes.includes("reviewer_independence_violation"),
    );

    const selfApproval = evaluate(
      mutate((draft) => {
        draft["created_by"] = "juan.perez";
        draft["lifecycle"] = "approved";
        (draft["decisions"] as Draft)["evidence_review"] = approvedDecision(
          "maria.gomez",
          "evidence_reviewer",
        );
        (draft["decisions"] as Draft)["activation_approval"] = approvedDecision(
          "juan.perez",
          "sandbox_activation_approver",
        );
      }),
    );
    assert.ok(selfApproval.reason_codes.includes("self_approval_forbidden"));

    const nonHuman = evaluate(
      withDecisions("maria.gomez", "deploy.bot.approver"),
    );
    assert.ok(
      nonHuman.reason_codes.includes(
        "activation_approval_non_human_identity_forbidden",
      ),
    );

    const independent = evaluate(withDecisions("maria.gomez", "juan.perez"));
    assert.equal(independent.outcome, "blocked");
    for (const reason of [
      "reviewer_independence_violation",
      "self_approval_forbidden",
    ])
      assert.ok(!independent.reason_codes.includes(reason));
  });

  it("enforces ownership rules: approver overlap forbidden, owner overlap allowed", () => {
    const assign = (killSwitch: string, incident: string): Draft =>
      mutate((draft) => {
        draft["lifecycle"] = "approved";
        (draft["decisions"] as Draft)["evidence_review"] = approvedDecision(
          "maria.gomez",
          "evidence_reviewer",
        );
        (draft["decisions"] as Draft)["activation_approval"] = approvedDecision(
          "juan.perez",
          "sandbox_activation_approver",
        );
        (draft["operational_ownership"] as Draft)["kill_switch_owner"] = {
          status: "assigned",
          identity: killSwitch,
          role: "kill_switch_owner",
        };
        (draft["operational_ownership"] as Draft)["incident_owner"] = {
          status: "assigned",
          identity: incident,
          role: "incident_owner",
        };
      });

    const approverOwnsKillSwitch = evaluate(
      assign("juan.perez", "lucia.fernandez"),
    );
    assert.equal(approverOwnsKillSwitch.outcome, "invalid_review");
    assert.ok(
      approverOwnsKillSwitch.reason_codes.includes(
        "kill_switch_owner_approver_overlap_forbidden",
      ),
    );

    // Documented rule: kill-switch and incident ownership may coincide.
    const sharedOperations = evaluate(
      assign("lucia.fernandez", "lucia.fernandez"),
    );
    assert.equal(sharedOperations.outcome, "blocked");
    assert.ok(
      !sharedOperations.reason_codes.some((code) =>
        code.includes("overlap_forbidden"),
      ),
    );
    assert.ok(
      !sharedOperations.pending_human_decisions.includes(
        "kill_switch_owner_unassigned",
      ),
    );

    const systemOwner = evaluate(
      assign("claude.repository.agent", "lucia.fernandez"),
    );
    assert.ok(
      systemOwner.reason_codes.includes(
        "kill_switch_owner_non_human_identity_forbidden",
      ),
    );
  });

  it("rejects malformed decisions, missing reasons, and future timestamps", () => {
    const noReason = evaluate(
      mutate((draft) => {
        const decision = approvedDecision("maria.gomez", "evidence_reviewer");
        decision["reason"] = "";
        (draft["decisions"] as Draft)["evidence_review"] = decision;
      }),
    );
    assert.ok(noReason.reason_codes.includes("evidence_review_reason_missing"));

    const futureDecision = evaluate(
      mutate((draft) => {
        const decision = approvedDecision("maria.gomez", "evidence_reviewer");
        decision["decided_at"] = "2027-01-01T00:00:00.000Z";
        (draft["decisions"] as Draft)["evidence_review"] = decision;
      }),
    );
    assert.ok(
      futureDecision.reason_codes.includes("evidence_review_timestamp_invalid"),
    );

    const pendingWithData = evaluate(
      mutate((draft) => {
        ((draft["decisions"] as Draft)["evidence_review"] as Draft)[
          "reviewer_id"
        ] = "maria.gomez";
      }),
    );
    assert.ok(
      pendingWithData.reason_codes.includes(
        "evidence_review_pending_with_decision_data",
      ),
    );

    const approvalWithoutEvidence = evaluate(
      mutate((draft) => {
        draft["lifecycle"] = "approved";
        (draft["decisions"] as Draft)["activation_approval"] = approvedDecision(
          "juan.perez",
          "sandbox_activation_approver",
        );
      }),
    );
    assert.ok(
      approvalWithoutEvidence.reason_codes.includes(
        "approval_before_evidence_review_forbidden",
      ),
    );
  });

  it("fails closed on missing inner objects and unknown status enums", () => {
    const missingDecision = evaluate(
      mutate((draft) => {
        delete (draft["decisions"] as Draft)["evidence_review"];
      }),
    );
    assert.equal(missingDecision.outcome, "invalid_review");
    assert.ok(missingDecision.reason_codes.includes("decisions_missing"));

    const invalidDecisionStatus = evaluate(
      mutate((draft) => {
        ((draft["decisions"] as Draft)["evidence_review"] as Draft)["status"] =
          "unknown";
      }),
    );
    assert.equal(invalidDecisionStatus.outcome, "invalid_review");
    assert.ok(
      invalidDecisionStatus.reason_codes.includes(
        "evidence_review_status_invalid",
      ),
    );

    const missingOwner = evaluate(
      mutate((draft) => {
        delete (draft["operational_ownership"] as Draft)["kill_switch_owner"];
      }),
    );
    assert.equal(missingOwner.outcome, "invalid_review");
    assert.ok(
      missingOwner.reason_codes.includes("kill_switch_owner_role_mismatch"),
    );

    const invalidOwnerStatus = evaluate(
      mutate((draft) => {
        (
          (draft["operational_ownership"] as Draft)[
            "kill_switch_owner"
          ] as Draft
        )["status"] = "unknown";
      }),
    );
    assert.equal(invalidOwnerStatus.outcome, "invalid_review");
    assert.ok(
      invalidOwnerStatus.reason_codes.includes(
        "kill_switch_owner_status_invalid",
      ),
    );

    for (const [binding, reason] of [
      ["pricing_policy", "pricing_policy_status_invalid"],
      ["privacy_zdr_evidence", "privacy_zdr_evidence_status_invalid"],
    ] as const) {
      const result = evaluate(
        mutate((draft) => {
          ((draft["artifact_bindings"] as Draft)[binding] as Draft)["status"] =
            "unknown";
        }),
      );
      assert.equal(result.outcome, "invalid_review", binding);
      assert.ok(result.reason_codes.includes(reason), binding);
    }
  });

  it("binds decisions to the exact reviewed hashes and fails closed on stale ones", () => {
    const stale = evaluate(
      mutate((draft) => {
        const decision = approvedDecision("maria.gomez", "evidence_reviewer");
        (decision["reviewed_hashes"] as Draft)["dossier_hash"] = "1".repeat(64);
        (draft["decisions"] as Draft)["evidence_review"] = decision;
      }),
    );
    assert.equal(stale.outcome, "invalid_review");
    assert.ok(
      stale.reason_codes.includes("evidence_review_reviewed_hashes_mismatch"),
    );
  });

  it("fails closed on stale or mismatched artifact bindings", () => {
    const staleDossier = evaluate(
      mutate((draft) => {
        ((draft["artifact_bindings"] as Draft)["readiness_dossier"] as Draft)[
          "hash"
        ] = "2".repeat(64);
      }),
    );
    assert.equal(staleDossier.outcome, "invalid_review");
    assert.ok(
      staleDossier.reason_codes.includes("readiness_dossier_binding_mismatch"),
    );

    const dependencies = defaultOpenRouterSandboxActivationReviewDependencies();
    const runtime = dependencies.runtime as Draft;
    runtime["maximum_requests"] = 99;
    const driftedRuntime = evaluate(
      loadOpenRouterSandboxActivationReview(),
      dependencies,
    );
    assert.equal(driftedRuntime.outcome, "invalid_review");
    assert.ok(
      driftedRuntime.reason_codes.includes(
        "runtime_configuration_binding_mismatch",
      ),
    );

    const wrongCandidate = evaluate(
      mutate((draft) => {
        (draft["candidate"] as Draft)["capability_id"] =
          "evidence.extraction.other";
      }),
    );
    assert.ok(
      wrongCandidate.reason_codes.includes("candidate_identity_mismatch"),
    );
  });

  it("keeps pricing and privacy/ZDR fail-closed until resolved with exact hashes", () => {
    const repositoryState = evaluate(loadOpenRouterSandboxActivationReview());
    assert.ok(
      repositoryState.reason_codes.includes("pricing_policy_unresolved"),
    );
    assert.ok(
      repositoryState.reason_codes.includes("privacy_zdr_evidence_unresolved"),
    );

    const boundToFixturePricing = evaluate(
      mutate((draft) => {
        (draft["artifact_bindings"] as Draft)["pricing_policy"] = {
          status: "resolved",
          id: "live.test-fixture.v2",
          hash: "3".repeat(64),
        };
      }),
    );
    assert.ok(
      boundToFixturePricing.reason_codes.includes(
        "pricing_policy_identity_mismatch",
      ),
    );

    const phantomZdr = evaluate(
      mutate((draft) => {
        (draft["artifact_bindings"] as Draft)["privacy_zdr_evidence"] = {
          status: "resolved",
          id: "openrouter.zdr.v1",
          hash: "4".repeat(64),
        };
      }),
    );
    assert.ok(
      phantomZdr.reason_codes.includes(
        "privacy_zdr_evidence_identity_mismatch",
      ),
    );
  });

  it("fails closed when the gold case or first-run data is not synthetic", () => {
    // A drifted gold case with a stale review binding is invalid outright.
    const drifted = defaultOpenRouterSandboxActivationReviewDependencies();
    ((drifted.gold_case as Draft)["input"] as Draft)["contains_customer_data"] =
      true;
    const staleBinding = evaluate(
      loadOpenRouterSandboxActivationReview(),
      drifted,
    );
    assert.equal(staleBinding.outcome, "invalid_review");
    assert.ok(staleBinding.reason_codes.includes("gold_case_binding_mismatch"));

    // With a consistent binding to the tainted gold case, the review is
    // blocked because the gold case itself fails its synthetic contract.
    const tainted = defaultOpenRouterSandboxActivationReviewDependencies();
    const taintedGold = tainted.gold_case as Draft;
    (taintedGold["input"] as Draft)["contains_customer_data"] = true;
    taintedGold["gold_case_hash"] =
      computeOpenRouterSandboxGoldCaseHash(taintedGold);
    const boundReview = mutate((draft) => {
      ((draft["artifact_bindings"] as Draft)["gold_case"] as Draft)["hash"] =
        taintedGold["gold_case_hash"];
    });
    const invalidGold = evaluate(boundReview, tainted);
    assert.ok(invalidGold.reason_codes.includes("gold_case_invalid"));

    const nonSynthetic = evaluate(
      mutate((draft) => {
        (draft["allowed_data"] as Draft)["classification"] = "customer";
      }),
    );
    assert.ok(
      nonSynthetic.reason_codes.includes("first_run_data_not_synthetic"),
    );
  });

  it("keeps gold-case acceptance a mandatory human gate", () => {
    const repositoryState = evaluate(loadOpenRouterSandboxActivationReview());
    assert.ok(
      repositoryState.pending_human_decisions.includes(
        "gold_case_acceptance_pending",
      ),
    );
    const goldCase = loadOpenRouterSandboxGoldCase();
    assert.equal(goldCase.human_acceptance.status, "pending");
    assert.equal(goldCase.campaign_status, "prepared_not_executed");
  });

  it("enforces single-call, no-retry, no-fallback, bounded-spend ceilings", () => {
    const cases: readonly [string, (draft: Draft) => void][] = [
      [
        "request_ceiling_not_single_call",
        (draft) => ((draft["ceilings"] as Draft)["maximum_requests"] = 2),
      ],
      [
        "token_ceiling_exceeds_proposal",
        (draft) =>
          ((draft["ceilings"] as Draft)["maximum_input_tokens_per_request"] =
            9000),
      ],
      [
        "timeout_ceiling_invalid",
        (draft) => ((draft["ceilings"] as Draft)["timeout_ms"] = 20000),
      ],
      [
        "retry_policy_weakened",
        (draft) => ((draft["ceilings"] as Draft)["automatic_retries"] = 1),
      ],
      [
        "fallback_policy_weakened",
        (draft) => ((draft["ceilings"] as Draft)["fallback_enabled"] = true),
      ],
      [
        "spend_ceiling_exceeds_proposal",
        (draft) =>
          ((draft["ceilings"] as Draft)["maximum_total_spend_usd"] = "0.50"),
      ],
    ];
    for (const [reason, change] of cases) {
      const result = evaluate(mutate(change));
      assert.ok(result.reason_codes.includes(reason), reason);
      assert.ok(["blocked", "invalid_review"].includes(result.outcome), reason);
    }
  });

  it("fails closed when any execution component is already enabled", () => {
    // Never mutate the shared adapter JSON module: build cloned dependencies.
    const base = defaultOpenRouterSandboxActivationReviewDependencies();
    const enabledAdapter = {
      ...base,
      proposal_dependencies: {
        ...base.proposal_dependencies,
        adapter: {
          ...structuredClone(base.proposal_dependencies.adapter),
          enabled: true,
        },
      },
    };
    assert.ok(
      evaluate(
        loadOpenRouterSandboxActivationReview(),
        enabledAdapter,
      ).reason_codes.includes("adapter_enabled_before_eligibility"),
    );

    // Runtime drift with a stale binding is itself invalid (fail closed).
    const drifted = defaultOpenRouterSandboxActivationReviewDependencies();
    (drifted.runtime as Draft)["budget_enabled"] = true;
    const staleRuntime = evaluate(
      loadOpenRouterSandboxActivationReview(),
      drifted,
    );
    assert.equal(staleRuntime.outcome, "invalid_review");
    assert.ok(
      staleRuntime.reason_codes.includes(
        "runtime_configuration_binding_mismatch",
      ),
    );

    // With a consistent runtime binding, the enabled component surfaces as
    // its dedicated blocked reason.
    const withRuntime = (
      change: (runtime: Draft) => void,
    ): { review: Draft; deps: typeof base } => {
      const deps = defaultOpenRouterSandboxActivationReviewDependencies();
      change(deps.runtime as Draft);
      const review = mutate((draft) => {
        (
          (draft["artifact_bindings"] as Draft)[
            "runtime_configuration"
          ] as Draft
        )["hash"] = computeOpenRouterSandboxRuntimeHash(deps.runtime);
      });
      return { review, deps };
    };
    const budget = withRuntime((runtime) => {
      runtime["budget_enabled"] = true;
    });
    assert.ok(
      evaluate(budget.review, budget.deps).reason_codes.includes(
        "live_budget_enabled_before_eligibility",
      ),
    );
    const killSwitch = withRuntime((runtime) => {
      (runtime["kill_switch"] as Draft)["active"] = false;
    });
    assert.ok(
      evaluate(killSwitch.review, killSwitch.deps).reason_codes.includes(
        "kill_switch_not_active",
      ),
    );
  });

  it("rejects undefined or repository-based secret handling", () => {
    const repositoryBased = evaluate(
      mutate((draft) => {
        (draft["secret_management_plan"] as Draft)["storage"] =
          "repository_config_file";
      }),
    );
    assert.ok(
      repositoryBased.reason_codes.includes(
        "secret_plan_undefined_or_repository_based",
      ),
    );
    const unnamedPlan = evaluate(
      mutate((draft) => {
        (draft["secret_management_plan"] as Draft)["reference"] = "";
      }),
    );
    assert.ok(
      unnamedPlan.reason_codes.includes(
        "secret_plan_undefined_or_repository_based",
      ),
    );
  });

  it("requires the routing limitation acknowledgment to match the proposal", () => {
    const mismatch = evaluate(
      mutate((draft) => {
        (draft["routing_acknowledgment"] as Draft)[
          "exact_upstream_route_status"
        ] = "verified";
      }),
    );
    assert.equal(mismatch.outcome, "invalid_review");
    assert.ok(
      mismatch.reason_codes.includes("routing_acknowledgment_mismatch"),
    );
  });

  it("contains no secrets, tokens, or endpoint literals in the governed artifacts", () => {
    for (const path of [
      "config/ai-openrouter-sandbox-activation-review.json",
      "config/ai-openrouter-sandbox-gold-case.json",
    ]) {
      const serialized = readFileSync(resolve(root, path), "utf8");
      for (const forbidden of [
        /sk-or-/i,
        /Bearer\s/i,
        /openrouter\.ai/,
        /https?:\/\//,
        /authorization_token/i,
      ])
        assert.doesNotMatch(serialized, forbidden, path);
    }
  });
});
