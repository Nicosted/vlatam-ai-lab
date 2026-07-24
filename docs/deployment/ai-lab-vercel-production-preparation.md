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
- Local production validation: `pnpm run build:production`
- Routing and security preparation: `vercel.json`
- Liveness: `GET /healthz`
- Application overview: `GET /`
- Required non-secret variables:
  - `AI_LAB_DEPLOYMENT_ENV=preview` for preview;
  - `AI_LAB_DEPLOYMENT_ENV=production` for production;
  - `AI_LAB_PUBLIC_ORIGIN` set to that environment's exact HTTPS origin.

The entrypoint validates environment identity before serving requests. A
production value with a non-HTTPS origin fails closed. Production identity also
fails closed until a reviewed trusted identity resolver is implemented.

Do not add production credentials to repository files, browser bundles,
preview logs, build output, or shell history.

## Future Vercel project setup

These are human-run UI steps, not commands executed by AI-134:

1. Create an independent Vercel project named `vlatam-ai-lab` from the reviewed
   repository and branch.
2. Select the generic/Other framework preset.
3. Keep the repository-root `vercel.json`.
4. Use the locked package installation selected by the project and
   `pnpm run build:production` as the build command.
5. Add only the two non-secret variables above to the correct environment.
6. Configure a reviewed production identity provider before enabling public
   production access. Do not reuse the local role adapter.
7. Confirm preview and production have separate variables, access controls,
   logs, release history, and rollback ownership.
8. Do not connect databases, AI providers, schedulers, deployment hooks, or
   `vlatam-global`.

## Planned `lab.vlatamglobal.com` setup

Do not modify DNS from this repository.

After the independent Vercel project exists and a reviewed preview has passed:

1. A human project administrator adds `lab.vlatamglobal.com` to the AI LAB
   project.
2. Record the exact DNS target displayed by the current Vercel project UI.
   Do not guess or copy a target from another project.
3. A human DNS administrator creates only the record requested for the `lab`
   host in the authoritative `vlatamglobal.com` zone.
4. Confirm that Logistics and Payments records are unchanged.
5. After propagation, a human validates the domain in the Vercel UI and records
   the observed certificate and routing status.
6. Keep the previous AI LAB production deployment available until the
   post-release checklist passes.

Each of these actions requires separate approval. AI-134 performs none of them.

## Preview checklist

- [ ] Reviewed branch and commit are recorded.
- [ ] `pnpm run build:production` passes locally.
- [ ] Full tests, typecheck, architecture tests, ESLint, Prettier, and
      `git diff --check` pass.
- [ ] Preview uses `AI_LAB_DEPLOYMENT_ENV=preview`.
- [ ] Preview origin is exact and HTTPS.
- [ ] `/healthz` returns only the safe liveness contract.
- [ ] `/`, `/operator/review`, and `/operator/arca-review` render inside the
      shell.
- [ ] Anonymous and insufficient-role requests fail closed.
- [ ] CSP and hardening headers are present.
- [ ] Browser rendering causes zero external network calls.
- [ ] AI-131, AI-132, and AI-133 remain blocked.
- [ ] No scheduler, export, import, publication, database, or integration path
      is activated.

## Production checklist

- [ ] Preview evidence was independently reviewed.
- [ ] A production-grade trusted identity resolver was separately approved and
      replaced the fail-closed anonymous resolver.
- [ ] Production uses `AI_LAB_DEPLOYMENT_ENV=production`.
- [ ] Production origin is exactly `https://lab.vlatamglobal.com`.
- [ ] Project ownership, audit access, logs, alerts, and rollback owner are
      documented.
- [ ] No secret is exposed to the browser or build log.
- [ ] Domain change has separate human and DNS approval.
- [ ] The exact last known-good deployment is recorded before promotion.
- [ ] HSTS, CSP, no-store HTML, and liveness response are verified.
- [ ] Repository-current blocked state is unchanged.
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
