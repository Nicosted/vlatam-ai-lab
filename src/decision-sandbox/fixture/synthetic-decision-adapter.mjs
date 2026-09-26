/**
 * AI-143 — repository-owned synthetic decision fixture adapter.
 *
 * The fixture runner proves the execution contract.
 * It does not prove that untrusted candidate code is safe to run.
 *
 * This file is the only executable subject admitted by the AI-143
 * decision sandbox. It is bound by exact SHA-256 in
 * `src/decision-sandbox/contracts.ts`; any byte change requires a reviewed
 * update of that pinned hash, otherwise the sandbox refuses to run it.
 *
 * It contains no model, no weights, no provider, no network, no
 * filesystem access, no credentials and no customer data. It does not
 * compute decisions: it replays the exact AI-140 synthetic result fixtures
 * (`data/fixtures/typed-decision/valid-*-result.json`) keyed by the
 * request hash it is given, so every result has
 * `result_origin: "synthetic_fixture"`. It emits no reasoning.
 *
 * Protocol `ai-lab-decision-adapter` 1.0.0, framing `json-line-v1`: read
 * exactly one compact JSON line from stdin until EOF, write exactly one
 * compact JSON line to stdout. stderr is diagnostic only.
 *
 * Deterministic test behaviours are selected only by an execution id of
 * the form `fixture-behavior-<name>-<suffix>` from the closed set below;
 * every other execution id gets the conformant behaviour. They exist to
 * prove that the runtime fails closed on timeouts, oversized output and
 * protocol violations.
 *
 * The adapter refuses (exit 4, no output) unless it runs with an empty
 * environment under the Node permission model, as the sandbox runtime
 * launches it.
 */

import { Buffer } from "node:buffer";
import { setInterval } from "node:timers";
import { TextDecoder } from "node:util";
import process from "node:process";

const PROTOCOL = "ai-lab-decision-adapter";
const PROTOCOL_VERSION = "1.0.0";
const MAX_INPUT_BYTES = 65536;

const BEHAVIORS = new Set([
  "conformant",
  "hang",
  "stdout-flood",
  "stderr-flood",
  "stderr-diagnostic",
  "malformed-json",
  "multiple-responses",
  "trailing-stdout",
  "invalid-utf8",
  "wrong-execution-id",
  "wrong-request-hash",
  "wrong-result-hash",
  "invalid-result",
  "unexpected-origin",
  "protocol-major",
  "exit-nonzero",
  "silent-exit",
]);

