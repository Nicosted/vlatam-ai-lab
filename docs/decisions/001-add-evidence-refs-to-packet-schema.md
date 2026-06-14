# ADR-001: Add evidence_refs to extractable-evidence-packet schema

## Status
Accepted (2026-06-14)

## Context
The Normative Evidence Agent requires evidence references to build context for DeepSeek reasoning. The original `extractable-evidence-packet.schema.json` did not include an `evidence_refs` field, creating a mismatch between the agent's requirements and the schema contract.

## Problem
Without `evidence_refs` in the packet schema:
- Agent cannot know which sources to cite in extraction results
- No traceability between evidence packet and extraction output
- Schema validation fails when agent tries to access evidence references
- Inconsistency with other PCRAM schemas that already use `evidence_refs` 

## Decision
Add `evidence_refs` field to `schemas/extractable-evidence-packet.schema.json` as an **optional** array field with the following structure:

```json
{
  "evidence_refs": {
    "type": "array",
    "items": {
      "type": "object",
      "required": ["source_id", "snapshot_id"],
      "properties": {
        "source_id": { "type": "string", "minLength": 1 },
        "snapshot_id": { "type": "string", "minLength": 1 },
        "section_label": { "type": "string" },
        "article_number": { "type": "string" },
        "excerpt": { "type": "string" }
      }
    }
  }
}
```

## Rationale
1. **Ecosystem alignment**: `evidence_refs` already exists in 8 other PCRAM schemas:
   - review-manifest.schema.json
   - relevance-assessment.schema.json
   - approved-artifact.schema.json
   - jurisdiction-pack.schema.json
   - classifier-intelligence-artifact.schema.json
   - approved-kb-snapshot.schema.json
   - classifier-approved-artifact-export-contract.schema.json
   - evidence-report-metadata.schema.json

2. **Backward compatibility**: Field is optional, so existing packets without `evidence_refs` remain valid

3. **Agent requirement**: The Normative Evidence Agent needs evidence references to:
   - Build context for DeepSeek reasoning
   - Maintain traceability between packet and extraction
   - Generate proper citations in extraction results

4. **Consistency**: Aligns `extractable-evidence-packet` with the broader PCRAM schema ecosystem

## Consequences

### Positive
- ✅ Agent can now build context from evidence references
- ✅ Traceability maintained between packet and extraction result
- ✅ Consistent with ai-extraction-result schema
- ✅ Aligns with 8 other PCRAM schemas
- ✅ Backward compatible (optional field)

### Negative
- ⚠️ Breaks compatibility with any code assuming old schema structure
- ⚠️ Requires updating existing packets to include evidence_refs (mitigated: all packets updated in same commit)

### Mitigations
- Field is optional, so old packets remain valid
- All existing packets updated in commit cf44fff
- run-extraction.ts updated to use schema-compliant field names

## Alternatives Considered

### Alternative 1: Keep evidence_refs outside schema
**Rejected**: Breaks schema validation, creates inconsistency

### Alternative 2: Use different field name
**Rejected**: `evidence_refs` is standard terminology across PCRAM ecosystem

### Alternative 3: Load evidence from separate file
**Rejected**: Adds complexity without benefit, breaks single-file-per-artifact pattern

## Implementation
- Schema updated in commit: cf44fff
- run-extraction.ts updated to use `evidence_packet_id` (schema-compliant)
- All existing packets validated against updated schema
- No breaking changes to agent code

## Verification
```bash
# Validate all packets
pnpm ai:validate-packet snapshots/pcram/extractable-evidence-packet-test-minimal-2026-06-14.json
pnpm ai:validate-packet snapshots/pcram/extractable-evidence-packet-ar-arancel-4202-92-00-2026-06-14.json

# Validate all extractions
pnpm ai:validate-extraction snapshots/pcram/ai-extraction-result-*.json
```

## References
- Commit: cf44fff (real data - ARCA packet)
- Schema: schemas/extractable-evidence-packet.schema.json
- Agent: src/agents/normative-evidence-agent.ts
- Related schemas: see list above
