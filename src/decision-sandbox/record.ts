/**
 * AI-143 — pure construction of immutable decision sandbox execution
 * records.
 *
 * A record is evidence of what the fixture runner did. It is never
 * approval: `output_authority` is always `none` and `downstream_allowed`
 * is always `false`, whatever the status. A successful process exit does
 * not imply a valid typed result, and a valid typed result does not imply
 * approval, benchmark success or promotion eligibility.
 */

import {
  computeDecisionSandboxExecutionRecordHash,
  computeDecisionSandboxSemanticExecutionHash,
} from "./canonical.js";
import {
  DECISION_SANDBOX_CONTRACT_VERSION,
  DECISION_SANDBOX_FIXTURE_POLICY,
  type DecisionSandboxExecutionRecord,
  type DecisionSandboxExecutionStatus,
  type DecisionSandboxFixtureAdapter,
  type DecisionSandboxPreflightOutcome,
  type DecisionSandboxProcessOutcome,
  type DecisionSandboxTelemetry,
} from "./contracts.js";
import type { DecisionSandboxIssueCode } from "./validation.js";

export interface DecisionSandboxRecordFields {
  readonly execution_id: string | null;
  readonly adapter: DecisionSandboxFixtureAdapter | null;
  readonly request_hash: string | null;
  readonly status: DecisionSandboxExecutionStatus;
  readonly preflight_outcome: DecisionSandboxPreflightOutcome;
  readonly process_outcome: DecisionSandboxProcessOutcome;
  readonly protocol_result_hash: string | null;
  readonly typed_result_hash: string | null;
  readonly diagnostics: readonly DecisionSandboxIssueCode[];
  readonly telemetry: DecisionSandboxTelemetry;
}

function freezeDeep<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Builds a deeply frozen record. `semantic_execution_hash` covers the
 * semantic outcome (no telemetry); `execution_record_hash` then covers the
 * complete record, telemetry and semantic hash included.
 */
export function buildDecisionSandboxExecutionRecord(
  fields: DecisionSandboxRecordFields,
): DecisionSandboxExecutionRecord {
  const policy = DECISION_SANDBOX_FIXTURE_POLICY;
  const body: Omit<
    DecisionSandboxExecutionRecord,
    "semantic_execution_hash" | "execution_record_hash"
  > = {
    contract: "decision_sandbox_execution_record",
    schema_version: DECISION_SANDBOX_CONTRACT_VERSION,
    execution_id: fields.execution_id,
    sandbox_policy: {
      policy_id: policy.policy_id,
      policy_version: policy.policy_version,
      policy_hash: policy.policy_hash,
    },
    adapter:
      fields.adapter === null
        ? null
        : {
            adapter_id: fields.adapter.adapter_id,
            adapter_version: fields.adapter.adapter_version,
            artifact_sha256: fields.adapter.artifact_sha256,
          },
    request_hash: fields.request_hash,
    status: fields.status,
    preflight_outcome: fields.preflight_outcome,
    process_outcome: { ...fields.process_outcome },
    protocol_result_hash: fields.protocol_result_hash,
    typed_result_hash: fields.typed_result_hash,
    diagnostics: [...new Set(fields.diagnostics)].sort(),
    output_authority: "none",
    downstream_allowed: false,
    telemetry: { ...fields.telemetry },
  };
  const withSemantic = {
    ...body,
    semantic_execution_hash: computeDecisionSandboxSemanticExecutionHash(body),
  };
  return freezeDeep({
    ...withSemantic,
    execution_record_hash:
      computeDecisionSandboxExecutionRecordHash(withSemantic),
  });
}
