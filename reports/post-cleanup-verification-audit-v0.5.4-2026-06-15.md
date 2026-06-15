# Post-Cleanup Verification Audit v0.5.4

Date: 2026-06-15
Scope: local-only verification after cleanup/security hardening. No source code was modified.

## 1. Executive Summary

Overall status: FAIL.

Did the cleanup break anything? Yes. The cleanup removed modules that are still imported by the test suite and `tsconfig` still includes those tests. TypeScript compilation fails, ESLint is above target, and the test suite fails before executing assertions because many test files cannot resolve deleted modules.

## 2. Static Analysis Results

- TypeScript errors: FAIL. Target was 0; `pnpm exec tsc --noEmit` reported many errors.
- ESLint errors: 93. Target was < 20.
- Tests: 0 passed, 40 failed test files. Target was 331 passed, 0 failed.

Key TypeScript failures:

- `src/agents/arca-agent.ts:174`: `sanitizedEvidence` is referenced but not defined.
- `src/crawlers/arca-real-crawler.ts:157` and `src/crawlers/arca-real-crawler.ts:170`: `files[0]` may be `undefined`.
- Many tests import deleted modules under `src/lib`, `src/intelligence`, `src/pcram`, `src/pipelines`, and `src/reports`.

## 3. Integrity Check

Broken imports found: Yes.

No broken imports from deleted legacy dirs were found in `src/` or `scripts/` for the exact cleanup patterns. However, tests still reference removed code heavily, so the repo integrity check fails.

Representative broken test imports:

- `tests/ai-extraction-job-schema.test.ts:8` imports `../src/lib/fs.js`.
- `tests/ai-extraction-workflow.test.ts:10` imports `../src/intelligence/ai-extraction-workflow.js`.
- `tests/pcram-delta-generator.test.ts:9` imports `../src/pcram/generate-delta.js`.
- `tests/approved-export-bundle.test.ts:8` imports `../src/pipelines/build-approved-export-bundle.js`.
- `tests/briefing-quality-gate.test.ts:13` imports `../src/reports/briefing-quality-gate.js`.

Test runner evidence:

- Initial sandbox run failed with `EPERM` on the `tsx` pipe.
- Approved local rerun executed and failed with `ERR_MODULE_NOT_FOUND` across 40 test files.

## 4. Security Verification

- CORS restricted: PASS. `src/worker/index.ts` defines `ALLOWED_ORIGINS` and no wildcard `*`.
- Auth middleware: PARTIAL. `authenticate()` exists, but allows all requests when `API_AUTH_TOKEN` is not configured.
- Rate limiting: PASS. `checkRateLimit()` exists and gates `/api/v1/norms/query`.
- Input validation: PASS. `validateQueryInput()` validates object shape, product length, NCM format, and ISO-style country codes.
- 10KB body limit: PASS. `parseRequestBody()` checks `Content-Length > 10240`.
- Prompt injection protection: PARTIAL/FAIL. The expected `UNTRUSTED`/`TRUSTED` wrappers were not found in specialized agents.
- Timeouts: PARTIAL/FAIL. `AbortController`/30s timeout exists in `src/agents/arca-agent.ts` only; VUCE, InfoLEG, and Critic still lack timeout handling.
- Output validation: PARTIAL. ARCA clamps confidence and limits claims, but VUCE, InfoLEG, and Critic still accept raw provider JSON more directly.

Important security regression/bug:

- `src/agents/arca-agent.ts` now has output validation logic but returns `raw_context: sanitizedEvidence` even though `sanitizedEvidence` is undefined, breaking compilation.

## 5. Code Quality Metrics

- Total TypeScript lines in `src/`, `scripts/`, `tests/`: 11,849. Previous audit baseline: 22,629.
- Total TypeScript files in `src/`, `scripts/`, `tests/`: 62. Previous audit baseline: 116.
- Scripts in `package.json`: 18. Previous approximate target: ~25; expected post-cleanup was ~15.
- Package version: 0.5.4.

## 6. Recommendations Before Phase 2 RAG

1. Fix the build blocker in `src/agents/arca-agent.ts` by either defining `sanitizedEvidence` or returning the intended sanitized/raw evidence field.
2. Decide whether removed test areas are intentionally out of scope. If yes, delete or update the orphaned tests and adjust `tsconfig`/test globs. If no, restore the required modules.
3. Apply the same security hardening to VUCE, InfoLEG, and Critic that ARCA partially received: sanitization, trusted/untrusted prompt wrappers, 30s timeout, redacted errors, output validation, claim limits, and confidence clamps.
4. Make auth fail closed in production: if `API_AUTH_TOKEN` is missing, return a configuration error instead of allowing unauthenticated access.
5. Re-run `pnpm exec tsc --noEmit`, `pnpm exec eslint src/ scripts/ --ext .ts`, and `pnpm test` after the test/import cleanup.

## Acceptance Criteria Status

- [ ] TypeScript compiles with 0 errors.
- [ ] All 331 tests pass.
- [ ] No broken imports from deleted legacy code.
- [ ] All security features verified as intact.
- [x] Report is concise and actionable.

