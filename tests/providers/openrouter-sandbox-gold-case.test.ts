import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  computeOpenRouterFirstRunFixtureHash,
  computeOpenRouterSandboxGoldCaseHash,
  evaluateOpenRouterSandboxGoldCase,
  loadOpenRouterFirstRunFixture,
  loadOpenRouterSandboxGoldCase,
  scoreOpenRouterGoldCaseObservation,
  type OpenRouterGoldCaseObservation,
  type OpenRouterSandboxGoldCase,
} from "../../src/providers/openrouter-sandbox-gold-case.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const AT = new Date("2026-07-15T12:00:00.000Z");

const rehash = (value: Record<string, unknown>): Record<string, unknown> => ({
  ...value,
  gold_case_hash: computeOpenRouterSandboxGoldCaseHash(value),
});
const mutate = (
  change: (draft: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const draft = structuredClone(
    loadOpenRouterSandboxGoldCase(),
  ) as unknown as Record<string, unknown>;
  change(draft);
  return rehash(draft);
};

const passingObservation = (): OpenRouterGoldCaseObservation => ({
  observed_provider_id: "openrouter",
  observed_model_id: "minimax/minimax-m2.7",
  structured_output: {
    claims: [
      {
        claim_id: "claim-1",
        claim:
          "The fictional rule requires blue sample boxes to display the lot code on the front panel.",
        evidence:
          "requires blue sample boxes to display the lot code on the front panel",
      },
      {
        claim_id: "claim-2",
        claim: "The fictional rule applies from 1 September 2030.",
        evidence: "applies from 1 September 2030",
      },
    ],
    uncertainty:
      "The rule does not specify enforcement, penalties, or any authority.",
  },
  usage_metadata_present: true,
  cost_metadata: { total_usd_micro: "1500" },
  latency_ms: 1200,
  timed_out: false,
  automatic_retries_used: 0,
  fallback_used: false,
});

describe("OpenRouter sandbox synthetic gold case", () => {
  it("validates the repository gold case against its versioned JSON Schema", () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(
      load("schemas/ai-openrouter-sandbox-gold-case.schema.json"),
    );
    assert.equal(
      validate(load("config/ai-openrouter-sandbox-gold-case.json")),
      true,
      JSON.stringify(validate.errors),
    );
  });

  it("evaluates the repository state as prepared, not executed, acceptance pending", () => {
    const first = evaluateOpenRouterSandboxGoldCase(
      loadOpenRouterSandboxGoldCase(),
      AT,
    );
    const second = evaluateOpenRouterSandboxGoldCase(
      loadOpenRouterSandboxGoldCase(),
      AT,
    );
    assert.deepEqual(first, second);
    assert.ok(Object.isFrozen(first));
    assert.equal(first.outcome, "prepared_pending_acceptance");
    assert.equal(first.campaign_status, "prepared_not_executed");
    assert.equal(first.acceptance_status, "pending");
    assert.deepEqual(first.reason_codes, ["gold_case_acceptance_pending"]);
    assert.equal(first.execution_performed, false);
    assert.equal(first.provider_call_performed, false);
  });

  it("binds the permitted synthetic repository fixture by identity and hash", () => {
    const goldCase = loadOpenRouterSandboxGoldCase();
    const fixture = loadOpenRouterFirstRunFixture() as Record<string, unknown>;
    assert.equal(goldCase.fixture_binding.fixture_id, fixture["fixture_id"]);
    assert.equal(
      goldCase.fixture_binding.fixture_hash,
      computeOpenRouterFirstRunFixtureHash(fixture),
    );
    assert.equal(goldCase.input.source_text.includes("fictional"), true);
    const tamperedFixture = { ...fixture, classification: "customer" };
    const result = evaluateOpenRouterSandboxGoldCase(
      loadOpenRouterSandboxGoldCase(),
      AT,
      tamperedFixture,
    );
    assert.equal(result.outcome, "invalid_gold_case");
    assert.ok(result.reason_codes.includes("fixture_hash_mismatch"));
  });

  it("detects tampering through the canonical content hash", () => {
    const tampered = structuredClone(
      loadOpenRouterSandboxGoldCase(),
    ) as unknown as Record<string, unknown>;
    (tampered["input"] as Record<string, unknown>)["source_text"] =
      "Altered synthetic text.";
    const result = evaluateOpenRouterSandboxGoldCase(tampered, AT);
    assert.equal(result.outcome, "invalid_gold_case");
    assert.ok(result.reason_codes.includes("gold_case_hash_mismatch"));
  });

  it("fails closed on fabricated execution results and unsupported campaign states", () => {
    const fabricated = mutate((draft) => {
      draft["execution_results"] = [{ score: 1 }];
    });
    const fabricatedResult = evaluateOpenRouterSandboxGoldCase(fabricated, AT);
    assert.equal(fabricatedResult.outcome, "invalid_gold_case");
    assert.ok(
      fabricatedResult.reason_codes.includes(
        "fabricated_execution_result_forbidden",
      ),
    );
    const executed = mutate((draft) => {
      draft["campaign_status"] = "executed";
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(executed, AT).reason_codes.includes(
        "unsupported_campaign_status",
      ),
    );
  });

  it("fails closed on non-synthetic or restricted content", () => {
    const personal = mutate((draft) => {
      (draft["input"] as Record<string, unknown>)["contains_personal_data"] =
        true;
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(personal, AT).reason_codes.includes(
        "contains_personal_data_forbidden",
      ),
    );
    const nonSynthetic = mutate((draft) => {
      draft["classification"] = "production";
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(nonSynthetic, AT).reason_codes.includes(
        "non_synthetic_classification",
      ),
    );
    const leaking = mutate((draft) => {
      (draft["input"] as Record<string, unknown>)["source_text"] =
        "A fictional rule with an api_key inside.";
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(leaking, AT).reason_codes.includes(
        "restricted_content_forbidden",
      ),
    );
  });

  it("fails closed when scoring determinism or run restrictions are weakened", () => {
    const nonDeterministic = mutate((draft) => {
      (draft["acceptance_contract"] as Record<string, unknown>)[
        "scoring_method"
      ] = "llm_judge_v1";
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(
        nonDeterministic,
        AT,
      ).reason_codes.includes("non_deterministic_scoring_forbidden"),
    );
    const retries = mutate((draft) => {
      (draft["acceptance_contract"] as Record<string, unknown>)[
        "maximum_automatic_retries"
      ] = 1;
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(retries, AT).reason_codes.includes(
        "retry_or_fallback_weakened",
      ),
    );
    const publication = mutate((draft) => {
      (draft["usage_restrictions"] as Record<string, unknown>)[
        "automatic_downstream_publication_prohibited"
      ] = false;
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(publication, AT).reason_codes.includes(
        "usage_restrictions_weakened",
      ),
    );
  });

  it("rejects acceptance decisions without reviewer identity, reason, or matching hash", () => {
    const goldCase = loadOpenRouterSandboxGoldCase();
    const anonymous = mutate((draft) => {
      draft["human_acceptance"] = {
        status: "approved",
        reviewer_id: null,
        reviewer_role: "evidence_reviewer",
        decided_at: "2026-07-15T10:00:00.000Z",
        reason: "Scoring method reviewed.",
        accepted_gold_case_hash: goldCase.gold_case_hash,
      };
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(anonymous, AT).reason_codes.includes(
        "acceptance_decision_malformed",
      ),
    );
    const staleHash = mutate((draft) => {
      draft["human_acceptance"] = {
        status: "approved",
        reviewer_id: "maria.gomez",
        reviewer_role: "evidence_reviewer",
        decided_at: "2026-07-15T10:00:00.000Z",
        reason: "Scoring method reviewed.",
        accepted_gold_case_hash: "0".repeat(64),
      };
    });
    assert.ok(
      evaluateOpenRouterSandboxGoldCase(staleHash, AT).reason_codes.includes(
        "acceptance_hash_mismatch",
      ),
    );
  });

  describe("deterministic acceptance scoring", () => {
    const goldCase = loadOpenRouterSandboxGoldCase();

    it("replays identically and accepts a fully conforming synthetic observation", () => {
      const first = scoreOpenRouterGoldCaseObservation(
        goldCase,
        passingObservation(),
      );
      const second = scoreOpenRouterGoldCaseObservation(
        goldCase,
        passingObservation(),
      );
      assert.deepEqual(first, second);
      assert.ok(Object.isFrozen(first));
      assert.equal(first.outcome, "candidate_result_for_human_review");
      assert.deepEqual(first.reason_codes, []);
      assert.deepEqual(first.required_claim_recall, {
        matched: 2,
        required: 2,
      });
      assert.equal(first.unsupported_claim_count, 0);
      assert.equal(first.human_acceptance_granted, false);
    });

    it("rejects deterministically on every acceptance criterion", () => {
      const cases: readonly [string, Partial<OpenRouterGoldCaseObservation>][] =
        [
          ["output_schema_invalid", { structured_output: { claims: "x" } }],
          [
            "required_claim_missing",
            {
              structured_output: {
                claims: [
                  {
                    claim_id: "claim-1",
                    claim: "Unrelated claim",
                    evidence: "applies from 1 September 2030",
                  },
                  {
                    claim_id: "claim-2",
                    claim: "The fictional rule applies from 1 September 2030.",
                    evidence: "applies from 1 September 2030",
                  },
                ],
                uncertainty: "The rule does not specify penalties.",
              },
            },
          ],
          [
            "unsupported_claim_present",
            {
              structured_output: {
                ...(passingObservation().structured_output as Record<
                  string,
                  unknown
                >),
                claims: [
                  ...((
                    passingObservation().structured_output as {
                      claims: unknown[];
                    }
                  ).claims as Record<string, unknown>[]),
                  {
                    claim_id: "claim-3",
                    claim: "Green boxes are also covered.",
                    evidence: "green boxes are covered by the rule",
                  },
                ],
              },
            },
          ],
          [
            "uncertainty_disclosure_missing",
            {
              structured_output: {
                ...(passingObservation().structured_output as Record<
                  string,
                  unknown
                >),
                uncertainty: "Everything is fully specified.",
              },
            },
          ],
          [
            "prohibited_conclusion_present",
            {
              structured_output: {
                ...(passingObservation().structured_output as Record<
                  string,
                  unknown
                >),
                uncertainty:
                  "The rule does not specify penalties. This is legal advice: red sample boxes must comply.",
              },
            },
          ],
          ["provider_identity_mismatch", { observed_provider_id: "minimax" }],
          [
            "model_identity_mismatch",
            { observed_model_id: "minimax/minimax-m2.6" },
          ],
          ["usage_metadata_missing", { usage_metadata_present: false }],
          [
            "cost_metadata_incompatible",
            { cost_metadata: { total_usd_micro: "60000" } },
          ],
          ["cost_metadata_incompatible", { cost_metadata: null }],
          ["latency_ceiling_exceeded", { latency_ms: 10001 }],
          ["timeout_observed", { timed_out: true }],
          ["automatic_retry_forbidden", { automatic_retries_used: 1 }],
          ["fallback_forbidden", { fallback_used: true }],
        ];
      for (const [reason, override] of cases) {
        const score = scoreOpenRouterGoldCaseObservation(goldCase, {
          ...passingObservation(),
          ...override,
        });
        assert.equal(score.outcome, "rejected_result", reason);
        assert.ok(score.reason_codes.includes(reason), reason);
        assert.equal(score.human_acceptance_granted, false, reason);
      }
    });

    it("never mutates the gold case and never grants acceptance", () => {
      const before = structuredClone(goldCase) as OpenRouterSandboxGoldCase;
      scoreOpenRouterGoldCaseObservation(goldCase, passingObservation());
      assert.deepEqual(goldCase, before);
      const repositoryState = evaluateOpenRouterSandboxGoldCase(
        loadOpenRouterSandboxGoldCase(),
        AT,
      );
      assert.equal(repositoryState.acceptance_status, "pending");
    });
  });
});
