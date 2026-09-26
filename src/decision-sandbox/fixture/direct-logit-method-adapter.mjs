/**
 * AI-144 — repository-owned direct option-logit method fixture adapter.
 *
 * This file is an AI-LAB-owned implementation of a pinned direct
 * option-logit readout methodology. It is executed only as a
 * `synthetic_fixture_adapter` subject of the AI-143 decision sandbox,
 * which binds it by exact SHA-256 in `src/decision-sandbox/contracts.ts`;
 * any byte change requires a reviewed update of that pinned hash,
 * otherwise the sandbox refuses to run it. The candidate-specific
 * methodology binding (candidate, pinned upstream evidence, this
 * artifact's hash) lives outside the sandbox, in the AI-144 candidate
 * adapter specification under `data/decision-candidate-methods/`.
 *
 * It executes methodology, not candidate-supplied code or model weights.
 * It contains no upstream code, no model, no weights, no provider, no
 * network, no filesystem access, no credentials and no customer data. It performs no natural-language inference: the only
 * numeric evidence it reads is the embedded, repository-owned synthetic
 * logit fixture set below, keyed by the exact AI-140 request hash the
 * runtime verified. Every result has `result_origin: "synthetic_fixture"`.
 * A method-conformance success is not evidence of model quality.
 *
 * Method (pure; `readoutDirectOptionLogits`):
 *  1. Bind one integer micro-logit to every declared candidate id. Array
 *     position never carries identity. Missing, unknown or duplicate
 *     candidates, non-integer (NaN, Infinity, fractional) or out-of-bound
 *     logits, and fewer than 2 or more than 16 candidates are refused.
 *  2. Order candidates by ascending `candidate_id` (UTF-16 code units).
 *  3. Softmax with max subtraction:
 *     w_i = exp((l_i - max_l) / 1_000_000), p_i = w_i / sum(w) (the sum is
 *     accumulated in candidate id order).
 *  4. Integer micros: floor(p_i * 1_000_000), then the remaining
 *     1_000_000 - sum(floors) micros go one each to the largest fractional
 *     remainders; equal remainders resolve by ascending `candidate_id`. The
 *     distribution always sums to exactly 1_000_000.
 *  5. Selection: the unique maximum logit. A tie at the maximum is
 *     refused (the upstream tie-break is positional, which would make the
 *     selection depend on display order). No temperature or calibration is
 *     applied.
 *
 * Supported: AI-140 `choice` only. `boolean`, `score` and `ranking` are
 * refused here as well as before process creation.
 *
 * Result hashing: the sandbox grants read access to this file only, so it
 * cannot import the repository canonicalizer. It builds its single fixed
 * result shape with every key already in `registry-json-v1` order and
 * hashes `JSON.stringify` of it under the AI-140 result domain. This is
 * not a general canonicalizer; the runtime independently recomputes the
 * AI-140 result hash on every output and rejects any mismatch.
 *
 * Protocol `ai-lab-decision-adapter` 1.0.0, framing `json-line-v1`: read
 * exactly one compact JSON line from stdin until EOF, write exactly one
 * compact JSON line to stdout. stderr is never written.
 *
 * Closed exit codes: 2 input framing/protocol invalid, 3 no synthetic
 * logit fixture bound to the request hash, 4 refused environment, 5
 * method refusal (unsupported request, candidate set mismatch, invalid
 * logit, normalization failure), 6 tie at the maximum logit.
 *
 * The adapter refuses (exit 4, no output) unless it runs with an empty
 * environment under the Node permission model, as the sandbox runtime
 * launches it. Importing this module (tests) has no side effects.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const PROTOCOL = "ai-lab-decision-adapter";
const PROTOCOL_VERSION = "1.0.0";
const MAX_INPUT_BYTES = 65536;
const RESULT_HASH_DOMAIN = "vlatam-ai-lab:typed-decision-result:v1";
const CANDIDATE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,127}$/;

export const DIRECT_LOGIT_METHOD = Object.freeze({
  min_candidates: 2,
  max_candidates: 16,
  logit_micros_scale: 1_000_000,
  max_abs_logit_micros: 100_000_000,
  probability_micros_scale: 1_000_000,
});

export const EXIT_CODES = Object.freeze({
  input_invalid: 2,
  fixture_unbound: 3,
  environment_refused: 4,
  method_refused: 5,
  top_logit_tie: 6,
});

function deepFreeze(value) {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Exact copies of the repository-owned synthetic logit fixtures
 * (`data/decision-candidate-methods/v1/synthetic-logits/*.json`), in
 * ascending `fixture_id` order. Synthetic numbers, never model outputs.
 */
