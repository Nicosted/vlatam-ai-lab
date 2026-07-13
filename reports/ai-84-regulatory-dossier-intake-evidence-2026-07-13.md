# AI-84 regulatory dossier intake evidence — 2026-07-13

## Local source snapshot and pre-change audit

- Repository: `vlatam-ai-lab`; baseline: clean `main` after AI-82; branch: `feat/ai-84-regulatory-case-evidence-intake`.
- Graphify baseline: absent, so governance required direct inspection of the relevant local files.
- Inspected the research workspace/read-model, ecological agrochemical fixtures, AI-71 capability contracts, AI-73 privacy/retention contracts, AI-75 evaluation contracts, AI-76 gold cases, AI-77 benchmark integration, approved-artifact/export boundaries, read-only HTTP route, AI-82 evidence report, candidate readiness, execution profiles, and adapter registry.
- AI-83 remains gated: both candidates are disabled and runtime-blocked; this change adds no adapter, provider SDK, credential, environment requirement, model/provider call, benchmark, or routing.

Pre-change delta:

1. Case/trade/product facts were split between workspace and advisory fixture without a versioned dossier identity.
2. Evidence used broad `missing`/`needs_review` placeholders without document-level provenance or an explicit distinction between provided and reviewed.
3. AR, ES, and EU source coverage existed in advisory areas but was not tied deterministically to client evidence.
4. Missing/conflicting evidence and readiness lacked a shared machine-readable reason-code contract.
5. The HTML route did not render a canonical dossier inventory, jurisdiction coverage, or deterministic blockers.

## Implementation delta

- Added the provider-neutral TypeScript contract/evaluator and JSON Schema `1.0.0`.
- Added a non-sensitive AR-to-ES/EU ecological agrochemicals dossier and 17 mutation fixtures for every required invalid/blocked scenario.
- Integrated the dossier summary into the advisory read-model and canonical dossier/evaluation into the existing research workspace.
- Expanded the read-only HTML view with safe dossier identity, trade/product context, evidence inventory, AR/ES/EU coverage, blockers, missing codes, professional reviews, and notices.
- Added lifecycle architecture, operator collection guide, schema-registry entry, roadmap milestone, and focused compatibility tests.

## Initial dossier status

- Readiness: `intake_incomplete` (never `reviewed_advisory_ready`).
- Missing: intended use, active ingredients, SDS/MSDS, and importer. Concentrations will also be required when ingredients are supplied.
- Blocker: professional review remains required.
- The ecological description is `provided_unreviewed`; it is not certification or eligibility evidence.
- `human_review_required: true`; `downstream_allowed: false`.

## Assumptions and limitations

- Real client identity/document content is unavailable, so non-sensitive placeholders and repository-relative references are used.
- The evaluator only advances intake to `ready_for_research`; research/review/advisory promotion requires future reviewed artifacts.
- No legal, customs, tariff, chemical, product, environmental, certification, registration, or market-access conclusion is produced.
- Approved-artifact and export contract semantics are unchanged.

## Validation record

- Focused AI-84/advisory/workspace/HTTP tests: 41 passed, 0 failed.
- AI-71/AI-76/AI-77/advisory compatibility selection: 114 passed, 0 failed.
- Full repository suite: 618 passed, 0 failed. Typecheck and build passed.
- Targeted ESLint, targeted Prettier, and `git diff --check`: passed.
- JSON Schema/base fixture validation and all 17 invalid/blocked scenario reason-code checks: passed.
- Credential-value and absolute-path scans: clean. Provider/adapter/SDK/network-call scan: clean. Protected approved-artifact/export/execution/provider surfaces: unchanged.
- Both AI-83 candidates remain disabled and runtime-blocked; neither is registered for live execution.
- All implementation and checks are local and deterministic. No network, provider, adapter, SDK, model, production service, or external repository was accessed.
