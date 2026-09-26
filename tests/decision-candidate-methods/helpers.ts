import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import type {
  CandidateAdapterEvidencePack,
  CandidateAdapterSpec,
  SyntheticLogitFixture,
} from "../../src/decision-candidate-methods/index.js";
import {
  computeDecisionCandidateHash,
  type DecisionCandidateEntry,
} from "../../src/decision-candidates/index.js";
import type { TypedDecisionRequest } from "../../src/decision/contracts.js";

export const METHOD_DATA_ROOT = "data/decision-candidate-methods/v1";
export const SPEC_PATH = `${METHOD_DATA_ROOT}/semif-direct-logit/adapter-spec.json`;
export const PACK_PATH = `${METHOD_DATA_ROOT}/semif-direct-logit/evidence-pack.json`;
export const LOGIT_ROOT = `${METHOD_DATA_ROOT}/synthetic-logits`;
export const METHOD_FIXTURE_ROOT = "data/fixtures/decision-candidate-methods";
export const REQUEST_ROOT = `${METHOD_FIXTURE_ROOT}/requests`;
export const SEMIF_ENTRY_PATH =
  "data/decision-candidates/v1/candidates/tdc-theoleecj-semif.json";
export const METHOD_ARTIFACT_PATH =
  "src/decision-sandbox/fixture/direct-logit-method-adapter.mjs";

/** Pinned identities of the committed AI-144 artifacts. */
export const PINNED = {
  adapter_spec_hash:
    "02d70975dbdfd73d88074a9e35b3687699b81ffa187ab0cd6ea49d550804b499",
  evidence_pack_hash:
    "84e708c97044fb64d2e5e79f2e98e146ff1f175d51efc96cfdb836d15c78abf9",
  artifact_sha256:
    "47fd52b6a952b6b7b3ad7053286e03242fa762830d92eae9f1a99d285b8e4f65",
  sandbox_policy_hash:
    "6bad0bd18d779acb838ecf37e561d1678b13f0b53649acf40810972b03bc8378",
  fixtures: {
    "synthetic-logits-bucket-0001":
      "d719613a0496b861dc91111c9d2278722b7b3c0f34dc2d3d06931ce381808636",
    "synthetic-logits-hold-0001":
      "1bb649c6f16d58b84887b19276218c545627cd8fee4399c8c551721694dc7da9",
    "synthetic-logits-intent-0001":
      "22320b8d899196ba781d54274e37981101abbd0974673bec1967f4a9bb7ab515",
    "synthetic-logits-route-0001":
      "5c1b65bd9734563aa982a51b47027a8cf048d2b5165ffedfa1acbca0452f7355",
  },
} as const;

export function load<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mutable = Record<string, any>;

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function spec(): CandidateAdapterSpec {
  return load<CandidateAdapterSpec>(SPEC_PATH);
}

export function pack(): CandidateAdapterEvidencePack {
  return load<CandidateAdapterEvidencePack>(PACK_PATH);
}

export function semifEntry(): DecisionCandidateEntry {
  return load<DecisionCandidateEntry>(SEMIF_ENTRY_PATH);
}

/** A still-valid AI-142 entry whose content (and so hash) drifted. */
export function driftedSemifEntry(): DecisionCandidateEntry {
  const entry = clone(semifEntry()) as Mutable;
  entry["upstream_claims"][0]["statement"] =
    "README and third-party notes name a base model at a pinned revision; wording revised in a later registry revision.";
  delete entry["candidate_hash"];
  entry["candidate_hash"] = computeDecisionCandidateHash(
    entry as DecisionCandidateEntry,
  );
  return entry as DecisionCandidateEntry;
}

export function logitFixtures(): SyntheticLogitFixture[] {
  return readdirSync(LOGIT_ROOT)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => load<SyntheticLogitFixture>(`${LOGIT_ROOT}/${name}`));
}

export function logitFixture(id: string): SyntheticLogitFixture {
  return load<SyntheticLogitFixture>(`${LOGIT_ROOT}/${id}.json`);
}

export const REQUESTS = {
  intent: "data/fixtures/typed-decision/valid-choice-request.json",
  intentPermuted:
    "data/fixtures/typed-decision/valid-choice-request-permuted.json",
  route: `${REQUEST_ROOT}/choice-request-remainder-tie.json`,
  routePermuted: `${REQUEST_ROOT}/choice-request-remainder-tie-permuted.json`,
  topTie: `${REQUEST_ROOT}/choice-request-top-tie.json`,
  sixteen: `${REQUEST_ROOT}/choice-request-sixteen-options.json`,
  seventeen: `${REQUEST_ROOT}/choice-request-seventeen-options.json`,
  boolean: "data/fixtures/typed-decision/valid-boolean-request.json",
  score: "data/fixtures/typed-decision/valid-score-request.json",
  ranking: "data/fixtures/typed-decision/valid-ranking-request.json",
} as const;

export function request(key: keyof typeof REQUESTS): TypedDecisionRequest {
  return load<TypedDecisionRequest>(REQUESTS[key]);
}

/** Which committed fixture binds which request files. */
export const FIXTURE_REQUESTS: Record<string, (keyof typeof REQUESTS)[]> = {
  "synthetic-logits-bucket-0001": ["sixteen"],
  "synthetic-logits-hold-0001": ["topTie"],
  "synthetic-logits-intent-0001": ["intent", "intentPermuted"],
  "synthetic-logits-route-0001": ["route", "routePermuted"],
};

export function codes<T>(
  check:
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly issues: readonly { code: string }[] },
): string[] {
  return check.ok ? [] : check.issues.map((issue) => issue.code);
}
