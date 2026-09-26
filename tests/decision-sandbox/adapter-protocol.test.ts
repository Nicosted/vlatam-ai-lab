import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalizeTypedDecisionJson,
  computeTypedDecisionRequestHash,
} from "../../src/decision/canonical.js";
import {
  DECISION_ADAPTER_ENVELOPE_HASH_DOMAIN,
  DECISION_ADAPTER_FRAMING,
  DECISION_ADAPTER_PROTOCOL,
  DECISION_ADAPTER_PROTOCOL_VERSION,
  buildDecisionAdapterInput,
  computeDecisionAdapterEnvelopeHash,
  decodeDecisionAdapterFrame,
  encodeDecisionAdapterFrame,
  validateDecisionAdapterInput,
  validateDecisionAdapterOutput,
  type DecisionAdapterOutputExpectation,
} from "../../src/decision-sandbox/index.js";
import {
  booleanRequest,
  clone,
  codes,
  FIXTURE_ROOT,
  load,
  type Mutable,
} from "./helpers.js";

const EXECUTION_ID = "sandbox-fixture-execution-0001";
const request = booleanRequest();
const expected: DecisionAdapterOutputExpectation = {
  execution_id: EXECUTION_ID,
  request,
  request_hash: computeTypedDecisionRequestHash(request),
  protocol_version: DECISION_ADAPTER_PROTOCOL_VERSION,
  result_origin: "synthetic_fixture",
};
const validOutput = (): Mutable =>
  load<Mutable>(`${FIXTURE_ROOT}/valid-adapter-output.json`);
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);
const LIMIT = 65_536;

describe("AI-143 common adapter protocol envelopes", () => {
  it("names a provider-neutral, candidate-neutral protocol", () => {
    assert.equal(DECISION_ADAPTER_PROTOCOL, "ai-lab-decision-adapter");
    assert.equal(DECISION_ADAPTER_PROTOCOL_VERSION, "1.0.0");
    assert.equal(DECISION_ADAPTER_FRAMING, "json-line-v1");
    assert.equal(
      DECISION_ADAPTER_ENVELOPE_HASH_DOMAIN,
      "vlatam-ai-lab:decision-adapter-envelope:v1",
    );
  });

  it("builds a valid input envelope carrying the exact AI-140 request and request hash", () => {
    const input = buildDecisionAdapterInput(EXECUTION_ID, request);
    assert.deepEqual(input.request, request);
    assert.equal(input.request_hash, computeTypedDecisionRequestHash(request));
    assert.equal(validateDecisionAdapterInput(input).ok, true);
    assert.deepEqual(
      input,
      load(`${FIXTURE_ROOT}/valid-adapter-input.json`),
      "the registered input fixture is the builder's output",
    );
  });

  it("rejects an input envelope with a wrong request hash, invalid request or unknown field", () => {
    const input = clone(
      buildDecisionAdapterInput(EXECUTION_ID, request),
    ) as Mutable;
    assert.deepEqual(
      codes(
        validateDecisionAdapterInput({
          ...input,
          request_hash: "a".repeat(64),
        }),
      ),
      ["request_hash_mismatch"],
    );
    const invalidRequest = clone(input);
    invalidRequest["request"]["decision_type"] = "unknown";
    assert.ok(
      codes(validateDecisionAdapterInput(invalidRequest)).includes(
        "typed_request_invalid",
      ),
    );
    assert.deepEqual(
      codes(
        validateDecisionAdapterInput({ ...input, protocol_version: "2.0.0" }),
      ),
      ["protocol_version_unsupported"],
    );
    const withCommand = codes(
      validateDecisionAdapterInput({ ...input, command: "adapter" }),
    );
    assert.ok(withCommand.includes("unknown_property"));
    assert.ok(withCommand.includes("execution_control_forbidden"));
  });

  it("accepts a valid output envelope bound to the execution", () => {
    assert.equal(
      validateDecisionAdapterOutput(validOutput(), expected).ok,
      true,
    );
  });

  it("rejects an invalid protocol major or a non-exact protocol version", () => {
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), protocol_version: "2.0.0" },
          expected,
        ),
      ),
      ["protocol_version_unsupported"],
    );
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), protocol_version: "1.1.0" },
          expected,
        ),
      ),
      ["protocol_version_unsupported"],
    );
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), protocol_version: "one" },
          expected,
        ),
      ),
      ["protocol_invalid", "protocol_version_unsupported"],
    );
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), protocol: "other-protocol" },
          expected,
        ),
      ),
      ["protocol_invalid"],
    );
  });

  it("rejects a wrong execution id, request hash or result hash", () => {
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), execution_id: "sandbox-fixture-execution-0002" },
          expected,
        ),
      ),
      ["execution_id_mismatch"],
    );
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), request_hash: "f".repeat(64) },
          expected,
        ),
      ),
      ["request_hash_mismatch"],
    );
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput(
          { ...validOutput(), result_hash: "e".repeat(64) },
          expected,
        ),
      ),
      ["result_hash_mismatch"],
    );
  });

  it("rejects a malformed, unbound or authority-claiming typed result", () => {
    const malformed = validOutput();
    malformed["result"]["decision"] = { kind: "boolean", value: "yes" };
    assert.ok(
      codes(validateDecisionAdapterOutput(malformed, expected)).includes(
        "typed_result_invalid",
      ),
    );
    const otherRequest = clone(request) as Mutable;
    otherRequest["request_id"] = "synthetic-evidence-sufficiency-request-0002";
    assert.ok(
      codes(
        validateDecisionAdapterOutput(validOutput(), {
          ...expected,
          request: otherRequest as typeof request,
        }),
      ).includes("typed_result_invalid"),
    );
    const authority = load(
      `${FIXTURE_ROOT}/invalid-adapter-output-downstream-authority.json`,
    );
    assert.ok(
      codes(validateDecisionAdapterOutput(authority, expected)).includes(
        "typed_result_invalid",
      ),
    );
    const origin = load(
      `${FIXTURE_ROOT}/invalid-adapter-output-candidate-origin.json`,
    );
    assert.ok(
      codes(validateDecisionAdapterOutput(origin, expected)).includes(
        "result_origin_invalid",
      ),
    );
    const noResult = codes(
      validateDecisionAdapterOutput(
        { ...validOutput(), result: null },
        expected,
      ),
    );
    assert.ok(noResult.includes("typed_result_invalid"));
    assert.ok(noResult.includes("result_hash_mismatch"));
  });

  it("rejects private reasoning, credentials and unknown envelope fields", () => {
    const reasoning = codes(
      validateDecisionAdapterOutput(
        load(`${FIXTURE_ROOT}/invalid-adapter-output-private-reasoning.json`),
        expected,
      ),
    );
    assert.ok(reasoning.includes("private_reasoning_forbidden"));
    assert.ok(reasoning.includes("unknown_property"));
    const credential = codes(
      validateDecisionAdapterOutput(
        { ...validOutput(), api_key: "not-a-real-credential" },
        expected,
      ),
    );
    assert.ok(credential.includes("forbidden_field"));
    assert.deepEqual(
      codes(
        validateDecisionAdapterOutput({ ...validOutput(), extra: 1 }, expected),
      ),
      ["unknown_property"],
    );
    assert.deepEqual(codes(validateDecisionAdapterOutput([], expected)), [
      "contract_invalid",
    ]);
  });

  it("hashes envelopes deterministically under the envelope domain", () => {
    const a = validOutput();
    const b = JSON.parse(
      canonicalizeTypedDecisionJson(validOutput()),
    ) as Mutable;
    assert.equal(
      computeDecisionAdapterEnvelopeHash(a as never),
      computeDecisionAdapterEnvelopeHash(b as never),
    );
    assert.notEqual(
      computeDecisionAdapterEnvelopeHash(a as never),
      computeDecisionAdapterEnvelopeHash({
        ...a,
        execution_id: "sandbox-fixture-execution-0002",
      } as never),
    );
  });
});

