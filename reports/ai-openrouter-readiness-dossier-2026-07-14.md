# OpenRouter readiness dossier evidence report — 2026-07-14

Status update: the separate sandbox-enablement proposal now binds this dossier
by exact version and hash, but remains `blocked`. Its profile metadata is
disabled and proposal-only; this update does not change dossier evidence,
approval, or runtime authority.

## Local source snapshot

- branch started from clean `main`;
- refreshed `main` and `origin/main`: `f74e31b06083bb46c5863e5dd6f70cf4828341bf`;
- PR #101 merged at `2026-07-14T17:50:59Z`, merge commit `f74e31b`;
- local governed chain verified:
  `registry → resolution → authorization → exact policy → atomic consumption → gateway → disabled adapter`;
- Graphify baseline absent, so local source files were inspected directly.

## Scope and derived deltas

This task adds a schema-validated dossier contract, one repository-backed
candidate dossier, a pure evaluator, focused tests, process documentation, and
this report. It does not change registries, profiles, adapter configuration,
gateway/authorization/consumption code, migrations, or persistence.

The candidate identity is exactly:

- OpenRouter model: `minimax/minimax-m2.7`;
- upstream provider: `minimax`; exact revision/endpoint unverified;
- model entry: `openrouter.minimax-m2.7.variable.v1@1.0.0`;
- route: `openrouter.minimax-m2.7.variable-route.v1@1.0.0`;
- profile candidate: `openrouter.minimax-m2.7.normative-extraction.candidate`
  (absent and not enabled);
- capability: `evidence.extraction.normative_claims`.

## Readiness outcome and blockers

Outcome: `blocked`.

- exact upstream route not proven; current route evidence is variable;
- pricing conflicting; exact identity, effective date, rates, and bounded
  policy absent;
- privacy, retention, training use, ZDR, and geography unverified;
- strict JSON Schema suitability unverified;
- capability benchmark missing;
- exact upstream terms/legal review incomplete;
- evidence reviewer identity and separate human approval missing;
- mandatory risks open;
- no OpenRouter execution profile exists; entries, route, and adapter disabled.

## Assumptions and limitations

- Repository evidence is a local reviewed snapshot, not current external truth
  or production approval.
- No web/provider source was fetched for implementation or tests.
- No pricing, privacy, ZDR, benchmark, route, or capability fact was invented.
- The dossier evaluates readiness only and never authorizes execution.
- External re-review and account configuration require separate approval.

## Validation evidence

- focused dossier tests: 25 passed, 0 failed;
- relevant registry, resolver, authorization, atomic store, gateway, provider
  evidence, schema, and architecture tests: 206 passed, 0 failed;
- full suite: 858 passed, 0 failed;
- typecheck and build: passed;
- scoped ESLint: 0 errors; six ignored-file warnings for JSON/Markdown;
- scoped Prettier: passed;
- repository-wide ESLint baseline: 43 pre-existing errors outside task files;
- repository-wide Prettier baseline: 198 pre-existing mismatched files outside
  task scope;
- dossier hash, `git diff --check`, boundary scan, and generated-file scan:
  passed.

## Human review route

Reviewers must resolve every mandatory risk and issue a separate approval
limited to `sandbox_enablement_proposal_only`. It cannot enable execution.