/** Exact copies of the AI-140 synthetic result fixtures, keyed by request hash. */
const RESULTS = {
  "0eaa461b53efe3d593695a90711746228877bc2432c744a4a8cd0d4742451598": {
    contract: "typed_decision_result",
    schema_version: "1.0.0",
    result_id: "synthetic-evidence-sufficiency-result-0001",
    result_origin: "synthetic_fixture",
    request_binding: {
      request_id: "synthetic-evidence-sufficiency-request-0001",
      capability_id: "synthetic.decision.evidence_sufficiency_assess",
      request_hash:
        "0eaa461b53efe3d593695a90711746228877bc2432c744a4a8cd0d4742451598",
      semantic_request_hash:
        "b82e5b256292a95d641e316cb67b20478969ab1d3f04b3f267db404bc4ae18c2",
    },
    execution_paradigm: "typed_decision",
    decision_type: "boolean",
    status: "succeeded",
    decision: {
      kind: "boolean",
      value: true,
      probability_true_micros: 910000,
    },
    confidence: null,
    abstention: null,
    block: null,
    failure: null,
    escalation: {
      recommendation: "none",
      executed: false,
      governed_policy_ref: null,
    },
    evidence_refs: [
      {
        evidence_id: "synthetic-fixture-packet-0001",
        content_hash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ],
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      approval_state: "pending",
    },
    result_hash:
      "20082df9bdf6e6505bd20bdac180a20cc03d1b0d4cd39b0f7c61dd22e199ed44",
  },
  "7eec526cfe12a866ca0f1123338398d215b47b85e4085c3e884cb14c5f9a7fda": {
    contract: "typed_decision_result",
    schema_version: "1.0.0",
    result_id: "synthetic-intent-result-0001",
    result_origin: "synthetic_fixture",
    request_binding: {
      request_id: "synthetic-intent-request-0001",
      capability_id: "synthetic.decision.intent_classify",
      request_hash:
        "7eec526cfe12a866ca0f1123338398d215b47b85e4085c3e884cb14c5f9a7fda",
      semantic_request_hash:
        "daef56807bcae765bcc14ffdb98c05093bf912c871e1e7f7cdd3ee3bb8fd249c",
    },
    execution_paradigm: "typed_decision",
    decision_type: "choice",
    status: "succeeded",
    decision: {
      kind: "choice",
      selected_candidate_id: "intent.tariff_question",
      distribution: {
        completeness: "complete",
        entries: [
          {
            candidate_id: "intent.document_submission",
            probability_micros: 150000,
          },
          {
            candidate_id: "intent.other",
            probability_micros: 50000,
          },
          {
            candidate_id: "intent.tariff_question",
            probability_micros: 800000,
          },
        ],
      },
    },
    confidence: {
      confidence_micros: 800000,
      semantics: "uncalibrated_candidate_reported",
      calibration_ref: null,
    },
    abstention: null,
    block: null,
    failure: null,
    escalation: {
      recommendation: "none",
      executed: false,
      governed_policy_ref: null,
    },
    evidence_refs: [
      {
        evidence_id: "synthetic-fixture-intent-0001",
        content_hash:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ],
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      approval_state: "pending",
    },
    result_hash:
      "8c189bec4f60e648016dc22939b9d803937e627fd119490b7c8e88c76f9e988b",
  },
  d3c469c794e6bb5461f49d4a5d60e50e9d5ade86c984cade9d253db5001fcd00: {
    contract: "typed_decision_result",
    schema_version: "1.0.0",
    result_id: "synthetic-document-completeness-result-0001",
    result_origin: "synthetic_fixture",
    request_binding: {
      request_id: "synthetic-document-completeness-request-0001",
      capability_id: "synthetic.decision.document_completeness_score",
      request_hash:
        "d3c469c794e6bb5461f49d4a5d60e50e9d5ade86c984cade9d253db5001fcd00",
      semantic_request_hash:
        "a5958d8a220d79391f1da17d1b4a765fbdd726929e94fd6938c6fa533c6a3a1a",
    },
    execution_paradigm: "typed_decision",
    decision_type: "score",
    status: "succeeded",
    decision: {
      kind: "score",
      scale_id: "synthetic.completeness.0_4",
      value: 3,
    },
    confidence: {
      confidence_micros: 600000,
      semantics: "uncalibrated_candidate_reported",
      calibration_ref: null,
    },
    abstention: null,
    block: null,
    failure: null,
    escalation: {
      recommendation: "none",
      executed: false,
      governed_policy_ref: null,
    },
    evidence_refs: [],
    governance: {
      human_review_required: false,
      downstream_allowed: false,
      approval_state: "not_required",
    },
    result_hash:
      "1e3eadc0918df19b654f0343eab9d5b61f39e04b86a549c53c5ffb5ff805006e",
  },
  "44434629fd6cfc231e695fbd241cde0305ace69c892b82f216ebbe2e8fb7154c": {
    contract: "typed_decision_result",
    schema_version: "1.0.0",
    result_id: "synthetic-next-step-result-0001",
    result_origin: "synthetic_fixture",
    request_binding: {
      request_id: "synthetic-next-step-request-0001",
      capability_id: "synthetic.decision.workflow_next_step_rank",
      request_hash:
        "44434629fd6cfc231e695fbd241cde0305ace69c892b82f216ebbe2e8fb7154c",
      semantic_request_hash:
        "672c0a9e0aaa8ec75e46af58ac8f4283a89a5cad96527d4075eea852f2badb17",
    },
    execution_paradigm: "typed_decision",
    decision_type: "ranking",
    status: "succeeded",
    decision: {
      kind: "ranking",
      ordered_candidate_ids: [
        "step.route_to_reviewer",
        "step.request_missing_document",
        "step.hold",
      ],
    },
    confidence: null,
    abstention: null,
    block: null,
    failure: null,
    escalation: {
      recommendation: "human_review",
      executed: false,
      governed_policy_ref: null,
    },
    evidence_refs: [],
    governance: {
      human_review_required: true,
      downstream_allowed: false,
      approval_state: "pending",
    },
    result_hash:
      "7fbe3a604741833555b5bf589be38640e8038156af315b8199609d9e652dceb4",
  },
};