describe("AI-143 json-line-v1 framing", () => {
  const line = `${JSON.stringify(validOutput())}\n`;

  it("encodes the input as exactly one canonical UTF-8 line", () => {
    const input = buildDecisionAdapterInput(EXECUTION_ID, request);
    const text = new TextDecoder().decode(encodeDecisionAdapterFrame(input));
    assert.equal(text, `${canonicalizeTypedDecisionJson(input)}\n`);
    assert.equal(text.indexOf("\n"), text.length - 1);
    assert.deepEqual(JSON.parse(text), input);
  });

  it("decodes exactly one compact JSON object line", () => {
    const decoded = decodeDecisionAdapterFrame(bytes(line), LIMIT);
    assert.equal(decoded.ok, true);
    if (decoded.ok) assert.deepEqual(decoded.value, validOutput());
  });

  it("fails closed on a missing response", () => {
    for (const text of ["", "\n"])
      assert.deepEqual(decodeDecisionAdapterFrame(bytes(text), LIMIT), {
        ok: false,
        code: "response_missing",
      });
  });

  it("fails closed on malformed UTF-8", () => {
    for (const raw of [
      [0xc3, 0x28, 0x0a],
      [0xff, 0xfe, 0x0a],
      [0x7b, 0x22, 0xed, 0xa0, 0x80, 0x22, 0x7d, 0x0a],
    ])
      assert.deepEqual(
        decodeDecisionAdapterFrame(Uint8Array.from(raw), LIMIT),
        { ok: false, code: "response_not_utf8" },
      );
  });

  it("fails closed on malformed JSON and non-object JSON", () => {
    assert.deepEqual(
      decodeDecisionAdapterFrame(bytes('{"contract":\n'), LIMIT),
      {
        ok: false,
        code: "response_json_invalid",
      },
    );
    for (const text of ["[]\n", "null\n", "1\n", '"text"\n'])
      assert.deepEqual(decodeDecisionAdapterFrame(bytes(text), LIMIT), {
        ok: false,
        code: "response_not_object",
      });
  });

  it("fails closed on multiple responses and on trailing stdout", () => {
    assert.deepEqual(decodeDecisionAdapterFrame(bytes(line + line), LIMIT), {
      ok: false,
      code: "response_multiple",
    });
    assert.deepEqual(
      decodeDecisionAdapterFrame(bytes(`${line}trailing output\n`), LIMIT),
      { ok: false, code: "response_trailing_output" },
    );
    assert.deepEqual(decodeDecisionAdapterFrame(bytes(`${line}\n`), LIMIT), {
      ok: false,
      code: "response_trailing_output",
    });
  });

  it("fails closed on ambiguous framing: no terminator, CR, BOM, whitespace, duplicate keys, non-compact JSON", () => {
    for (const text of [
      line.slice(0, -1),
      `${line.slice(0, -1)}\r\n`,
      `\uFEFF${line}`,
      ` ${line}`,
      '{"a":1,"a":2}\n',
      '{ "a": 1 }\n',
      '{"a":1.0}\n',
      '{"a":"\\u0041"}\n',
    ])
      assert.deepEqual(
        decodeDecisionAdapterFrame(bytes(text), LIMIT),
        { ok: false, code: "response_framing_invalid" },
        JSON.stringify(text),
      );
  });

  it("fails closed when the frame exceeds the bound", () => {
    assert.deepEqual(decodeDecisionAdapterFrame(bytes(line), 16), {
      ok: false,
      code: "stdout_limit_exceeded",
    });
  });
});
