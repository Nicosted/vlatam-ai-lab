# PCRAM Human Review Gate Contract (P0)

## Purpose

Define mandatory human decision checkpoints before any downstream use of PCRAM analytical artifacts.

This contract is documentation-only for P0. It does not authorize runtime execution.

## Reviewer responsibilities

- Verify source provenance and local-only handling.
- Verify snapshot integrity and schema compliance evidence.
- Verify delta interpretation, affected codes, and risk level rationale.
- Verify evidence report assumptions/limitations are explicit.
- Verify personalization assumptions (specialization, jurisdiction scope, topics, preferred style) against approved broker/user profile context.
- Approve or reject downstream handoff.

## Approval and rejection outcomes

- **Approved**:
  - Artifact set may proceed to an explicitly approved downstream sandbox step.
- **Rejected**:
  - Artifact set is blocked; findings return for correction/re-analysis.
- **Needs clarification**:
  - Reviewer requests additional local evidence before decision.

## Downstream integration restrictions

- No production integration is allowed from this gate in P0.
- No autonomous classifier write-back is allowed.
- Any future integration must pass separate governance approval.

## Escalation rules

Escalate to governance owner when:

- Source authenticity is uncertain.
- Risk assessment is disputed.
- Regulatory interpretation is ambiguous or high impact.
- Contract boundaries were violated or cannot be verified.
