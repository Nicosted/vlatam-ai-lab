import { readFileSync, readdirSync } from "node:fs";

import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionResultHash,
  computeTypedDecisionSemanticRequestHash,
  type TypedDecisionPayload,
  type TypedDecisionResult,
} from "../../src/decision/index.js";
import {
  computeGoldDecisionCaseHash,
  computeGoldDecisionSetHash,
  type GoldDecisionCase,
  type GoldDecisionSet,
} from "../../src/decision-evaluation/index.js";

export const SEED_ROOT = "data/gold-decision/v1";
export const FIXTURE_ROOT = "data/fixtures/gold-decision";
export const TYPED_FIXTURES = "data/fixtures/typed-decision";

export const load = <T = Record<string, unknown>>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
export const clone = <T>(value: T): T => structuredClone(value);

export function loadSet(root: string): {
  manifest: GoldDecisionSet;
  cases: GoldDecisionCase[];
} {
  const manifest = load<GoldDecisionSet>(`${root}/manifest.json`);
  const cases = readdirSync(`${root}/cases`)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => load<GoldDecisionCase>(`${root}/cases/${name}`));
  return { manifest, cases };
}

export const seed = () => loadSet(SEED_ROOT);
export const fixtureSet = () => loadSet(FIXTURE_ROOT);

export function seedCase(caseId: string): GoldDecisionCase {
  return load<GoldDecisionCase>(`${SEED_ROOT}/cases/${caseId}.json`);
}

/** Recomputes the case self-hash so a mutation is tested on its own merits. */
export function rehashCase<T extends object>(value: T): T {
  const copy = { ...value } as Record<string, unknown>;
  try {
    copy["case_hash"] = computeGoldDecisionCaseHash(
      copy as unknown as GoldDecisionCase,
    );
  } catch {
    // Non-canonicalizable values must be reported on their own.
  }
  return copy as T;
}

/** Recomputes the manifest self-hash. */
export function rehashSet<T extends object>(value: T): T {
  const copy = { ...value } as Record<string, unknown>;
  try {
    copy["dataset_hash"] = computeGoldDecisionSetHash(
      copy as unknown as GoldDecisionSet,
    );
  } catch {
    // Non-canonicalizable values must be reported on their own.
  }
  return copy as T;
}

export function codes(check: {
  ok: boolean;
  issues?: readonly { code: string }[];
}): string[] {
  return check.ok
    ? []
    : [...new Set((check.issues ?? []).map((issue) => issue.code))].sort();
}

type ResultShape =
  | {
      status: "succeeded";
      decision: TypedDecisionPayload;
      confidence_micros?: number;
    }
  | {
      status: "abstained";
      reason_code?:
        | "insufficient_confidence"
        | "insufficient_evidence"
        | "ambiguous"
        | "unsupported_input"
        | "policy_blocked";
    }
  | { status: "blocked" }
  | { status: "failed" };

/**
 * Builds a synthetic AI-140 result fixture correctly bound to the case's
 * exact request. Tests use it to represent "an already-existing
 * TypedDecisionResult"; nothing here executes a candidate.
 */
export function syntheticResult(
  goldCase: GoldDecisionCase,
  shape: ResultShape,
  resultId = `${goldCase.case_id}-result`,
): TypedDecisionResult {
  const request = goldCase.request;
  const base = {
    contract: "typed_decision_result" as const,
    schema_version: "1.0.0",
    result_id: resultId,
    result_origin: "synthetic_fixture" as const,
    request_binding: {
      request_id: request.request_id,
      capability_id: request.capability_id,
      request_hash: computeTypedDecisionRequestHash(request),
      semantic_request_hash: computeTypedDecisionSemanticRequestHash(request),
    },
    execution_paradigm: "typed_decision" as const,
    decision_type: request.decision_type,
    status: shape.status,
    decision: shape.status === "succeeded" ? shape.decision : null,
    confidence:
      shape.status === "succeeded" && shape.confidence_micros !== undefined
        ? {
            confidence_micros: shape.confidence_micros,
            semantics: "uncalibrated_candidate_reported" as const,
            calibration_ref: null,
          }
        : null,
    abstention:
      shape.status === "abstained"
        ? { reason_code: shape.reason_code ?? "insufficient_evidence" }
        : null,
    block:
      shape.status === "blocked"
        ? { reason_code: "execution_unavailable" as const }
        : null,
    failure:
      shape.status === "failed"
        ? { reason_code: "execution_error" as const }
        : null,
    escalation: {
      recommendation: "none" as const,
      executed: false as const,
      governed_policy_ref: null,
    },
    governance: {
      human_review_required: request.policy.human_review_required,
      downstream_allowed: false as const,
      approval_state: request.policy.human_review_required
        ? ("pending" as const)
        : ("not_required" as const),
    },
    evidence_refs: [],
  };
  return {
    ...base,
    result_hash: computeTypedDecisionResultHash(base),
  } as TypedDecisionResult;
}

/** Re-signs a mutated result's self-hash. */
export function rehashResult<T extends object>(value: T): T {
  const copy = { ...value } as Record<string, unknown>;
  copy["result_hash"] = computeTypedDecisionResultHash(
    copy as unknown as TypedDecisionResult,
  );
  return copy as T;
}

/** The correct succeeded decision for a case with a typed answer key. */
export function correctDecision(
  goldCase: GoldDecisionCase,
): TypedDecisionPayload {
  const expected = goldCase.expected;
  switch (expected.kind) {
    case "choice":
      return {
        kind: "choice",
        selected_candidate_id: expected.expected_candidate_id,
        distribution: null,
      };
    case "boolean":
      return {
        kind: "boolean",
        value: expected.expected_value,
        probability_true_micros: null,
      };
    case "score":
      return {
        kind: "score",
        scale_id: expected.scale_id,
        value:
          expected.match === "exact"
            ? expected.expected_value
            : expected.acceptable_minimum,
      };
    case "ranking":
      return {
        kind: "ranking",
        ordered_candidate_ids: expected.expected_order,
      };
    case "abstention":
      throw new Error("abstention-required cases have no correct decision");
  }
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
