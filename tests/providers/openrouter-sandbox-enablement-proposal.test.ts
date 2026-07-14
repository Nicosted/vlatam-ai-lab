import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import approvalFixture from "../../config/ai-openrouter-sandbox-configuration-approval.json" with { type: "json" };
import proposalFixture from "../../config/ai-openrouter-sandbox-enablement-proposal.json" with { type: "json" };
import approvalSchema from "../../schemas/ai-openrouter-sandbox-configuration-approval.schema.json" with { type: "json" };
import proposalSchema from "../../schemas/ai-openrouter-sandbox-enablement-proposal.schema.json" with { type: "json" };
import {
  computeOpenRouterSandboxProposalHash,
  defaultOpenRouterSandboxProposalDependencies,
  evaluateOpenRouterSandboxEnablementProposal,
  type OpenRouterSandboxConfigurationApproval,
  type OpenRouterSandboxEnablementProposal,
  type OpenRouterSandboxProposalDependencies,
} from "../../src/providers/openrouter-sandbox-enablement-proposal.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const NOW = new Date("2026-07-14T23:30:00.000Z");
const clone = <T>(value: T): T => structuredClone(value);
// Test mutations intentionally exercise values outside the readonly contracts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MutableFixture = any;
const fixture = proposalFixture as OpenRouterSandboxEnablementProposal;

function rehash(proposal: OpenRouterSandboxEnablementProposal): void {
  (proposal as { proposal_hash: string }).proposal_hash =
    computeOpenRouterSandboxProposalHash(proposal);
}

function evaluate(
  proposal = fixture,
  dependencies = defaultOpenRouterSandboxProposalDependencies(),
  now = NOW,
) {
  return evaluateOpenRouterSandboxEnablementProposal(
    proposal,
    now,
    dependencies,
  );
}

function mutableDependencies(): OpenRouterSandboxProposalDependencies {
  return clone(defaultOpenRouterSandboxProposalDependencies());
}

function approved(
  proposal: OpenRouterSandboxEnablementProposal,
): OpenRouterSandboxConfigurationApproval {
  return {
    ...clone(approvalFixture),
    status: "approved",
    reviewer_id: "human.reviewer.one",
    decision: "approve",
    reason:
      "Configuration proposal reviewed; execution and secrets remain unauthorized.",
    decided_at: "2026-07-14T23:10:00.000Z",
    expires_at: "2026-07-20T00:00:00.000Z",
    reviewed_hashes: {
      proposal_hash: proposal.proposal_hash,
      dossier_hash: proposal.readiness_binding.dossier_hash,
      evidence_pack_hash: proposal.evidence_pack_binding.pack_hash,
    },
  } as OpenRouterSandboxConfigurationApproval;
}

function proposalAwaitingApprovedDecision(): OpenRouterSandboxEnablementProposal {
  const proposal = clone(fixture);
  (
    proposal.approval_binding as {
      observed_state: "pending" | "approved" | "rejected";
    }
  ).observed_state = "approved";
  rehash(proposal);
  return proposal;
}

