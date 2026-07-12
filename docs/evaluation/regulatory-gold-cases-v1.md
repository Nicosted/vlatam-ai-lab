# Regulatory Gold Cases v1

This small, versioned corpus evaluates whether a regulatory assistant identifies scope, asks for missing facts, preserves conditional paths, cites evidence, abstains, and escalates appropriately. It reuses AI-75 suite, case, dimension, hashing, replay, report, and audit contracts; it is not a parallel runner or scoring system.

## Inclusion and authoring

Cases must be synthetic or sanitized, minimal, jurisdiction-scoped, evidence-backed, and useful for more than exact prose matching. Expected outcomes use structured required facts, acceptable alternatives, forbidden assertions, abstention conditions, evidence, clarification questions, and human-review triggers. A case must never encode credentials, personal data, unrestricted prompts, provider content, customer facts, copied legal text, or an invented conclusion.

## Provenance, review, and time

Every case references suite-level provenance and evidence identifiers, and records source authority, jurisdiction, snapshot version, access/effective dates, authoring status, reviewer role, and temporal validity. Approval additionally requires reviewer identity and review time. Missing or conflicting provenance, versions, temporal metadata, dimensions, expected fields, or approval metadata fails closed.

The initial Argentina-to-Spain/EU agricultural-input cases are `in_review`. Repository evidence does not currently establish reviewed Spain/EU requirements or a definitive fertilizer, biostimulant, plant-protection, pesticide, or adjacent classification. Those questions intentionally require clarification, abstention, and regulatory-counsel review.

Supersession is explicit through case versions and optional `supersedes`/`superseded_by` references. Do not silently edit an approved case's meaning; issue a new version and preserve review traceability.

## Workflow and limitations

Authors run `pnpm ai:evaluation:validate-gold`, focused tests, and the full local verification suite. A regulatory reviewer then checks the cited repository snapshots and may approve, reject, or supersede a case. Validation is deterministic and offline; it does not call providers or adapters and cannot provide legal approval.

AI-77 may load this suite through the AI-75 evaluator for a benchmark campaign. AI-78 may later compare reviewed results. Neither campaign execution, ranking, routing, nor production behavior is implemented here.
