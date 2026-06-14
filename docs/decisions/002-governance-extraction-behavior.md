# ADR-002: Agent Extraction Behavior & Governance Compliance

## Status
Accepted (2026-06-14)

## Context
The Normative Evidence Agent is designed with strict governance rules: `human_review_required=true`, `downstream_allowed=false`, and zero tolerance for hallucination.

## Decision
When evidence is insufficient, ambiguous, or lacks official citations, the agent MUST return:
- `extraction_status: "validation_failed"` or `"critique_flagged"` 
- `extracted_claims: []` (empty array)
- `unsupported_claims: [array of claims that cannot be substantiated]` 
- `warnings: [explanation of evidence gaps]` 

This is NOT a failure. It is correct, compliant behavior.

## Rationale
1. Customs classification carries legal and financial liability
2. Forcing claims to achieve `draft_unreviewed` status violates Rule 1 & 4 of SYSTEM_PROMPT
3. `unsupported_claims` provides actionable audit trail for human reviewers
4. Aligns with industry best practices for AI in regulated domains

## Consequences
- Positive: Zero hallucination risk, clear audit trail, human-in-the-loop enforced
- Negative: Lower "success rate" if measured by `extracted_claims.length` 
- Mitigation: Success metric shifted from "number of claims" to "accuracy of claims + completeness of unsupported_claims"

## Verification
Run `pnpm ai:extract <packet>` on sparse evidence. Output must contain `validation_failed` with detailed `unsupported_claims`, not empty or fabricated data.

## Current Pipeline Results (2026-06-14)

With enriched unified packet (ARCA + VUCE Notes + InfoLEG):
- **Status**: `draft_unreviewed` ✅
- **Confidence**: 0.6
- **Extracted claims**: 7
- **Unsupported claims**: 3
- **Governance**: human_review_required=true, downstream_allowed=false

This demonstrates the agent successfully reasoning over multi-source evidence while maintaining strict governance compliance.
