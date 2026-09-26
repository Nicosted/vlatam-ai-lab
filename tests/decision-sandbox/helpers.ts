import { readFileSync, readdirSync } from "node:fs";

import type { DecisionCandidateEntry } from "../../src/decision-candidates/index.js";
import { computeTypedDecisionRequestHash } from "../../src/decision/canonical.js";
import type { TypedDecisionRequest } from "../../src/decision/contracts.js";
import {
  DECISION_SANDBOX_FIXTURE_ADAPTER,
  DECISION_SANDBOX_FIXTURE_POLICY,
  type DecisionSandboxValidation,
  type DecisionSandboxIssueCode,
} from "../../src/decision-sandbox/index.js";

export const FIXTURE_ROOT = "data/fixtures/decision-sandbox";

export function load<T = unknown>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Mutable = Record<string, any>;

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function booleanRequest(): TypedDecisionRequest {
  return load<TypedDecisionRequest>(
    "data/fixtures/typed-decision/valid-boolean-request.json",
  );
}

/** A valid execution request for the allowlisted fixture adapter. */
export function executionRequest(
  executionId = "sandbox-fixture-execution-0001",
  request: TypedDecisionRequest = booleanRequest(),
): Mutable {
  const policy = DECISION_SANDBOX_FIXTURE_POLICY;
  const adapter = DECISION_SANDBOX_FIXTURE_ADAPTER;
  return {
    contract: "decision_sandbox_execution_request",
    schema_version: "1.0.0",
    execution_id: executionId,
    policy: {
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      policy_hash: policy.policy_hash,
    },
    subject: {
      subject_kind: "synthetic_fixture_adapter",
      adapter_id: adapter.adapter_id,
      adapter_version: adapter.adapter_version,
      artifact_sha256: adapter.artifact_sha256,
      protocol_version: adapter.protocol_version,
    },
    request: clone(request),
    request_hash: computeTypedDecisionRequestHash(request),
    output_authority: "none",
  };
}

/** Selects one of the fixture adapter's closed deterministic behaviours. */
export function behaviorRequest(behavior: string): Mutable {
  return executionRequest(`fixture-behavior-${behavior}-0001`);
}

export const SEED_REGISTRY_ROOT = "data/decision-candidates/v1";

/** The AI-142 seed registry entries, read-only. */
export function seedCandidates(): DecisionCandidateEntry[] {
  return readdirSync(`${SEED_REGISTRY_ROOT}/candidates`)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      load<DecisionCandidateEntry>(`${SEED_REGISTRY_ROOT}/candidates/${name}`),
    );
}

export function codes<T>(
  check: DecisionSandboxValidation<T>,
): DecisionSandboxIssueCode[] {
  return check.ok ? [] : check.issues.map((issue) => issue.code);
}