export const SYNTHETIC_LOGIT_FIXTURES = deepFreeze([
  {
    contract: "typed_decision_synthetic_logit_fixture",
    schema_version: "1.0.0",
    fixture_id: "synthetic-logits-bucket-0001",
    provenance: "repository_owned_synthetic",
    model_output: false,
    request_binding: {
      capability_id: "synthetic.decision.bucket_select",
      semantic_request_hash:
        "d95cab1e64950e19b51039fa4c7ef4d4a5b5610f2a727e9b3dd7b719f8b10dc6",
      request_hashes: [
        "e251e7eb520148fcfd4d891a4906197535f17ee396e1fede6ed2aad654eac5f3",
      ],
    },
    logit_unit: "micro_logit",
    candidate_logits: [
      { candidate_id: "bucket.01", logit_micros: -100000000 },
      { candidate_id: "bucket.02", logit_micros: -2500000 },
      { candidate_id: "bucket.03", logit_micros: -1000000 },
      { candidate_id: "bucket.04", logit_micros: 0 },
      { candidate_id: "bucket.05", logit_micros: 250000 },
      { candidate_id: "bucket.06", logit_micros: 500000 },
      { candidate_id: "bucket.07", logit_micros: 4000000 },
      { candidate_id: "bucket.08", logit_micros: 750000 },
      { candidate_id: "bucket.09", logit_micros: 1000000 },
      { candidate_id: "bucket.10", logit_micros: -750000 },
      { candidate_id: "bucket.11", logit_micros: 1500000 },
      { candidate_id: "bucket.12", logit_micros: 2000000 },
      { candidate_id: "bucket.13", logit_micros: -3000000 },
      { candidate_id: "bucket.14", logit_micros: 3250000 },
      { candidate_id: "bucket.15", logit_micros: -50000000 },
      { candidate_id: "bucket.16", logit_micros: 100000 },
    ],
    fixture_hash:
      "d719613a0496b861dc91111c9d2278722b7b3c0f34dc2d3d06931ce381808636",
  },
  {
    contract: "typed_decision_synthetic_logit_fixture",
    schema_version: "1.0.0",
    fixture_id: "synthetic-logits-hold-0001",
    provenance: "repository_owned_synthetic",
    model_output: false,
    request_binding: {
      capability_id: "synthetic.decision.hold_or_release",
      semantic_request_hash:
        "8994b773ce64eac76b282a371dd8412ec46b3c60a462772f3b2f35f94f10ca06",
      request_hashes: [
        "03daeaa2926edb2b9aabcba6cf33b88b0eb1cf01261693493277cbbf94e0040f",
      ],
    },
    logit_unit: "micro_logit",
    candidate_logits: [
      { candidate_id: "hold.escalate", logit_micros: -500000 },
      { candidate_id: "hold.keep", logit_micros: 1200000 },
      { candidate_id: "hold.release", logit_micros: 1200000 },
    ],
    fixture_hash:
      "1bb649c6f16d58b84887b19276218c545627cd8fee4399c8c551721694dc7da9",
  },
  {
    contract: "typed_decision_synthetic_logit_fixture",
    schema_version: "1.0.0",
    fixture_id: "synthetic-logits-intent-0001",
    provenance: "repository_owned_synthetic",
    model_output: false,
    request_binding: {
      capability_id: "synthetic.decision.intent_classify",
      semantic_request_hash:
        "daef56807bcae765bcc14ffdb98c05093bf912c871e1e7f7cdd3ee3bb8fd249c",
      request_hashes: [
        "107363d8f5d0eede8e0ec9c1723444216ded63a2379ddef5dd6a4c8597f5d6c7",
        "7eec526cfe12a866ca0f1123338398d215b47b85e4085c3e884cb14c5f9a7fda",
      ],
    },
    logit_unit: "micro_logit",
    candidate_logits: [
      { candidate_id: "intent.document_submission", logit_micros: -400000 },
      { candidate_id: "intent.other", logit_micros: -1100000 },
      { candidate_id: "intent.tariff_question", logit_micros: 1800000 },
    ],
    fixture_hash:
      "22320b8d899196ba781d54274e37981101abbd0974673bec1967f4a9bb7ab515",
  },
  {
    contract: "typed_decision_synthetic_logit_fixture",
    schema_version: "1.0.0",
    fixture_id: "synthetic-logits-route-0001",
    provenance: "repository_owned_synthetic",
    model_output: false,
    request_binding: {
      capability_id: "synthetic.decision.queue_route",
      semantic_request_hash:
        "91f50131725203491fbd11f68dc6ab83a2e40897fae03d0b3db9d08779b6640b",
      request_hashes: [
        "a2954e11fa261c8f0d27118410ae03b47bbe00f08bb972e3a3fdee8714bf8474",
        "fc68832c2988d52282f065c3dee056ee852505d0ce75393f86310895553e7c1c",
      ],
    },
    logit_unit: "micro_logit",
    candidate_logits: [
      { candidate_id: "route.alpha", logit_micros: 1000000 },
      { candidate_id: "route.beta", logit_micros: -1000000 },
      { candidate_id: "route.delta", logit_micros: -600000 },
      { candidate_id: "route.gamma", logit_micros: -1000000 },
    ],
    fixture_hash:
      "5c1b65bd9734563aa982a51b47027a8cf048d2b5165ffedfa1acbca0452f7355",
  },
]);

