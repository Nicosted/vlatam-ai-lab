# AI Lab review artifact hash binding evidence — 2026-07-13

## 1. Baseline commit

- Repository: `Nicosted/vlatam-ai-lab`
- Branch baseline: clean, synchronized `main`
- Baseline commit: `1043b13dc55e360b14c8a0de9adbabe7d7712d98`
- Scope: repository-local classifier intelligence review, export, and HTTP
  serving boundaries only

## 2. Pre-change vulnerability

`applyHumanReview` wrote a decision, reviewer, timestamp, approval reference,
eligibility reason, and downstream governance flags, but approval was not
cryptographically bound to the reviewed bytes or canonical content. Export and
HTTP serving checked review flags and schemas. A modified artifact, substituted
artifact, or copied approval block could therefore retain apparently valid
approval metadata if it still satisfied the structural contract.

## 3. Canonicalization rules

Contract version `review_binding@1.0.0` uses canonicalization
`review-json-v1`:

- object keys are serialized in lexicographic order;
- array order is preserved;
- strings, booleans, null, and finite numbers use exact JSON scalar semantics;
- unsupported values are rejected rather than normalized or omitted;
- rejected values include `undefined`, functions, symbols, bigint, cycles,
  non-finite numbers, dates, maps, sets, symbol keys, and non-plain objects;
- the canonicalization version is checked at runtime before recomputation.

The existing `normalizeAndHash` evaluation helper was audited and not reused
because it intentionally omits object `undefined`, normalizes some unsupported
values, has no canonicalization version, and has no review-specific domain
separator. AI-79 decision hashes and AI-80 durable binding fields remain
unchanged.

## 4. Hash inputs and exclusions

Artifact content uses SHA-256 over:

`vlatam-ai-lab/review-artifact/v1 + "\\n" + canonical_reviewable_artifact`

Included content covers artifact identity, artifact schema version, source
identity, extraction identity, generation timestamp, source authority, origin,
classification candidate, evidence, evidence order, evidence provenance, and
all other reviewable business content.

The exact exclusions are:

- top-level `review_status` — created by review;
- top-level `reviewer` — internal identity recorded by review;
- top-level `reviewed_at` — created by review and separately bound;
- top-level `classifier_approval_reference` — created by approval;
- top-level `downstream_eligibility_reason` — created by review;
- top-level `review_binding` — prevents recursive self-hashing;
- `governance.human_review_required`, `governance.downstream_allowed`,
  `governance.review_only`, and `governance.not_final_classification` — all are
  changed by the review operation.

No business content, evidence, candidate, provenance, schema version, source
identity, or artifact identity is excluded.

## 5. Review-binding contract

The closed internal contract contains:

- `binding_schema_version`
- `artifact_id`
- `artifact_schema_version`
- `artifact_content_hash`
- `canonicalization_version`
- `review_decision`
- `reviewed_at`
- `review_policy_id`
- `review_policy_version`
- `review_binding_hash`

The binding hash uses SHA-256 over:

`vlatam-ai-lab/review-binding/v1 + "\\n" + canonical_binding_payload`

The current policy is `classifier-human-review@1.0.0`. Reviewer identity is
stored only on the internal artifact and is neither a binding input nor an
external export field.

## 6. Runtime enforcement points

1. `applyHumanReview` hashes the reviewable artifact before review-generated
   metadata is applied, writes the decision binding, validates it, and uses a
   unique atomic temporary file.
2. `validateClassifierIntelligenceArtifact` closes unknown fields and requires
   a structurally valid binding for reviewed outcomes and downstream-open
   artifacts.
3. `exportApprovedArtifact` verifies binding integrity and approved decision
   before building or writing the external export.
4. The HTTP classifier route verifies the internal artifact binding, optional
   policy freshness, and exact reconstruction of the stored external export
   before serving it.
5. Rejected decisions and downstream-closed governance remain blocked even
   when their binding is otherwise valid.

The external approved-export schema is unchanged and contains no review hashes,
review policy metadata, reviewer identity, internal governance, source refs, or
provider metadata.

## 7. Historical artifact behavior

Reviewed classifier artifacts without bindings fail closed as
`review_revalidation_required`. The Human Review Gate accepts that state only
as input to a new explicit review; it never synthesizes a binding from old
approval metadata.

Deterministic repository scan result at this baseline:

- no repository-owned `data/intelligence` artifact is currently downstream
  eligible;
- `snapshots/pcram/invalid-classifier-intelligence-artifact-synthetic-downstream.json`
  is the only fixture using the current `reviewed_approved` spelling without a
  binding; it remains invalid and would require revalidation in addition to
  being permanently blocked as synthetic;
- older approved-artifact and review-manifest fixtures use separate historical
  schemas, were not rewritten, and cannot enter this runtime path without a new
  explicit review under the current contract.

The deterministic runtime-invalid fixture matrix is
`snapshots/review/review-binding-runtime-invalid-scenarios.json`.

## 8. Reason codes

- `review_binding_missing`
- `review_binding_malformed`
- `review_binding_version_unsupported`
- `review_canonicalization_unsupported`
- `artifact_id_mismatch`
- `artifact_source_id_mismatch`
- `artifact_schema_version_mismatch`
- `artifact_content_hash_mismatch`
- `review_policy_mismatch`
- `review_decision_mismatch`
- `review_timestamp_mismatch`
- `review_binding_hash_mismatch`
- `review_rejected`
- `review_stale`
- `review_revalidation_required`

External HTTP errors collapse these internal details into a sanitized conflict
response and do not expose hashes, payloads, reviewer identity, or sensitive
content.

## 9. Validation

Targeted tests cover deterministic hashes, object and array ordering, business
content mutation, exclusions, identity/schema/policy/decision substitution,
copied approvals, malformed and unsupported versions, concurrent review
isolation, rejected artifacts, historical revalidation, export stripping,
HTTP mutation and freshness refusal, closed schemas, and leakage fixtures.

Final recorded commands and counts:

- `pnpm test`: passed, 636 tests across 122 suites;
- `pnpm typecheck`: passed;
- `pnpm build`: passed;
- targeted ESLint: passed;
- targeted Prettier: passed;
- schema, fixture, hash, export, HTTP, provider-blocking, and execution-boundary
  validation: passed (70 focused tests in the final boundary run);
- credential, absolute-path, payload/reviewer/provider leakage, external-contract,
  provider-readiness, and `vlatam-global` scans: passed;
- `git diff --check`: passed;
- repository-wide `pnpm lint`: recorded 43 pre-existing errors in crawler and
  legacy validation scripts; no changed file has a lint error. The baseline was
  recorded and unrelated lint debt was not modified.

No provider adapter, network client, live AI execution, database, production
service, credential, or `.env*` file participates in the implementation or
tests.

## 10. Limitations

- SHA-256 integrity binds repository-local content but is not a digital
  signature and does not establish reviewer identity authenticity.
- The current review policy defines no maximum age. Freshness is enforced when
  a policy supplies `maximum_review_age_seconds`.
- File replacement between validation and read remains bounded by the current
  local filesystem model; durable transactional storage is out of scope.
- Historical artifacts require deliberate new review; no migration auto-approves
  them.

## 11. Exact next PR

**Durable budget and usage ledger.** Do not start it until this review-binding
PR is merged and `main` is synchronized.
