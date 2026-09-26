import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DECISION_SANDBOX_ENFORCED_CONTROLS,
  DECISION_SANDBOX_FIXTURE_POLICY,
  DECISION_SANDBOX_FIXTURE_POLICY_BODY,
  DECISION_SANDBOX_FIXTURE_POLICY_HASH,
  DECISION_SANDBOX_LIMIT_CEILINGS,
  DECISION_SANDBOX_POLICY_HASH_DOMAIN,
  DECISION_SANDBOX_UNESTABLISHED_PROPERTIES,
  computeDecisionSandboxPolicyHash,
  validateDecisionSandboxPolicy,
} from "../../src/decision-sandbox/index.js";
import { clone, codes, FIXTURE_ROOT, load, type Mutable } from "./helpers.js";

const policy = (): Mutable => clone(DECISION_SANDBOX_FIXTURE_POLICY) as Mutable;
/** Recomputes the self-hash; non-canonicalizable values keep a dummy hash. */
const rehash = (value: Mutable): Mutable => {
  let policy_hash = "0".repeat(64);
  try {
    policy_hash = computeDecisionSandboxPolicyHash(value as never);
  } catch {
    // e.g. a fractional limit, which the validator rejects on its own
  }
  return { ...value, policy_hash };
};

describe("AI-143 decision sandbox policy", () => {
  it("is one fixed, valid, hash-pinned fixture policy", () => {
    assert.equal(
      DECISION_SANDBOX_POLICY_HASH_DOMAIN,
      "vlatam-ai-lab:decision-sandbox-policy:v1",
    );
    assert.equal(
      computeDecisionSandboxPolicyHash(DECISION_SANDBOX_FIXTURE_POLICY_BODY),
      DECISION_SANDBOX_FIXTURE_POLICY_HASH,
    );
    assert.equal(
      DECISION_SANDBOX_FIXTURE_POLICY_HASH,
      "6bad0bd18d779acb838ecf37e561d1678b13f0b53649acf40810972b03bc8378",
    );
    assert.equal(validateDecisionSandboxPolicy(policy()).ok, true);
    assert.deepEqual(
      load(`${FIXTURE_ROOT}/valid-sandbox-policy.json`),
      policy(),
    );
    assert.equal(Object.isFrozen(DECISION_SANDBOX_FIXTURE_POLICY), true);
  });

  it("states bounded limits, one process, no retry, no fallback and no output authority", () => {
    const p = DECISION_SANDBOX_FIXTURE_POLICY;
    assert.equal(p.policy_id, "ai-lab-decision-sandbox-fixture-policy");
    assert.equal(p.policy_version, "1.0.0");
    assert.equal(p.executable_subject_kind, "synthetic_fixture_adapter");
    assert.equal(p.max_processes, 1);
    assert.equal(p.automatic_retries, 0);
    assert.equal(p.fallback, "none");
    assert.equal(p.output_authority, "none");
    for (const key of Object.keys(
      DECISION_SANDBOX_LIMIT_CEILINGS,
    ) as (keyof typeof DECISION_SANDBOX_LIMIT_CEILINGS)[]) {
      assert.ok(Number.isSafeInteger(p[key]) && p[key] > 0, key);
      assert.ok(p[key] <= DECISION_SANDBOX_LIMIT_CEILINGS[key], key);
    }
  });

  it("records honest isolation claims: OS-level isolation and hostile-code containment are not established", () => {
    const p = DECISION_SANDBOX_FIXTURE_POLICY;
    assert.equal(p.network_claim, "not_established");
    assert.equal(p.filesystem_claim, "not_established");
    assert.equal(p.hostile_code_containment, "not_established");
    assert.deepEqual(p.unestablished_properties, [
      "gpu_isolation",
      "hostile_code_containment",
      "interpreter_hash_binding",
      "model_supply_chain_safety",
      "os_filesystem_namespace",
      "os_network_namespace",
      "resource_quota_enforcement",
    ]);
    assert.deepEqual(p.enforced_controls, [
      ...DECISION_SANDBOX_ENFORCED_CONTROLS,
    ]);
    for (const control of p.enforced_controls)
      assert.doesNotMatch(control, /namespace|isolation|containment|secure/);
    assert.deepEqual([...DECISION_SANDBOX_UNESTABLISHED_PROPERTIES].sort(), [
      ...DECISION_SANDBOX_UNESTABLISHED_PROPERTIES,
    ]);
  });

  it("rejects a tampered policy hash", () => {
    assert.deepEqual(
      codes(
        validateDecisionSandboxPolicy({
          ...policy(),
          policy_hash: "a".repeat(64),
        }),
      ),
      ["policy_hash_mismatch"],
    );
    assert.deepEqual(
      codes(validateDecisionSandboxPolicy({ ...policy(), timeout_ms: 2_000 })),
      ["policy_hash_mismatch"],
    );
  });

  it("rejects a different, self-consistent policy as unsupported: there is no other profile", () => {
    const tuned = rehash({ ...policy(), timeout_ms: 2_000 });
    assert.deepEqual(codes(validateDecisionSandboxPolicy(tuned)), [
      "policy_unsupported",
    ]);
    const renamed = rehash({
      ...policy(),
      policy_id: "ai-lab-production-policy",
    });
    assert.deepEqual(codes(validateDecisionSandboxPolicy(renamed)), [
      "policy_unsupported",
    ]);
  });

  it("rejects excessive, zero, fractional and unbounded limits", () => {
    for (const [key, value] of [
      ["timeout_ms", 600_000],
      ["timeout_ms", 0],
      ["timeout_ms", "unlimited"],
      ["timeout_ms", null],
      ["max_stdout_bytes", 10_485_760],
      ["max_stderr_bytes", 1.5],
      ["max_input_bytes", -1],
      ["max_processes", 2],
    ] as const)
      assert.ok(
        codes(
          validateDecisionSandboxPolicy(rehash({ ...policy(), [key]: value })),
        ).includes("policy_limit_invalid"),
        `${key}=${String(value)}`,
      );
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({ ...policy(), automatic_retries: 1 }),
        ),
      ).includes("policy_limit_invalid"),
    );
  });

  it("rejects network authority, upgraded isolation claims and dropped unestablished properties", () => {
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({ ...policy(), network_claim: "enforced" }),
        ),
      ).includes("policy_claim_invalid"),
    );
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({ ...policy(), hostile_code_containment: "established" }),
        ),
      ).includes("policy_claim_invalid"),
    );
    const network = codes(
      validateDecisionSandboxPolicy(
        rehash({ ...policy(), network: "allowed" }),
      ),
    );
    assert.ok(network.includes("execution_control_forbidden"));
    assert.ok(network.includes("unknown_property"));
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          load(`${FIXTURE_ROOT}/invalid-policy-dropped-isolation-claim.json`),
        ),
      ).includes("policy_claim_invalid"),
    );
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({
            ...policy(),
            enforced_controls: [
              ...policy()["enforced_controls"],
              "os_network_namespace",
            ].sort(),
          }),
        ),
      ).includes("policy_claim_invalid"),
    );
  });

  it("rejects an arbitrary command, executable, environment or production field", () => {
    for (const field of ["command", "executable", "args", "env", "shell"]) {
      const found = codes(
        validateDecisionSandboxPolicy(rehash({ ...policy(), [field]: "x" })),
      );
      assert.ok(found.includes("execution_control_forbidden"), field);
      assert.ok(found.includes("unknown_property"), field);
    }
    for (const field of [
      "production",
      "promotion_eligible",
      "routing_enabled",
    ]) {
      const found = codes(
        validateDecisionSandboxPolicy(rehash({ ...policy(), [field]: true })),
      );
      assert.ok(found.includes("production_authority_forbidden"), field);
    }
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({ ...policy(), output_authority: "downstream" }),
        ),
      ).includes("output_authority_invalid"),
    );
  });

  it("rejects an unsupported protocol, schema major or subject kind", () => {
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({ ...policy(), protocol_version: "2.0.0" }),
        ),
      ).includes("protocol_version_unsupported"),
    );
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({ ...policy(), schema_version: "2.0.0" }),
        ),
      ).includes("schema_version_unsupported"),
    );
    assert.ok(
      codes(
        validateDecisionSandboxPolicy(
          rehash({
            ...policy(),
            executable_subject_kind: "registered_decision_candidate",
          }),
        ),
      ).includes("subject_kind_invalid"),
    );
    assert.deepEqual(codes(validateDecisionSandboxPolicy(null)), [
      "contract_invalid",
    ]);
  });
});
