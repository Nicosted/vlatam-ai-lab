# AI Lab Dependency and Runtime Cleanup Evidence

Date: 2026-07-13

Review state: local evidence for human review; no deployment or provider execution authorized

## 1. Baseline commit

- Repository: `Nicosted/vlatam-ai-lab`
- Baseline: `2622fbc4077cef8f6d7a354e6a4b2518b99f9b7a`
- Baseline conditions: clean `main`, PR #91 present, retired direct-provider and Worker entry points absent, and 621 tests passing.

## 2. Dependency inventory

| Dependency                  | Runtime imports                                                                         | Type-only imports                                                                                      | Test imports/use                                      | Script/config references                                                                      | Documentation-only references                    | Retained consumer                                                           | Decision        |
| --------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | --------------- |
| `@langchain/langgraph`      | None                                                                                    | None                                                                                                   | Boundary-test denylist only; no import                | Package and lockfile only                                                                     | Historical spike/audit and capability map        | None                                                                        | `REMOVE`        |
| `@cloudflare/workers-types` | Ambient types used by `src/storage/r2-storage.ts` and `src/workflows/pcram-workflow.ts` | Triple-slash reference in `examples/r2-storage-example.ts`; global type declaration in `tsconfig.json` | `tests/storage/r2-storage.test.ts` uses R2 mock types | Direct dev dependency and `tsconfig.json` type declaration                                    | R2/Cloudflare historical material                | Retained R2 storage, workflow contract, example, and tests                  | `RETAIN`        |
| `@types/ajv`                | None                                                                                    | None                                                                                                   | None                                                  | Package and lockfile only                                                                     | Prior technical audit                            | None; Ajv 8 supplies its own types                                          | `REMOVE`        |
| `hono`                      | None                                                                                    | None                                                                                                   | None                                                  | Package and lockfile only                                                                     | Prior technical audit                            | None after Worker retirement                                                | `REMOVE`        |
| `openai`                    | `src/providers/openai-compatible-adapter.ts`                                            | None                                                                                                   | Adapter and execution-boundary tests                  | Direct runtime dependency                                                                     | Governed adapter and architecture docs           | Governed OpenAI-compatible adapter for disabled DeepSeek/DashScope profiles | `RETAIN`        |
| `wrangler`                  | None                                                                                    | None                                                                                                   | Retired-path assertion only                           | No `wrangler.toml` or package script; `.gitignore` retains a defensive `.wrangler/` exclusion | Explicitly retired setup/planning/audit material | None                                                                        | `REMOVE`        |
| `xlsx`                      | `src/crawlers/arca-crawler.ts`                                                          | None                                                                                                   | No direct test import                                 | `scripts/create-test-arca-excel.ts`, `crawler:arca` package script, and `.xlsx` ignore rules  | Prior technical audit                            | ARCA workbook parser and trusted fixture generator                          | `REPLACE_LATER` |

The inventory used separate source/import, test, script/config, package/lockfile, and documentation searches. A single search result was not used as proof of non-use.

## 3. Removed packages

- Runtime: `@langchain/langgraph`, `hono`
- Development: `@types/ajv`, `wrangler`
- Their now-unreachable transitive LangGraph and Wrangler/Miniflare/Workerd trees were pruned from `pnpm-lock.yaml`.

## 4. Retained packages and consumers

- `openai` remains because the governed adapter imports it. The adapters were not rewritten.
- `@cloudflare/workers-types` remains because retained source and tests still use ambient R2/Worker types. Removing it would require a separate source-contract refactor.
- `xlsx` remains because the `crawler:arca` runtime and the fixture generator import it.

## 5. `xlsx` decision

`xlsx` 0.18.5 remains reachable and is classified `REPLACE_LATER`.

- `src/crawlers/arca-crawler.ts`: parses either externally fetched ARCA workbooks (**external/untrusted**) or manually placed workbooks (**operator-supplied**).
- `scripts/create-test-arca-excel.ts`: generates a local **trusted fixture**.

The unresolved exposure is the stale npm package's known prototype-pollution and ReDoS advisory surface, recorded in the 2026-07-13 technical security audit. This is material because untrusted or operator-supplied workbooks reach the parser. A later PR should replace the parser with a maintained implementation or isolate workbook parsing behind strict size, format, resource, and process boundaries. This PR neither upgrades nor replaces it.

## 6. Node and Docker alignment

- `package.json` already required Node.js `>=22.5`.
- `README.md` already stated Node.js 22.5+.
- Both Docker stages changed from `node:20-alpine` to explicit Node 22 `node:22-alpine` images; the existing multi-stage build/runtime model is unchanged.
- `docs/deployment/api-server.md` now requires Node.js 22.5+.
- No CI workflow, `.nvmrc`, `.node-version`, Volta/asdf config, pnpm runtime declaration, or other container file exists. Historical reports were not rewritten.

## 7. Lockfile review

`pnpm install --lockfile-only` completed with pnpm 10.33.0 and downloaded no packages. The four removed direct dependencies and their unreachable transitive trees disappeared. Retained direct versions did not change; there was no unrelated major upgrade, new registry, unexpected substitution, new lifecycle script, or added provider SDK. Existing `openai`, `xlsx`, and `@cloudflare/workers-types` entries remain.

## 8. Validation

- `pnpm test`: pass, 621/621 tests.
- `pnpm typecheck`: pass without `@types/ajv`.
- `pnpm build`: pass.
- Execution-boundary/profile/provider targeted suite: pass, 54/54 tests.
- Targeted ESLint on the changed TypeScript example: pass.
- Targeted Prettier on human-authored changed files: pass. The pnpm-generated lockfile was reviewed as generated output and was not reformatted independently.
- Package scripts: all 40 local entry references validated.
- Removed-dependency import search: no imports remain.
- High-confidence credential scan: no findings.
- Changed-file absolute-path scan: no findings.
- `git diff --check`: pass.
- Repository-wide `pnpm lint`: baseline remains 43 errors in untouched crawler/validation files; no unrelated lint debt was changed.

The boundary tests confirm provider SDK imports and endpoint literals remain confined to the approved provider layer, domain code does not import adapters directly, retired Worker/Wrangler paths and scripts remain absent, automatic fallback identifiers remain absent, live profiles remain disabled, and OpenRouter/MiniMax remain blocked.

## 9. Deferred risks

- Replace or isolate `xlsx` before treating external or operator-supplied workbooks as safe parser inputs.
- Decide in a focused R2 contract PR whether retained Cloudflare ambient types should be replaced with local structural interfaces; this PR does not retire tested R2 storage contracts.
- The repository-wide 43-error lint baseline remains.
- This audit was local/static and did not perform a live vulnerability lookup, Docker image pull/build, deployment, credential use, or provider call.

## 10. Next PR

The exact next PR is **review artifact hash binding**: bind reviewed artifact identity to the reviewed content hash and validate that binding across review, export, and read boundaries. Do not start it until this PR is merged and `main` is synchronized.

## Assumptions and limitations

Historical reports, ADRs, and explicitly retired Cloudflare setup/planning documents remain immutable evidence rather than current operational instructions. `vlatam-global` is outside this repository and was not accessed or modified. All checks used local repository state and fixtures only.
