# AI LAB independent Vercel preparation

## Non-authorizing scope

This runbook documents a future deployment. It does not authorize creating a
Vercel project, adding a domain, changing DNS, accessing credentials, or
deploying any environment.

Only AI LAB is in implementation scope. The planned application separation is:

| Domain                       | Application | Deployment boundary                                       |
| ---------------------------- | ----------- | --------------------------------------------------------- |
| `lab.vlatamglobal.com`       | AI LAB      | independent project, variables, logs, rollback, authority |
| `logistics.vlatamglobal.com` | Logistics   | independent project, variables, logs, rollback, authority |
| `payments.vlatamglobal.com`  | Payments    | independent project, variables, logs, rollback, authority |

No application may infer authority from another project, domain, environment,
log stream, or successful deployment.

## Repository-local deployment architecture

- Future project name: `vlatam-ai-lab`
- Serverless entrypoint: `api/index.ts`
- Explicit Vercel builder: `@vercel/node`
- Required package manager: `pnpm@10.28.0`
- Local production validation: `pnpm run build:production`
- Routing and security preparation: `vercel.json`
- Liveness: `GET /healthz`
- Application overview: `GET /`
- Required non-secret variables:
  - `AI_LAB_DEPLOYMENT_ENV=preview` for preview;
  - `AI_LAB_RUNTIME_MODE=preview` for preview;
  - `AI_LAB_DEPLOYMENT_ENV=production` for production;
  - `AI_LAB_RUNTIME_MODE=production` for production;
  - `AI_LAB_PUBLIC_ORIGIN` set to that environment's exact HTTPS origin.

The entrypoint validates deployment/runtime-mode agreement before serving
requests. Missing, unknown, or inconsistent values fail closed. A production
value with a non-HTTPS origin fails closed. Preview and Production do not honor
local role headers and resolve anonymous until a reviewed trusted identity
resolver is implemented.

The entrypoint composes only the read-only application server and operator
projection. It does not import the classifier API server, provider transport,
OpenRouter adapter, environment-secret provider, credential loaders, scheduler
execution, or ARCA transport. Those remain execution-side modules and are not
reachable from the planned deployment entrypoint.

AI-134 is an observation and human-review shell. Its provider/model visibility
does not imply operational authority or execution eligibility, and its
repository projection does not calculate final execution readiness. A future
operational PR must separately define and review execution-readiness
evaluation. Preview and Production remain fail closed even when static
provider configuration or evidence is present.

`AI_LAB_LOCAL_AUTH_ENABLED=true` is developer-only. It is valid only with
`AI_LAB_RUNTIME_MODE=development_local`,
`AI_LAB_DEPLOYMENT_ENV=development`, a loopback public origin, loopback request
host, and loopback socket address. It must not be configured in Vercel.

Do not add production credentials to repository files, browser bundles,
preview logs, build output, or shell history.

## Future Vercel project setup

These are human-run UI steps, not commands executed by AI-134:

1. Create an independent Vercel project named `vlatam-ai-lab` from the reviewed
   repository and branch.
2. Use these project settings:

   | Setting                    | Value                |
   | -------------------------- | -------------------- |
   | Framework Preset           | `Other`              |
   | Root Directory             | Repository root      |
   | Build Command override     | Disabled / automatic |
   | Output Directory override  | Disabled             |
   | Install Command override   | Disabled             |
   | Vercel Function entrypoint | `api/index.ts`       |

   `pnpm run build:production` remains the local and CI validation command. It
   is not the Vercel project Build Command. The repository-level `builds`
   configuration deploys only `api/index.ts` through `@vercel/node` and does
   not expect a static output directory. No Output Directory or `public`
   folder exists; do not create one merely to satisfy a build.

3. Keep the repository-root `vercel.json`, including its explicit Node
   Function build, catch-all route, and security headers. The legacy
   `builds`/`routes` style must not be mixed with modern `functions`,
   `rewrites`, or top-level `headers`.
4. Let Vercel use the repository's locked package-manager configuration
   automatically. `package.json` pins `pnpm@10.28.0`, and
   `pnpm-workspace.yaml` declares the repository root as the single workspace
   package. pnpm 9 is unsupported for this configuration.
5. Enable Corepack in both Preview and Production build environments with the
   non-secret project environment setting
   `ENABLE_EXPERIMENTAL_COREPACK=1`. This is required for Vercel to honor the
   exact `packageManager` pin instead of selecting pnpm from the project's
   creation date. Keep the Install Command override disabled.
6. Add only the runtime/deployment/origin non-secret variables above to the
   correct environment. Do not add the local-auth variable.
7. Configure a reviewed production identity provider before enabling public
   production access. Do not reuse the local role adapter.
8. Confirm preview and production have separate variables, access controls,
   logs, release history, and rollback ownership.
