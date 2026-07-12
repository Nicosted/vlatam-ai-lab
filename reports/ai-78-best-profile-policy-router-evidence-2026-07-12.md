# AI-78 implementation evidence — 2026-07-12

## Local source snapshot context

- Branch: `feat/ai-78-best-profile-policy-router`
- Baseline: clean local `main` before branch creation.
- Graphify: no `graphify-out/graph.json` baseline existed, so the audit used targeted local source inspection.
- Reviewed surfaces: capability registry/contracts, execution profiles/catalog/gateway boundary, AI-73 privacy enforcer, AI-74 budget policy, AI-75 canonical hashing/evaluation, AI-76 suite contracts, AI-77 campaign/ranking/provenance/audit, schemas, fixtures, CLI conventions, and approved artifact/export boundary documentation.

## Derived deltas

- Added versioned routing policy, reviewed evidence, request, decision, candidate, eligibility, fallback/rejection, provenance, and review-attestation TypeScript contracts and JSON Schemas.
- Added a deterministic fail-closed router that verifies completed AI-77 evidence and resolves exact canonical profile versions through the existing profile catalog contract.
- Reused the capability registry, AI-73 privacy enforcement, AI-74 public budget-class/reference surface, AI-75 hashing, and AI-77 campaign/ranking evidence.
- Added metadata-only audit events, explicit fallback behavior, deterministic CLI commands, scenario fixtures, tests, documentation, and schema-registry entries.
- Did not change gateway, provider, adapter, registry state, approved artifacts, exports, deployment, or environment configuration.

## Assumptions and limitations

- Existing AI-77 treats benchmark `profile_version` as the resolved execution profile `contract_version`; AI-78 preserves that public contract.
- Budget routing eligibility is classification/reference compatibility only. Pricing, reservation, and runtime enforcement intentionally remain in AI-74/gateway code.
- Production activation and persistence are intentionally absent and require a future reviewed operational action.
- Fixture scenarios are expressed as deterministic mutations over the test's valid reviewed-winner baseline to avoid duplicating large AI-77 artifacts.

## Validation evidence

- `pnpm typecheck` — passed.
- Routing policy and reviewed-evidence CLI schema validation — passed.
- Targeted ESLint over `src/routing`, the routing CLI, and routing tests — passed.
- `pnpm test` — 559 tests passed across 112 reported top-level suites; 0 failed.
- Repository-wide `pnpm lint` remains red on 115 pre-existing errors outside AI-78; the one AI-78 lint finding was fixed before targeted lint passed.
- No network, provider credentials, production services, migrations, commits, or pushes were used.

## Human review gate

Review the policy semantics, exact-version interpretation, fallback reason allowlist, schema strictness, and future gateway handoff before any activation or commit.
