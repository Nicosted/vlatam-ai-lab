# AI-84 regulatory dossier lifecycle

## Purpose and boundary

The regulatory dossier is the repository-owned intake contract for a regulatory case. It records client-supplied facts, documentary evidence, provenance, separate AR/ES/EU coverage, missing or conflicting evidence, and professional-review requirements before research begins.

It is not legal advice, an HS/NCM classification, customs clearance, registration, market authorization, certification, or an approved downstream artifact. It is provider-neutral and contains no provider/model fields, credentials, runtime routing, network behavior, or raw private document content.

## Lifecycle

1. **Collect:** an operator creates a new dossier/case version from client facts and repository-relative evidence references. A filename, brand, catalog description, or ecological label never fills composition, intended use, certification, classification, or regulatory status.
2. **Validate:** `schemas/regulatory-dossier-intake.schema.json` checks the versioned shape. The deterministic evaluator rejects unsafe metadata, credentials, malformed/path-traversing references, duplicate IDs, false review state, cross-jurisdiction evidence reuse, conflicts, legal conclusions, and downstream approval.
3. **Evaluate intake:** missing intended use, active ingredients/concentrations, SDS/MSDS, or importer identity yields machine-readable missing-evidence codes. Material conflicts and safety violations yield blocker codes. Evaluation fails closed.
4. **Research:** only `ready_for_research` may enter local research preparation. Research sources remain scoped to Argentina, Spain, or the EU; coverage never transfers implicitly across jurisdictions.
5. **Professional review:** regulated findings require reviewed repository artifacts from the required professional roles. `human_review_required` remains true.
6. **Advisory assembly:** the existing advisory read-model may consume the dossier summary while retaining its own source-review gates. The dossier itself can never authorize downstream use.

## Readiness semantics

| State                           | Meaning                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `intake_incomplete`             | Required client facts or evidence are missing.                                                           |
| `ready_for_research`            | Intake minimums are present; no conclusion or approval is implied.                                       |
| `research_in_progress`          | Local research is underway and remains unreviewed.                                                       |
| `ready_for_professional_review` | Research artifacts exist but regulated conclusions await professionals.                                  |
| `blocked`                       | Conflict, scope mismatch, unsafe metadata, false review, or another hard blocker exists.                 |
| `reviewed_advisory_ready`       | Reserved for a future separately reviewed advisory lifecycle; never produced from intake evidence alone. |

The evaluator currently produces only `intake_incomplete`, `ready_for_research`, or `blocked`. Later states require separate reviewed research/advisory artifacts and must not be inferred by intake.

## Integration and exposure

The research workspace embeds the dossier and evaluation and renders only safe summaries: dossier/case identity, trade lane, product placeholders, evidence states, AR/ES/EU coverage, blocker/missing codes, required professional reviews, readiness, and non-advice notices. It does not render repository paths, document contents, reviewer identities, provider/model metadata, or credentials.

Approved-artifact and classifier export contracts are unchanged. `downstream_allowed` remains false on both dossier and initial advisory output.

## Versioning and review

- Increment `case_version` when client facts/evidence change; keep `case_id` stable.
- Increment `schema_version` under semantic versioning when the contract changes.
- Evidence IDs are unique within a dossier and dossier IDs are unique in a collection.
- Store only repository-relative references permitted by the schema; raw client documents require a separately approved privacy/retention workflow.
- Human review is mandatory before any regulated conclusion or client-facing recommendation.
