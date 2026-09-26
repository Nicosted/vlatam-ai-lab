/**
 * AI-144 — type declarations for the repository-owned direct option-logit
 * method fixture adapter (`direct-logit-method-adapter.mjs`), so tests can
 * exercise its pure method in-process. Declarations only: no code.
 */

import type {
  TypedDecisionRequest,
  TypedDecisionResult,
} from "../../decision/contracts.js";

export interface DirectLogitMethodLogit {
  readonly candidate_id: string;
  readonly logit_micros: number;
}

export interface DirectLogitMethodFixture {
  readonly contract: "typed_decision_synthetic_logit_fixture";
  readonly schema_version: string;
  readonly fixture_id: string;
  readonly provenance: "repository_owned_synthetic";
  readonly model_output: false;
  readonly request_binding: {
    readonly capability_id: string;
    readonly semantic_request_hash: string;
    readonly request_hashes: readonly string[];
  };
  readonly logit_unit: "micro_logit";
  readonly candidate_logits: readonly DirectLogitMethodLogit[];
  readonly fixture_hash: string;
}

export type DirectLogitMethodRefusal =
  | "candidate_count_unsupported"
  | "candidate_duplicate"
  | "candidate_id_invalid"
  | "decision_type_unsupported"
  | "fixture_unbound"
  | "logit_duplicate"
  | "logit_invalid"
  | "logit_missing"
  | "logit_unknown_candidate"
  | "normalization_failed"
  | "top_logit_tie";

export interface DirectLogitReadout {
  readonly ok: true;
  readonly selected_candidate_id: string;
  readonly selected_probability_micros: number;
  readonly entries: readonly {
    readonly candidate_id: string;
    readonly probability_micros: number;
  }[];
}

export type DirectLogitMethodOutcome<T> =
  | T
  | { readonly ok: false; readonly code: DirectLogitMethodRefusal };

export declare const DIRECT_LOGIT_METHOD: Readonly<{
  min_candidates: 2;
  max_candidates: 16;
  logit_micros_scale: 1_000_000;
  max_abs_logit_micros: 100_000_000;
  probability_micros_scale: 1_000_000;
}>;

export declare const EXIT_CODES: Readonly<{
  input_invalid: 2;
  fixture_unbound: 3;
  environment_refused: 4;
  method_refused: 5;
  top_logit_tie: 6;
}>;

export declare const SYNTHETIC_LOGIT_FIXTURES: readonly DirectLogitMethodFixture[];

export declare function readoutDirectOptionLogits(
  candidateIds: unknown,
  logits: unknown,
): DirectLogitMethodOutcome<DirectLogitReadout>;

export declare function findSyntheticLogitFixture(
  requestHash: string,
): DirectLogitMethodFixture | null;

export declare function buildDirectLogitChoiceResult(
  request: TypedDecisionRequest,
  requestHash: string,
  fixture: DirectLogitMethodFixture | null,
): DirectLogitMethodOutcome<{
  readonly ok: true;
  readonly result: TypedDecisionResult;
}>;
