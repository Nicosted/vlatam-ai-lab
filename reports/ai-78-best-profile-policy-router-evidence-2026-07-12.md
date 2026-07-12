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
- PR #80 audit hardening separates pending/rejected/invalid review states, authorizes metadata-only reviewer roles, binds optional required campaign budget-policy references, rejects future timestamps, and adds narrow direct-call semantic validation.
- Did not change gateway, provider, adapter, registry state, approved artifacts, exports, deployment, or environment configuration.

## Assumptions and limitations

- Existing AI-77 treats benchmark `profile_version` as the resolved execution profile `contract_version`; AI-78 preserves that public contract.
- Budget routing eligibility checks budget class independently and, when configured, exact AI-77 campaign budget-policy ID/version membership. Pricing, reservation, and runtime enforcement intentionally remain in AI-74/gateway code.
- Production activation and persistence are intentionally absent and require a future reviewed operational action.
- Fixture scenarios are expressed as deterministic mutations over the test's valid reviewed-winner baseline to avoid duplicating large AI-77 artifacts.

## Validation evidence

- `pnpm typecheck` and `pnpm build` — passed.
- Routing policy and reviewed-evidence CLI schema validation — passed.
- Focused AI-78 router and schema tests — 13 passed; deterministic selection, explicit fallback, and pending-review fixture paths also passed independently.
- Targeted ESLint over `src/routing`, the routing CLI, and routing tests — passed.
- `pnpm test` — 567 tests passed across 113 reported top-level suites; 0 failed.
- Concurrent decision isolation, equivalent-order deterministic hashes, zero gateway/provider/adapter invocation, and no input/registry mutation are asserted in focused tests.
- Credential, prompt, personal-data, audit leakage, and forbidden execution-call scans found only the intentional audit denylist and test assertions; no payload leakage or execution call was found.
- Repository-wide `pnpm lint` remains red on 115 pre-existing errors outside AI-78; targeted AI-78 lint passes.

## Human review gate

Review the policy semantics, exact-version interpretation, fallback reason allowlist, schema strictness, and future gateway handoff before any activation or commit.
