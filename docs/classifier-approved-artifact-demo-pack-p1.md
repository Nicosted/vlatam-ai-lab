# Classifier Approved Artifact Demo Pack P1

## Purpose

Document how the approved artifact demo pack would be consumed later by the
vLatamGlobal Classifier **without** any direct database, schema, or runtime
coupling. This note is a P1 companion to the demo pack fixtures and report; it
is design-only and introduces no live integration.

## Pack contents

- `snapshots/pcram/demo-classifier-decision-relevance-assessment.json` — reviewed classification decision-support content (the `relevance_assessment`).
- `snapshots/pcram/demo-classifier-decision-review-manifest.json` — machine-checkable human-review record and approval scope.
- `snapshots/pcram/demo-classifier-decision-approved-artifact.json` — approved artifact envelope binding the content by hash and review manifest.
- `snapshots/pcram/demo-classifier-decision-export-contract.json` — read-only export contract entry exposing only reviewed, eligible artifacts.
- `snapshots/pcram/invalid-classifier-decision-export-contract-unreviewed-eligible.json` — counter-example proving the schema rejects unreviewed-but-eligible artifacts.

## Consumption model (no DB coupling)

The integration boundary is the **reviewed, versioned artifact**, never a shared
database row or runtime object.

1. vLatamGlobal reads the export contract (a future read-only API response or an
   exported fixture), filtering on `downstream_eligible: true`.
2. For each eligible entry it resolves the `approved_artifact` envelope by
   `artifact_id` / `artifact_version`.
3. It verifies trust locally: `review_status: approved`, the `review_manifest_ref`
   approval scope, and the `content_hash` against the referenced content.
4. It fetches the referenced `relevance_assessment` (the classification
   candidate, rationale, codes, risk, and limitations) as decision support.
5. It renders the candidate to a broker inside the Classifier Workbench and
   records its own runtime-side human review decision.

At no point does vLatamGlobal read a `vlatam-ai-lab` database, import lab runtime
code, share migrations, or write back into the lab. The artifact is copied by
value (envelope + hashed content reference), so the two systems stay decoupled.

## What stays on each side

`vlatam-ai-lab` owns: source monitoring, deltas, evidence, reviewed relevance
assessments, approval/review manifests, content hashing, and publication
readiness.

vLatamGlobal owns: runtime classifier decisions, broker workflow, human override,
operational audit trail, and final client presentation.

## Hard boundaries (unchanged)

- No shared database and no schema-as-shared-model coupling.
- No import of vLatamGlobal runtime code into this repo, and no lab runtime code
  copied into vLatamGlobal.
- No raw LLM output flow; only reviewed, versioned artifacts cross the boundary.
- Unreviewed artifacts are never marked downstream-ready (enforced by the export
  contract schema's conditional rules).
- Reviewed/versioned artifacts remain the only integration boundary.

## References

- `reports/classifier-approved-artifact-demo-pack-p1.md`
- `docs/reviewed-artifact-api-handoff-p0.md`
- `docs/classifier-lab-runtime-boundary-p0.md`