const BEHAVIOR_PREFIX = "fixture-behavior-";

function behaviorOf(executionId) {
  let selected = "conformant";
  for (const name of BEHAVIORS) {
    if (
      executionId.startsWith(`${BEHAVIOR_PREFIX}${name}-`) &&
      name.length > (selected === "conformant" ? 0 : selected.length)
    )
      selected = name;
  }
  return selected;
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

/** Keeps the process alive without output until the runtime kills it. */
function hang() {
  setInterval(() => {}, 60_000);
}

function respond(input, behavior) {
  const stored = RESULTS[input.request_hash];
  if (
    stored === undefined ||
    stored.request_binding.request_hash !== input.request_hash
  ) {
    process.exitCode = 3;
    return;
  }
  let result = stored;
  if (behavior === "invalid-result")
    result = {
      ...stored,
      governance: { ...stored.governance, downstream_allowed: true },
    };
  if (behavior === "unexpected-origin")
    result = { ...stored, result_origin: "candidate_model" };
  const output = {
    contract: "decision_adapter_output",
    protocol: PROTOCOL,
    protocol_version:
      behavior === "protocol-major" ? "2.0.0" : PROTOCOL_VERSION,
    execution_id:
      behavior === "wrong-execution-id"
        ? `${input.execution_id}-other`
        : input.execution_id,
    request_hash:
      behavior === "wrong-request-hash" ? "f".repeat(64) : input.request_hash,
    result,
    result_hash:
      behavior === "wrong-result-hash" ? "e".repeat(64) : result.result_hash,
  };
  emit(output);
  if (behavior === "multiple-responses") emit(output);
  if (behavior === "trailing-stdout")
    process.stdout.write("synthetic trailing output\n");
  if (behavior === "stderr-diagnostic")
    process.stderr.write("synthetic fixture diagnostic\n");
  if (behavior === "exit-nonzero") process.exitCode = 1;
}

function handle(bytes) {
  let input;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.endsWith("\n") || text.indexOf("\n") !== text.length - 1)
      throw new Error("framing");
    input = JSON.parse(text.slice(0, -1));
  } catch {
    process.exitCode = 2;
    return;
  }
  if (
    typeof input !== "object" ||
    input === null ||
    input.contract !== "decision_adapter_input" ||
    input.protocol !== PROTOCOL ||
    input.protocol_version !== PROTOCOL_VERSION ||
    typeof input.execution_id !== "string" ||
    typeof input.request_hash !== "string"
  ) {
    process.exitCode = 2;
    return;
  }
  const behavior = behaviorOf(input.execution_id);
  switch (behavior) {
    case "hang":
      hang();
      return;
    case "stdout-flood":
      process.stdout.write("a".repeat(262_144));
      hang();
      return;
    case "stderr-flood":
      process.stderr.write("a".repeat(65_536));
      hang();
      return;
    case "malformed-json":
      process.stdout.write('{"contract":\n');
      return;
    case "invalid-utf8":
      process.stdout.write(Buffer.from([0xc3, 0x28, 0x0a]));
      return;
    case "silent-exit":
      return;
    default:
      respond(input, behavior);
  }
}

if (Object.keys(process.env).length !== 0 || process.permission === undefined) {
  process.exitCode = 4;
} else {
  const chunks = [];
  let size = 0;
  process.stdin.on("data", (chunk) => {
    size += chunk.length;
    if (size <= MAX_INPUT_BYTES) chunks.push(chunk);
  });
  process.stdin.on("end", () => {
    if (size > MAX_INPUT_BYTES) {
      process.exitCode = 2;
      return;
    }
    handle(Buffer.concat(chunks));
  });
}