describe("OpenRouter sandbox-enablement proposal", () => {
  it("validates the proposal and separate approval artifacts against strict schemas", () => {
    const ajv = new Ajv({ strict: true, allErrors: true });
    addFormats(ajv);
    for (const [schema, value] of [
      [proposalSchema, proposalFixture],
      [approvalSchema, approvalFixture],
    ] as const) {
      const validate = ajv.compile(schema);
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
    }
  });

  it("registers both contracts with their fixtures and focused tests", () => {
    const registry = JSON.parse(
      readFileSync("schemas/schema-registry.json", "utf8"),
    ) as {
      contracts: {
        contract_name: string;
        valid_fixture: string;
        test_file: string;
      }[];
    };
    for (const contractName of [
      "ai_openrouter_sandbox_enablement_proposal",
      "ai_openrouter_sandbox_configuration_approval",
    ]) {
      const entry = registry.contracts.find(
        (contract) => contract.contract_name === contractName,
      );
      assert.ok(entry);
      assert.match(entry.valid_fixture, /config\/ai-openrouter-sandbox-/);
      assert.equal(
        entry.test_file,
        "tests/providers/openrouter-sandbox-enablement-proposal.test.ts",
      );
    }
  });

  it("keeps the repository proposal blocked and non-authorizing", () => {
    const result = evaluate();
    assert.equal(result.outcome, "blocked");
    for (const reason of [
      "readiness_blocked",
      "mandatory_evidence_not_reviewable",
      "exact_upstream_routing_unresolved",
      "privacy_zdr_unresolved",
      "pricing_unbounded_or_conflicting",
      "benchmark_or_gold_case_missing",
      "legal_review_pending",
      "security_review_pending",
      "human_approval_missing",
    ])
      assert.ok(result.reason_codes.includes(reason), reason);
    assert.equal(result.configuration_authorized, false);
    assert.equal(result.execution_authorized, false);
    assert.equal(result.secret_access_authorized, false);
    assert.equal(result.provider_call_performed, false);
  });

  it("fails closed on blocked readiness, unverified evidence, and conflicting pricing", () => {
    const result = evaluate();
    assert.ok(result.reason_codes.includes("readiness_blocked"));
    assert.ok(result.reason_codes.includes("evidence_unverified"));
    assert.ok(result.reason_codes.includes("pricing_unbounded_or_conflicting"));
  });

  for (const [name, mutate, reason] of [
    [
      "dossier hash mismatch",
      (p: MutableFixture) =>
        (p.readiness_binding.dossier_hash = "a".repeat(64)),
      "dossier_binding_mismatch",
    ],
    [
      "evidence-pack hash mismatch",
      (p: MutableFixture) =>
        (p.evidence_pack_binding.pack_hash = "a".repeat(64)),
      "evidence_pack_binding_mismatch",
    ],
    [
      "unbounded budget",
      (p: MutableFixture) => (p.sandbox_controls.maximum_total_spend_usd = ""),
      "unbounded_budget",
    ],
    [
      "privacy and ZDR unresolved",
      (p: MutableFixture) => (p.privacy_requirements.zdr_required = false),
      "privacy_zdr_unresolved",
    ],
    [
      "routing constraint unresolved",
      (p: MutableFixture) => (p.routing_constraints.provider_order = []),
      "exact_upstream_routing_unresolved",
    ],
    [
      "missing benchmark or gold case approval",
      (p: MutableFixture) =>
        (p.review_requirements.capability_benchmark_approved = false),
      "benchmark_or_gold_case_missing",
    ],
    [
      "legal review pending",
      (p: MutableFixture) => (p.review_requirements.legal_review = "pending"),
      "legal_review_pending",
    ],
    [
      "security review pending",
      (p: MutableFixture) =>
        (p.review_requirements.security_review = "pending"),
      "security_review_pending",
    ],
    [
      "fallback enabled",
      (p: MutableFixture) => (p.sandbox_controls.fallback_enabled = true),
      "fallback_enabled",
    ],
    [
      "automatic retries enabled",
      (p: MutableFixture) => (p.sandbox_controls.automatic_retries = 1),
      "automatic_retries_enabled",
    ],
    [
      "non-manual invocation",
      (p: MutableFixture) => (p.sandbox_controls.invocation_mode = "automatic"),
      "manual_invocation_required",
    ],
    [
      "budget above reviewed ceiling",
      (p: MutableFixture) => (p.sandbox_controls.maximum_requests = 11),
      "budget_exceeds_reviewed_ceiling",
    ],
  ] as const) {
    it(name, () => {
      const proposal = clone(fixture);
      mutate(proposal);
      rehash(proposal);
      assert.ok(evaluate(proposal).reason_codes.includes(reason), reason);
    });
  }

  it("rejects a missing or invalid expiry", () => {
    for (const expiry of ["", "not-a-date"]) {
      const proposal = clone(fixture);
      (proposal as { expires_at: string }).expires_at = expiry;
      rehash(proposal);
      const result = evaluate(proposal);
      assert.equal(result.outcome, "invalid_proposal");
      assert.ok(result.reason_codes.includes("invalid_expiry"));
    }
  });

  it("rejects a proposed profile identity mismatch", () => {
    const dependencies = mutableDependencies();
    const profiles = dependencies.profiles as unknown as {
      profile_id: string;
      model_id: string;
    }[];
    profiles.find(
      (profile) =>
        profile.profile_id === fixture.candidate.execution_profile_id,
    )!.model_id = "other/model";
    assert.ok(
      evaluate(fixture, dependencies).reason_codes.includes(
        "profile_identity_mismatch",
      ),
    );
  });

  it("fails closed for profile fallback, retries, invocation, and budget weakening", () => {
    for (const [field, value, reason] of [
      ["fallback_enabled", true, "fallback_enabled"],
      ["automatic_retries", 1, "automatic_retries_enabled"],
      ["invocation_mode", "automatic", "manual_invocation_required"],
      ["maximum_requests", 11, "profile_budget_exceeds_proposal"],
    ] as const) {
      const dependencies = mutableDependencies();
      const profile = dependencies.profiles.find(
        (item) => item.profile_id === fixture.candidate.execution_profile_id,
      )!;
      (profile.sandbox_controls as unknown as Record<string, unknown>)[field] =
        value;
      assert.ok(
        evaluate(fixture, dependencies).reason_codes.includes(reason),
        reason,
      );
    }
  });

  it("rejects a weakened profile timeout or output ceiling", () => {
    for (const [field, value] of [
      ["timeout_ms", 10_001],
      ["max_output_tokens", 2_001],
    ] as const) {
      const dependencies = mutableDependencies();
      const profile = dependencies.profiles.find(
        (item) => item.profile_id === fixture.candidate.execution_profile_id,
      )!;
      (profile.configuration as unknown as Record<string, unknown>)[field] =
        value;
      assert.ok(
        evaluate(fixture, dependencies).reason_codes.includes(
          "profile_ceiling_weakened",
        ),
      );
    }
  });

  it("rejects weakened profile routing or ZDR controls", () => {
    for (const [field, value] of [
      ["provider_order", []],
      ["zdr_required", false],
      ["data_collection", "allow"],
    ] as const) {
      const dependencies = mutableDependencies();
      const profile = dependencies.profiles.find(
        (item) => item.profile_id === fixture.candidate.execution_profile_id,
      )!;
      (profile.sandbox_controls as unknown as Record<string, unknown>)[field] =
        value;
      assert.ok(
        evaluate(fixture, dependencies).reason_codes.includes(
          "profile_routing_or_privacy_weakened",
        ),
      );
    }
  });

  it("rejects missing reviewer and self-approval", () => {
    for (const [reviewer, reason] of [
      [null, "approval_reviewer_missing"],
      [fixture.created_by, "self_approval_forbidden"],
    ] as const) {
      const proposal = proposalAwaitingApprovedDecision();
      const dependencies = mutableDependencies();
      const approval = approved(proposal) as unknown as {
        reviewer_id: string | null;
      };
      approval.reviewer_id = reviewer;
      (
        dependencies as { approval: OpenRouterSandboxConfigurationApproval }
      ).approval = approval as OpenRouterSandboxConfigurationApproval;
      assert.ok(
        evaluate(proposal, dependencies).reason_codes.includes(reason),
        reason,
      );
    }
  });

  it("rejects approval scope mismatch, expiry, and tampered reviewed hashes", () => {
    for (const [mutate, reason] of [
      [
        (a: MutableFixture) => (a.scope = "execution"),
        "approval_scope_mismatch",
      ],
      [
        (a: MutableFixture) => (a.expires_at = "2026-07-14T23:00:00.000Z"),
        "approval_expired",
      ],
      [
        (a: MutableFixture) =>
          (a.reviewed_hashes.proposal_hash = "a".repeat(64)),
        "approval_reviewed_hashes_mismatch",
      ],
    ] as const) {
      const proposal = proposalAwaitingApprovedDecision();
      const dependencies = mutableDependencies();
      const approval = approved(proposal);
      mutate(approval);
      (
        dependencies as { approval: OpenRouterSandboxConfigurationApproval }
      ).approval = approval;
      assert.ok(
        evaluate(proposal, dependencies).reason_codes.includes(reason),
        reason,
      );
    }
  });

  it("is deterministic and deeply immutable", () => {
    const first = evaluate();
    const second = evaluate();
    assert.deepEqual(first, second);
    assert.ok(Object.isFrozen(first));
    assert.ok(Object.isFrozen(first.reason_codes));
  });

  it("keeps profile, adapter, registry, and route disabled", () => {
    const dependencies = defaultOpenRouterSandboxProposalDependencies();
    const profile = dependencies.profiles.find(
      (item) => item.profile_id === fixture.candidate.execution_profile_id,
    )!;
    assert.equal(profile.enabled, false);
    assert.equal(profile.sandbox_controls!.adapter_enabled, false);
    assert.equal(dependencies.adapter.enabled, false);
    assert.ok(dependencies.model_entries.every((item) => !item.enabled));
    assert.ok(
      dependencies.routes.every(
        (item) =>
          !item.enabled &&
          !item.allow_fallbacks &&
          item.fallback_model_entry_order.length === 0,
      ),
    );
  });

  it("contains no secret value, environment, network, gateway, adapter execution, authorization, or persistence access", () => {
    const source = readFileSync(
      "src/providers/openrouter-sandbox-enablement-proposal.ts",
      "utf8",
    );
    const artifacts = [
      readFileSync(
        "config/ai-openrouter-sandbox-enablement-proposal.json",
        "utf8",
      ),
      readFileSync(
        "config/ai-openrouter-sandbox-configuration-approval.json",
        "utf8",
      ),
      readFileSync("config/ai-execution-profiles.json", "utf8"),
    ].join("\n");
    assert.doesNotMatch(
      source,
      /process\.env|\bfetch\s*\(|createOpenRouterFetchTransport|MultiProviderGateway|consumeAuthorization|authorization-store|migration|database/i,
    );
    assert.doesNotMatch(
      artifacts,
      /sk-or-|Bearer\s|OPENROUTER_API_KEY|AI_LAB_OPENROUTER_ENABLED/,
    );
    assert.match(artifacts, /"execution_authorized": false/);
    assert.match(artifacts, /"provider_call_performed": false/);
  });
});
