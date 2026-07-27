# AI-136 Operator Read Model asset-packaging evidence

## Local source snapshot

- Repository: `vlatam-ai-lab`
- Baseline branch: `main`
- Baseline and cached `origin/main`:
  `fc381605e8ebb38f009c63a0f835a9cacf53a28a`
- Implementation branch:
  `fix/ai-136-package-operator-read-model-assets`
- Initial index and worktree: clean
- Graphify baseline: absent; direct source verification used
- Network, Vercel project, Cloudflare, DNS, credential, provider, scheduler,
  ARCA, database, and `vlatam-global` access: none

## Derived delta

AI-136:

- extracts the exact 21 repository-relative Operator Read Model inputs into the
  canonical exported `OPERATOR_READ_MODEL_ARTIFACTS` manifest;
- uses that manifest as the runtime loader contract;
- explicitly includes the same exact files through the existing legacy
  `@vercel/node` build;
- resolves the production asset root from the packaged `api/index.*` module
  rather than `process.cwd()`;
- preserves explicit `repository_root` injection for tests and local tools;
- adds deterministic package-layout, unrelated-cwd, omission, fail-closed, and
  Vercel contract tests; and
- documents immutable repository-current snapshot semantics and rollback.

No authentication, identity mapping, route authorization, validator,
classification, provider/runtime readiness, execution authority, scheduler,
ARCA, database, credential, deployment, DNS, or external integration behavior
is changed.

## Assumptions and limitations

- The existing legacy `builds`/`routes` configuration remains the deployment
  model.
- `@vercel/node` preserves explicitly included repository-relative paths under
  the function root.
- The known packaged entrypoint location remains `api/index.*`.
- The 21 files are immutable deployment inputs, not live production state.
- This local task does not build or inspect a real Vercel deployment artifact
  and performs no deployment.
- Future durable operational state requires a separate governed project.

## Fail-closed contract

Missing or malformed packaged inputs still produce
`missing_or_malformed_artifact:<key>`, `source_valid=false`,
`overall_status=invalid_state`, and the safe Spanish HTTP 500 page. No default
or fabricated state is introduced, and detailed filesystem paths remain absent
from browser output.

## Validation

| Check                                                                                   | Result                               |
| --------------------------------------------------------------------------------------- | ------------------------------------ |
| Focused packaging, Operator, shell, Cloudflare identity, Vercel, and architecture tests | 108/108 passed across 11 suites      |
| Full repository suite                                                                   | 1,395/1,395 passed across 164 suites |
| `pnpm run build:production`                                                             | passed                               |
| `pnpm run typecheck`                                                                    | passed                               |
| Scoped ESLint                                                                           | passed                               |
| Scoped Prettier                                                                         | passed                               |
| `git diff --check`                                                                      | passed                               |

The sandboxed `tsx` CLI could not create its local temporary IPC socket. The
full unchanged `pnpm test` command passed when permitted to create that socket;
no network or external service was used.

## Human review gate

Human review must confirm:

1. the canonical manifest contains exactly the 21 reviewed inputs;
2. Vercel includes exactly the manifest and no broad or sensitive path;
3. production no longer depends on `process.cwd()` or a Git checkout;
4. all validators and invalid-state behavior remain intact;
5. authentication and route authorization are unchanged;
6. provider, scheduler, ARCA, database, credential, deployment, DNS, and
   `vlatam-global` boundaries remain intact; and
7. deployment or rollback remains a separate human-authorized action.