function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function refuse(code) {
  return { ok: false, code };
}

/**
 * The pure direct option-logit readout. `candidateIds` are the declared
 * candidate ids in any order; `logits` binds one integer micro-logit to
 * each by id. Returns the complete integer-micros distribution in
 * ascending candidate id order and the unique maximum-logit candidate, or
 * a closed refusal code. Never mutates its inputs.
 */
export function readoutDirectOptionLogits(candidateIds, logits) {
  const limits = DIRECT_LOGIT_METHOD;
  if (
    !Array.isArray(candidateIds) ||
    candidateIds.length < limits.min_candidates ||
    candidateIds.length > limits.max_candidates
  )
    return refuse("candidate_count_unsupported");
  const declared = new Set();
  for (const id of candidateIds) {
    if (typeof id !== "string" || !CANDIDATE_ID_PATTERN.test(id))
      return refuse("candidate_id_invalid");
    if (declared.has(id)) return refuse("candidate_duplicate");
    declared.add(id);
  }
  if (!Array.isArray(logits)) return refuse("logit_invalid");
  const bound = new Map();
  for (const entry of logits) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).length !== 2 ||
      typeof entry.candidate_id !== "string"
    )
      return refuse("logit_invalid");
    const value = entry.logit_micros;
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      Math.abs(value) > limits.max_abs_logit_micros
    )
      return refuse("logit_invalid");
    if (bound.has(entry.candidate_id)) return refuse("logit_duplicate");
    if (!declared.has(entry.candidate_id))
      return refuse("logit_unknown_candidate");
    bound.set(entry.candidate_id, value);
  }
  if (bound.size !== declared.size) return refuse("logit_missing");

  const ids = [...declared].sort(compareIds);
  const values = ids.map((id) => bound.get(id));
  const maximum = Math.max(...values);
  const top = ids.filter((_, index) => values[index] === maximum);
  if (top.length !== 1) return refuse("top_logit_tie");

  const weights = values.map((value) =>
    Math.exp((value - maximum) / limits.logit_micros_scale),
  );
  let total = 0;
  for (const weight of weights) total += weight;
  const scale = limits.probability_micros_scale;
  const raw = weights.map((weight) => (weight / total) * scale);
  if (!raw.every((value) => Number.isFinite(value) && value >= 0))
    return refuse("normalization_failed");
  const floors = raw.map((value) => Math.floor(value));
  const deficit = scale - floors.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(deficit) || deficit < 0 || deficit >= ids.length)
    return refuse("normalization_failed");
  const order = ids
    .map((id, index) => ({ id, index, remainder: raw[index] - floors[index] }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? compareIds(a.id, b.id)
        : b.remainder - a.remainder,
    );
  const micros = [...floors];
  for (let k = 0; k < deficit; k += 1) micros[order[k].index] += 1;
  if (
    micros.reduce((sum, value) => sum + value, 0) !== scale ||
    !micros.every((value) => Number.isSafeInteger(value) && value >= 0)
  )
    return refuse("normalization_failed");

  const entries = ids.map((id, index) => ({
    candidate_id: id,
    probability_micros: micros[index],
  }));
  return {
    ok: true,
    selected_candidate_id: top[0],
    selected_probability_micros: micros[ids.indexOf(top[0])],
    entries,
  };
}

/** The unique embedded fixture bound to an exact request hash, or null. */
export function findSyntheticLogitFixture(requestHash) {
  const matches = SYNTHETIC_LOGIT_FIXTURES.filter((fixture) =>
    fixture.request_binding.request_hashes.includes(requestHash),
  );
  return matches.length === 1 ? matches[0] : null;
}

function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Builds the AI-140 `choice` result for one request from one synthetic
 * logit fixture. Every object literal below lists its keys in
 * `registry-json-v1` (ascending UTF-16) order, so `JSON.stringify` of the
 * body is its canonical form.
 */
