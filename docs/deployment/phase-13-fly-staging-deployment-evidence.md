# Phase 13A Fly.io Staging Deployment Evidence

## Local source snapshot context

- Evidence capture timestamp: `2026-06-17T18:22:58Z` (UTC), from the terminal `date -u` output captured with the final release check.
- Final release timestamp: approximately `2026-06-17T17:43:01Z` (UTC), derived transparently from release `v4` being reported as complete `39m57s ago` at the evidence capture timestamp. Fly displayed a relative release age rather than an absolute timestamp.
- Deployed commit: `30a7435620a5ee5a0ddcaf40bfcc4a16a4feba63`, from `git rev-parse HEAD` in the deployment terminal.
- Deployment type: Fly.io staging.
- Fly app: `vlatam-ai-lab-api-staging` (owner: `personal`).
- Staging URL: <https://vlatam-ai-lab-api-staging.fly.dev>.
- Region: `gru`.
- Final image identifier: `vlatam-ai-lab-api-staging:deployment-01KVBAVFQR3ZXJC31NRS65VANK`.
- Final completed Fly release: `v4`.
- Production deployment performed: no.

## Derived deployment record

Phase 13A deployed the read-only API to the staging-only Fly app. The initial deployment succeeded, and a second deployment also succeeded following secret rotation. The final `fly releases` output reported releases `v1` through `v4` as complete, with `v4` as the current release. No missing release identifier has been inferred.

The container serves exports baked into the Docker image from `data/exports`; Phase 13A did not create, attach, or use a Fly volume or any other external volume. The runtime reported data root `/app`, port `3000`, public health route `GET /health`, and classifier route `GET /api/classifier/:source_id/:artifact_id`.

No Supabase project, database, AI provider, Vercel service, production system, or other external data service was connected. No production deployment was performed.

## Validation results

| Check | Observed result |
| --- | --- |
| `GET /health` | `200`; body `{"status":"healthy","version":"1.0.0"}` |
| Classifier request without API key | `401` |
| Classifier request with configured API key | `200` |
| Valid but missing artifact | `404` |
| Encoded path-traversal request | `400` |
| API startup | Successful on port `3000` |
| Fly placement | Two machines in `gru` |
| Deployment-time machine health | Both machines observed started with `1/1` health check passing |
| Git state after deployment | Clean on `main`, synchronized with `origin/main` |

The deployment-time validation observed machines `683d330ae95098` and `784e673c3605d8`, both on version `4`, started in `gru`, with health checks passing. A later `fly status` capture showed those same machines stopped, with one warning each, last updated at `2026-06-17T17:48:25Z` and `2026-06-17T17:48:09Z`. This report preserves both observations because they describe different points in time; the later stopped state does not replace the successful deployment-time HTTP validation.

## Secret safety confirmation

- API authentication was configured with the `AI_LAB_API_KEYS` Fly secret.
- Rate limiting was configured with the `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` Fly secrets.
- The terminal secret listing showed only secret names, non-reversible platform digests, and deployment status; this report intentionally omits the digests and all secret values.
- No secret values appear in this document, tracked configuration, or deployment logs included as evidence.
- The operator-local `fly.toml` remains gitignored and is not part of this change.
- No secrets were committed.

## Rollback procedure

1. Inspect completed releases without exposing secrets:

   ```bash
   fly releases --app vlatam-ai-lab-api-staging
   ```

2. Select the last known-good completed release version after human review.
3. Roll back the staging app to that release, for example:

   ```bash
   fly releases rollback v3 --app vlatam-ai-lab-api-staging
   ```

4. Confirm the resulting release and machine state:

   ```bash
   fly releases --app vlatam-ai-lab-api-staging
   fly status --app vlatam-ai-lab-api-staging
   ```

5. Re-run the five HTTP checks above. If validation fails, keep the consumer feature flag disabled and route the incident to human review.

The example targets `v3` only to demonstrate Fly release rollback syntax. The operator must choose the reviewed last known-good release from fresh `fly releases` output; this document does not assert that `v3` is suitable for a future rollback.

## API key rotation procedure

1. Generate the replacement key in an approved secret-handling environment; do not place it in source files, documentation, shared shell history, or logs.
2. Update `AI_LAB_API_KEYS` through Fly secrets so the current and replacement keys temporarily overlap.
3. Validate the replacement key against the authenticated classifier route while confirming unauthenticated access still returns `401`.
4. Update the approved staging consumer to use the replacement key.
5. Remove the old key in a second Fly secret update.
6. Re-run health, authentication, missing-artifact, and path-traversal checks. List secret names only to confirm deployment status.

Rate-limit settings must remain in Fly secrets and may be rotated or adjusted through the same reviewed, value-redacted process.

## Assumptions and limitations

- Fly reported release ages relatively. The approximate final release timestamp above is an arithmetic derivation from the terminal capture timestamp and is not represented as a platform-provided absolute release timestamp.
- The HTTP responses and deployment-time started/healthy machine state are operator-observed terminal evidence supplied for this report.
- The later stopped/warning machine state requires human operational review before enabling any consumer traffic.
- The deployment is staging-only and read-only. It contains reviewed image-baked exports and has no external persistence.
- This evidence records reviewed external deployment results; it does not authorize further infrastructure changes or production activation.

## Human review and next step

After human review of this evidence and resolution or acceptance of the later stopped-machine state, the next proposed phase is a `vlatam-global` read-only consumer integration behind a disabled-by-default feature flag. The integration must consume only reviewed API artifacts, keep failure isolated from the existing runtime, and remain disabled until its contract, authentication, rollback, and staging validation are separately approved.