9. Do not connect databases, AI providers, schedulers, deployment hooks, or
   `vlatam-global`.

The package-manager pin changes dependency-installation selection only. The
explicit `@vercel/node` build of `api/index.ts` remains the deployment model,
with the same catch-all route and security headers.

The explicit legacy builder style cannot safely retain the modern `functions`
resource block. Consequently, `vercel.json` does not pin the former 10-second
maximum duration or 512 MB memory values. The effective limits are the current
Vercel project/runtime defaults shown for the project at deployment time; a
human reviewer must record those exact displayed values before approval rather
than assuming or inventing numeric defaults.

## Deployment commit provenance

Redeploying an existing Vercel deployment preserves that deployment's original
source commit. It must not be used to validate a newer configuration. A new
deployment used for configuration validation must reference the latest
reviewed `main` commit, and the cloned full commit SHA must be recorded before
interpreting the build result.

## Existing `lab.vlatamglobal.com` domain configuration

Do not modify DNS from this repository.

The Cloudflare CNAME for `lab.vlatamglobal.com` is already configured and
verified by Vercel. It must not be changed for this deployment fix. There is no
remaining DNS or domain-dashboard error to resolve.

The domain becomes active only after a successful production deployment that
references the latest reviewed `main` commit. After that deployment, a human
must validate the observed certificate and routing status while confirming
that the Logistics and Payments records remain unchanged. Keep the previous AI
LAB production deployment available until the post-release checklist passes.

These are human review steps. AI-134 performs no deployment or DNS action.

## Preview checklist

- [ ] Reviewed branch and commit are recorded.
- [ ] `pnpm run build:production` passes locally.
- [ ] Full tests, typecheck, architecture tests, ESLint, Prettier, and
      `git diff --check` pass.
- [ ] Preview uses `AI_LAB_DEPLOYMENT_ENV=preview`.
- [ ] Preview uses `AI_LAB_RUNTIME_MODE=preview`.
- [ ] `AI_LAB_LOCAL_AUTH_ENABLED` is absent.
- [ ] Preview origin is exact and HTTPS.
- [ ] `/healthz` returns only the safe liveness contract.
- [ ] `/`, `/operator/review`, and `/operator/arca-review` render inside the
      shell.
- [ ] Anonymous and insufficient-role requests fail closed.
- [ ] CSP and hardening headers are present.
- [ ] HSTS is absent in non-production responses.
- [ ] At 390×844 the closed drawer is inert, opening traps focus and locks
      scroll, all close paths restore focus, and mobile operational context is
      visible.
- [ ] Browser rendering causes zero external network calls.
- [ ] AI-131, AI-132, and AI-133 remain blocked.
- [ ] OpenRouter shows operational verification pending, execution blocked,
      and authority not granted.
- [ ] No scheduler, export, import, publication, database, or integration path
      is activated.

## Production checklist

- [ ] Preview evidence was independently reviewed.
- [ ] A production-grade trusted identity resolver was separately approved and
      replaced the fail-closed anonymous resolver.
- [ ] Production uses `AI_LAB_DEPLOYMENT_ENV=production`.
- [ ] Production uses `AI_LAB_RUNTIME_MODE=production`.
- [ ] `AI_LAB_LOCAL_AUTH_ENABLED` is absent.
- [ ] Production origin is exactly `https://lab.vlatamglobal.com`.
- [ ] Project ownership, audit access, logs, alerts, and rollback owner are
      documented.
- [ ] No secret is exposed to the browser or build log.
- [ ] The existing domain record is unchanged and the successful production
      deployment references the latest reviewed `main` commit.
- [ ] The exact last known-good deployment is recorded before promotion.
- [ ] HSTS is present only on Production HTTPS; nonce CSP, no-store HTML, and
      liveness response are verified.
- [ ] Repository-current blocked state is unchanged.
- [ ] No provider/model visibility or checked-in configuration is presented as
      execution readiness.
- [ ] Human approval explicitly states that deployment success creates no
      operational authority.

## Rollback

1. Stop promotion and record the observed failure without changing governance
   artifacts.
2. Use the Vercel project release history to select the reviewed exact
   last-known-good AI LAB deployment.
3. Reassign production traffic to that deployment using the platform's
   reviewed rollback action.
4. Do not change DNS unless the incident specifically requires it and a DNS
   administrator separately approves it.
5. Validate `/healthz`, identity failure behavior, the overview, both existing
   review routes, and security headers.
6. Record the release identifiers, timestamps, operator, reason, and
   verification evidence.
7. Keep AI-131, AI-132, AI-133, export, import, publication, database, and
   `vlatam-global` boundaries blocked throughout.

Rollback restores application presentation only. It cannot restore or create
operational authority.