export function buildDirectLogitChoiceResult(request, requestHash, fixture) {
  if (
    request === null ||
    typeof request !== "object" ||
    request.decision_type !== "choice" ||
    request.output_domain === null ||
    typeof request.output_domain !== "object" ||
    request.output_domain.kind !== "choice" ||
    !Array.isArray(request.output_domain.candidates)
  )
    return refuse("decision_type_unsupported");
  if (
    fixture === null ||
    fixture.logit_unit !== "micro_logit" ||
    fixture.model_output !== false ||
    fixture.request_binding.capability_id !== request.capability_id ||
    !fixture.request_binding.request_hashes.includes(requestHash)
  )
    return refuse("fixture_unbound");
  const readout = readoutDirectOptionLogits(
    request.output_domain.candidates.map((candidate) => candidate.candidate_id),
    fixture.candidate_logits,
  );
  if (!readout.ok) return readout;
  const humanReview =
    request.policy !== null &&
    typeof request.policy === "object" &&
    request.policy.human_review_required === true;
  const body = {
    abstention: null,
    block: null,
    confidence: {
      calibration_ref: null,
      confidence_micros: readout.selected_probability_micros,
      semantics: "uncalibrated_candidate_reported",
    },
    contract: "typed_decision_result",
    decision: {
      distribution: {
        completeness: "complete",
        entries: readout.entries.map((entry) => ({
          candidate_id: entry.candidate_id,
          probability_micros: entry.probability_micros,
        })),
      },
      kind: "choice",
      selected_candidate_id: readout.selected_candidate_id,
    },
    decision_type: "choice",
    escalation: {
      executed: false,
      governed_policy_ref: null,
      recommendation: "none",
    },
    evidence_refs: [],
    execution_paradigm: "typed_decision",
    failure: null,
    governance: {
      approval_state: humanReview ? "pending" : "not_required",
      downstream_allowed: false,
      human_review_required: humanReview,
    },
    request_binding: {
      capability_id: request.capability_id,
      request_hash: requestHash,
      request_id: request.request_id,
      semantic_request_hash: fixture.request_binding.semantic_request_hash,
    },
    result_id: `direct-logit-method-result-${requestHash.slice(0, 32)}`,
    result_origin: "synthetic_fixture",
    schema_version: "1.0.0",
    status: "succeeded",
  };
  const resultHash = sha256Hex(
    `${RESULT_HASH_DOMAIN}\n${JSON.stringify(body)}`,
  );
  return { ok: true, result: { ...body, result_hash: resultHash } };
}

const REFUSAL_EXIT_CODES = {
  fixture_unbound: EXIT_CODES.fixture_unbound,
  top_logit_tie: EXIT_CODES.top_logit_tie,
};

function handle(bytes) {
  let input;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n") || text.indexOf("\n") !== text.length - 1)
      throw new Error("framing");
    input = JSON.parse(text.slice(0, -1));
  } catch {
    process.exitCode = EXIT_CODES.input_invalid;
    return;
  }
  if (
    typeof input !== "object" ||
    input === null ||
    input.contract !== "decision_adapter_input" ||
    input.protocol !== PROTOCOL ||
    input.protocol_version !== PROTOCOL_VERSION ||
    typeof input.execution_id !== "string" ||
    typeof input.request_hash !== "string" ||
    typeof input.request !== "object" ||
    input.request === null
  ) {
    process.exitCode = EXIT_CODES.input_invalid;
    return;
  }
  const fixture = findSyntheticLogitFixture(input.request_hash);
  if (fixture === null) {
    process.exitCode = EXIT_CODES.fixture_unbound;
    return;
  }
  const built = buildDirectLogitChoiceResult(
    input.request,
    input.request_hash,
    fixture,
  );
  if (!built.ok) {
    process.exitCode =
      REFUSAL_EXIT_CODES[built.code] ?? EXIT_CODES.method_refused;
    return;
  }
  const output = {
    contract: "decision_adapter_output",
    protocol: PROTOCOL,
    protocol_version: PROTOCOL_VERSION,
    execution_id: input.execution_id,
    request_hash: input.request_hash,
    result: built.result,
    result_hash: built.result.result_hash,
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

function main() {
  if (
    Object.keys(process.env).length !== 0 ||
    process.permission === undefined
  ) {
    process.exitCode = EXIT_CODES.environment_refused;
    return;
  }
  const chunks = [];
  let size = 0;
  process.stdin.on("data", (chunk) => {
    size += chunk.length;
    if (size <= MAX_INPUT_BYTES) chunks.push(chunk);
  });
  process.stdin.on("end", () => {
    if (size > MAX_INPUT_BYTES) {
      process.exitCode = EXIT_CODES.input_invalid;
      return;
    }
    handle(Buffer.concat(chunks));
  });
}

/** Runs only as the process entry point, never on import. */
if (
  typeof process.argv[1] === "string" &&
  pathToFileURL(process.argv[1]).href === import.meta.url
)
  main();
