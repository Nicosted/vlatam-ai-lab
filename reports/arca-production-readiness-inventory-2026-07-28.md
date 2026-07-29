# ARCA production-readiness inventory

Date: 2026-07-28
Repository: `Nicosted/vlatam-ai-lab`
Audit scope: read-only repository inventory and production-path trace
Decision scope: no approval, acquisition, publication, persistence, deployment, or authority change

## 1. Executive summary

No ARCA regulation can safely be published from the repository today.

The repository contains:

- a real-looking local ARCA Arancel Integrado archive and three extracted
  source files dated 2026-06-14, with matching SHA-256 manifests;
- a legacy parsed tariff snapshot with 47,496 unique NCM lines;
- source-identity and source-snapshot records for ARCA and Decreto 557/2023;
- evidence packets and historical AI extraction outputs that all keep
  downstream use blocked;
- complete local contracts for governed acquisition, candidate review,
  Approved ARCA Artifact construction, durable local persistence, controlled
  acquisition, governed export, and scheduling; and
- a read-only Operator Console route at `/operator/arca-review`.

The repository does **not** contain:

- a real governed ARCA acquisition record and candidate pair;
- a real human ARCA candidate approval;
- a repository-current Approved ARCA Artifact;
- a persisted ARCA workflow under `var/`;
- an ARCA export package or durable export record;
- a structured, approved regulatory instrument with title, regulation number,
  publication date, effective date, freshness, and supersession history; or
- an approved-only production library, search index, list route, or detail
  route.

The configured Vercel function packages exactly one ARCA data asset:
`data/fixtures/arca/ai-127-pending-review.json`. That file declares itself a
synthetic repository example with no real human review. The production-facing
read model therefore projects `pending_human_review` and an absent Approved
Artifact. No other ARCA content is in the immutable 21-file packaging manifest
(`src/operator/operator-read-model-assets.ts`,
`OPERATOR_READ_MODEL_ARTIFACTS`; `vercel.json`,
`builds[0].config.includeFiles`).

The statement above is repository/package truth at the audited commit, not an
observation of a live deployment. This audit did not contact Vercel,
Cloudflare, ARCA, a database, or any external service, as required.

The existing approved-artifact pipeline is for an **ARCA tariff dataset**, not
for regulatory instruments. Its payload schema contains NCM codes,
descriptions, rates, source URL, and snapshot date, but no regulation title,
regulation number, publication date, effective date, topic taxonomy, or
supersession history
(`schemas/approved-arca-artifact.schema.json#/properties/approved_payload`).
Calling that artifact a regulatory library without a new instrument contract
would misstate what the evidence proves.

### What can go to production today

No ARCA regulatory content can go to production today.

The existing authenticated, read-only pending-review console can be released
only as a governance/status surface, subject to the separate deployment
checklist. It does not satisfy “ARCA Regulatory Library — Read Only” because it
shows one synthetic pending fixture and no approved regulation.

## 2. Source snapshot, preconditions, method, and limitations

### Preconditions

All mandatory preconditions passed before broad inspection:

| Check                | Observed value                             | Result |
| -------------------- | ------------------------------------------ | ------ |
| Branch               | `main`                                     | pass   |
| `HEAD`               | `c911c338910341bc73fa55a1d37b347d7d45a38b` | pass   |
| Worktree/index       | clean                                      | pass   |
| cached `origin/main` | `c911c338910341bc73fa55a1d37b347d7d45a38b` | pass   |

No `git fetch` was performed. The comparison is intentionally against the
cached remote-tracking reference required by the request.

### Method

The audit searched the repository for ARCA/AFIP, normativa/regulación,
Resolución General, review states, approval/publication states, provenance,
source and temporal metadata, hashes, supersession/expiry/invalidity,
`/operator/arca-review`, acquisition, persistence, scheduler, export, and
controlled live-run terms.

The repository has no `graphify-out/graph.json`, so the repository Graphify
guidance required direct source inspection. Every material conclusion below
was then verified against the cited files and symbols.

Local checks:

- 97/97 focused tests passed across parser, ingestion, review, Approved
  Artifact builder, durable store, Operator Console, immutable packaging, and
  Vercel configuration.
- `pnpm run typecheck` passed.
- Both checked-in ARCA SHA-256 manifests are byte-identical.
- `shasum -a 256 -c data/sources/arca/sha256_arca_manifest.txt` passed for the
  archive and all three extracted source files.

### Limitations

- No `.env*` file was read.
- No network access occurred.
- No live deployment, Vercel bundle, Cloudflare configuration, database, or
  production request was inspected.
- Dates embedded in filenames or legacy snapshots are not treated as governed
  acquisition timestamps unless the artifact explicitly says so.
- “Official” describes an asserted source identity or URL. It does not imply
  that the checked-in bytes have a complete governed acquisition and review
  chain.
- The current date is 2026-07-28. The ARCA source files are dated 2026-06-14;
  the source registry declares a monthly expected cadence and
  `freshness_status: requires_review`.

## 3. Complete ARCA content and evidence inventory

Classification categories are applied to content-bearing items. Code, schemas,
tests, configuration, and design evidence are inventoried separately in
section 8 because they are controls, not publishable regulations.

Legend:

- **C** — `BLOCKED_INCOMPLETE_EVIDENCE`
- **D** — `BLOCKED_INVALID_OR_CONFLICTING`
- **F** — `FIXTURE_OR_TEST_ONLY`

There are no category A, B, or E items in the repository-current content set.

### Primary source and parsed artifacts

| Exact path                                                                     | Type / canonical identifier                                                                                                        | Title or number                                                         | Source / authority                                                                           | Dates and content hash                                                                   | Review, publication, persistence, freshness, supersession                                                                 | Class / production visibility                 |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `data/sources/arca/arancel.zip`                                                | ignored local archive; manifest SHA-256 `0d95a29be79294934bfc82caf6d7a7bf8843335987d73069b4ae189d5e89519f`                         | ARCA Arancel Integrado archive; no regulation number                    | URL and authority are not embedded in the archive manifest                                   | 982,241 bytes; filename set implies 2026-06-14 but no governed `captured_at`; SHA passes | no review, publication, persistence, freshness, or supersession record; ignored by `.gitignore`                           | **C**; not tracked, not packaged, not visible |
| `data/sources/arca/nomenclador_14062026.txt`                                   | raw tariff source; SHA-256 `e284ee5606b72ed18eee896bb5908c074a5ac9e3d93e331c60e82e08be4a540b`                                      | Nomenclador; embeds unstructured references such as RG 3109 and RG 3172 | authority/URL not bound inside the manifest; later parsed artifact asserts legacy AFIP URL   | 5,560,907 bytes; 47,496 lines; no governed acquisition timestamp                         | no human review or lifecycle; source date 2026-06-14; current/superseded status unknown                                   | **C**; tracked, not packaged, not visible     |
| `data/sources/arca/sufijos_14062026.txt`                                       | raw suffix source; SHA-256 `36293970539a057c70e3ea0526871fef4be46fbc113fc0a8b1baba6d62fcc4da`                                      | Sufijos de Valor; no single regulation number                           | authority/URL not embedded                                                                   | 2,796,114 bytes; 49,212 lines; no governed acquisition timestamp                         | no review/publication/persistence/freshness/supersession evidence                                                         | **C**; tracked, not packaged, not visible     |
| `data/sources/arca/capitulo_14062026.txt`                                      | raw chapter source; SHA-256 `0a802e6fa6fe805e5693b61bf30c4ae6ce07ebe3a29e292ea360497ae8a37a61`                                     | Capítulos; no single regulation number                                  | authority/URL not embedded                                                                   | 364,491 bytes; 97 lines; no governed acquisition timestamp                               | no review/publication/persistence/freshness/supersession evidence                                                         | **C**; tracked, not packaged, not visible     |
| `data/manifests/arca-sha256.txt`; `data/sources/arca/sha256_arca_manifest.txt` | duplicate integrity manifests                                                                                                      | four ARCA archive/source filenames                                      | no source authority or acquisition binding                                                   | manifests match current local bytes                                                      | integrity only; no review or legal-currentness assertion                                                                  | **C**; not packaged, not visible              |
| `data/parsed/arca/arancel-2026-06-14.json`                                     | legacy parsed snapshot `snap-arca-arancel-2026-06-14`; embedded `file_hash` is the raw nomenclador hash, not the JSON content hash | ARCA Arancel Integrado tariff snapshot; no regulation title/number      | `https://www.afip.gob.ar/aduana/arancelintegrado/`; asserted source `ARCA Arancel Integrado` | snapshot 2026-06-14; parsed 2026-06-15; 47,496 declared/actual/unique NCM lines          | no review, reviewer, governed acquisition, publication, persistence, freshness, or supersession metadata                  | **D**; not packaged, not visible              |
| `data/diffs/arca/diff-2026-06-14.json`                                         | `diff-arca-2026-06-14`                                                                                                             | tariff snapshot delta                                                   | inherits no independently bound source                                                       | generated 2026-06-15; no content hash                                                    | self-compares `snap-arca-arancel-2026-06-14` to itself while `is_initial: false`; zero changes cannot establish freshness | **D**; not packaged, not visible              |

The legacy parsed snapshot is incompatible with the governed candidate schema:
all 47,496 rows lack required `iva_is_inferred`; 15,614 descriptions contain
literal `?` characters and 23 descriptions are empty. The current parser
explicitly marks inferred IVA
(`src/parsers/arca-nomenclador.ts`, `TariffLine.iva_is_inferred` and
`parseArcaNomencladorText`), and the closed candidate schema requires that
field and a non-empty description
(`schemas/governed-arca-candidate.schema.json`, tariff-line `required` and
`description`). This is an unresolved integrity/schema conflict, so the parsed
snapshot is D rather than B.

### PCRAM source identity, decree, and evidence artifacts

| Exact path                                                                                                                                  | Type / canonical identifier                                           | Title or number                                                                                                             | Source / authority                                                  | Hash and dates                                                                               | Review / downstream / freshness / supersession                                                                                                            | Class / production visibility                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `snapshots/pcram/intelligence-source-registry-ar-arca-arancel-official.json`                                                                | source registry `ar-arca-arancel-integrado`                           | “ARCA (ex-AFIP) Arancel Integrado y Sufijos de Valor Reference”                                                             | `https://www.arca.gob.ar/`; ARCA asserted official                  | created/checked 2026-06-06; no content hash                                                  | verified source identity only; `freshness_status: requires_review`; `downstream_allowed: false`; notes say content not ingested                           | **C**; not packaged, not visible                       |
| `snapshots/pcram/intelligence-source-snapshot-ar-arca-arancel-official.json`                                                                | snapshot `snapshot-ar-arca-arancel-integrado-2026-06-06t000000z`      | Arancel Integrado capture reference                                                                                         | ARCA portal, manual human capture                                   | captured 2026-06-06; no fingerprint                                                          | `not_reviewed`, `not_started`, `requires_review`, downstream false; warning says no verifiable checksum                                                   | **C**; not packaged, not visible                       |
| `snapshots/pcram/snapshot-review-manifest-ar-arca-arancel.json`                                                                             | review `review-manifest-ar-arca-arancel-integrado-2026-06-06t001800z` | review of the source-reference snapshot                                                                                     | reviewer role `ai-lab-source-reviewer`                              | reviewed 2026-06-06; no content hash                                                         | `review_status: approved` applies only to source identity/locator/capture reference; fingerprint and version scope false; extraction and downstream false | **C**; not packaged, not visible                       |
| `snapshots/pcram/intelligence-source-registry-ar-decreto-557-2023-official.json`                                                            | source registry `ar-decreto-557-2023`                                 | Decreto 557/2023                                                                                                            | Boletín Oficial / InfoLEG; Poder Ejecutivo Nacional                 | created/checked 2026-06-06; no content hash                                                  | legal text not ingested; in-force status and amendments explicitly unverified; requires review; downstream false                                          | **C**; not packaged, not visible                       |
| `snapshots/pcram/intelligence-source-snapshot-ar-decreto-557-2023-official.json`                                                            | snapshot `snapshot-ar-decreto-557-2023-2026-06-06t000000z`            | Decreto 557/2023                                                                                                            | Boletín Oficial portal, manual metadata only                        | captured 2026-06-06; no fingerprint                                                          | `not_reviewed`; content/version not captured; downstream false                                                                                            | **C**; not packaged, not visible                       |
| `snapshots/pcram/snapshot-review-manifest-ar-decreto-557-2023.json`                                                                         | review `review-manifest-ar-decreto-557-2023-2026-06-06t001500z`       | Decreto 557/2023                                                                                                            | reviewer role `ai-lab-source-reviewer`                              | created 2026-06-06; no content hash                                                          | `in_review`; capture, fingerprint, and version scope false; extraction/downstream false                                                                   | **C**; not packaged, not visible                       |
| `snapshots/pcram/extractable-evidence-packet-ar-decreto-557-2023.json`                                                                      | packet `evidence-packet-ar-decreto-557-2023-2026-06-06t002500z`       | Decreto 557/2023 reference                                                                                                  | manual Boletín Oficial portal reference                             | created 2026-06-06; no content hash or legal text                                            | extraction not started/not allowed; human review required; downstream false                                                                               | **C**; not packaged, not visible                       |
| `snapshots/pcram/evidence-packet-ar-arancel-4202-92-00-2026-06-14.json`                                                                     | packet `evidence-packet-ar-arancel-4202-92-00-2026-06-14`             | NCM 4202.92.00.110V                                                                                                         | asserted ARCA excerpt; legacy AFIP URL                              | created 2026-06-14; no packet content hash                                                   | extraction prepared/allowed, but human review required and downstream false; no completed review evidence                                                 | **C**; not packaged, not visible                       |
| `snapshots/pcram/evidence-packet-ar-arancel-8452-10-00-2026-06-14.json`                                                                     | packet `evidence-packet-ar-arancel-8452-10-00-2026-06-14`             | NCM 8452.10.00                                                                                                              | asserted ARCA excerpt; legacy AFIP URL                              | created 2026-06-14; no packet content hash                                                   | extraction prepared/allowed; human review required; downstream false                                                                                      | **C**; not packaged, not visible                       |
| `snapshots/pcram/extractable-evidence-packet-ar-arancel-4202-92-00-2026-06-14.json`                                                         | packet `packet-ar-arancel-4202-92-00-2026-06-14`                      | NCM 4202.92.00; cites Decreto 557/2023                                                                                      | ARCA, MERCOSUR, WCO, InfoLEG excerpt references                     | created 2026-06-14; no packet content hash                                                   | explicitly extraction-ready but not classifier-approved; downstream false; bounded excerpts only                                                          | **C**; not packaged, not visible                       |
| `snapshots/pcram/packet-unified-4202-92-00-110V-2026-06-14.json`; `snapshots/pcram/packet-unified-enriched-4202-92-00-110V-2026-06-14.json` | unified evidence packets                                              | NCM 4202.92.00.110V                                                                                                         | combines ARCA and other evidence refs                               | created 2026-06-14; no content hash                                                          | human review required; downstream false; no approval record                                                                                               | **C**; not packaged, not visible                       |
| `data/parsed/infoleg/customs-relevant-norms.json`                                                                                           | supporting parsed InfoLEG index `ar-infoleg`                          | includes Decreto 333/2025, 513/2025, 781/2025, a 2026-05-04 modification of Decreto 557/2023, and legacy RG AFIP references | InfoLEG asserted by dataset identity, but rows have blank URLs/text | `captured_at` exists at dataset level; no embedded source URL/file hash in the parsed object | no row-level review, effective-date resolution, or supersession chain; proves amendments must be reconciled, not that 557/2023 is current or superseded   | **C**; not packaged in the Operator model, not visible |

The approved ARCA source-snapshot review must not be promoted to publication
approval. Its own fields say `content_fingerprint_verified: false`,
`version_scope_verified: false`, `extraction_allowed: false`, and
`downstream_allowed: false`
(`snapshots/pcram/snapshot-review-manifest-ar-arca-arancel.json`).

### Historical AI extraction outputs

The following five outputs are D because they are model-generated,
human-review-required, downstream-blocked artifacts and their own critic
warnings identify insufficient or potentially incorrect classification
evidence:

- `snapshots/pcram/ai-extraction-result-evidence-packet-ar-arancel-4202-92-00-2026-06-14-1781458335335.json`
- `snapshots/pcram/ai-extraction-result-evidence-packet-ar-arancel-4202-92-00-2026-06-14-1781473779211.json`
- `snapshots/pcram/ai-extraction-result-evidence-packet-ar-arancel-8452-10-00-2026-06-14-1781458375786.json`
- `snapshots/pcram/ai-extraction-result-packet-ar-arancel-4202-92-00-2026-06-14-1781456792144.json`
- `snapshots/pcram/ai-extraction-result-packet-ar-arancel-4202-92-00-2026-06-14-1781458121756.json`

All have `human_review_required: true` and `downstream_allowed: false`; none
contains approval or reviewer evidence. One explicitly warns that the
4202.92.00.110V “De campamento” line is likely incorrect for a school
backpack. They are not packaged or visible in the current Operator UI.

### Repository-current production fixture

| Exact path                                      | Type / canonical identifiers                                                                                                                                                                   | Source and dates                                                      | Hashes                                                                                        | Review/publication/persistence/freshness/supersession                                                                                                                                       | Class / visibility                                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `data/fixtures/arca/ai-127-pending-review.json` | synthetic candidate `arca-candidate--7d6bd452fe023a6cf2b946a01065817eeda756f3e7b57b963d151d41e8bb6073`; review `arca-review--c1ac0ed41aa5128cfda67758f042272f02830c3759f51884091e3e19ed4a0205` | exact ARCA nomenclador URL; synthetic capture 2026-07-14; one NCM row | candidate, review, acquisition-placeholder, raw-placeholder, and parsed-output hashes present | declares `synthetic_candidate: true`, `real_human_review_performed: false`, pending, no reviewer/decision, not approved, not publishable, expires 2026-08-22, not superseded, not persisted | **F**; the only ARCA JSON packaged and the only ARCA item visible at `/operator/arca-review` |

The locally evaluated repository read model reports:

- `evaluation_outcome: pending_human_review`;
- `eligible_for_approved_artifact_building: false`;
- `arca_approved_artifact.present: false`;
- `export_status: not_exported`;
- `publication_status: not_published`; and
- every production/network/database/scheduler/deployment authority as false.

These values are derived in
`src/operator/repository-operator-read-model.ts`,
`loadRepositoryOperatorReadModel`, using
`evaluateGovernedArcaCandidateReview`.

## 4. Production-readiness classification

### A. `READY_FOR_READ_ONLY_PUBLICATION`

None.

No content artifact satisfies all of: official content bytes, deterministic
validated regulation schema, content hash, acquisition/source metadata, real
human approval, current/not-superseded status, resolved integrity, and
non-execution semantics.

### B. `READY_FOR_OPERATOR_REVIEW`

None.

The only governed candidate is explicitly synthetic. The real-looking legacy
raw/parsed artifacts have not been converted into a governed acquisition
record and candidate, and the parsed snapshot conflicts with the current
schema. The source-reference snapshots lack content fingerprints and version
scope.

### C. `BLOCKED_INCOMPLETE_EVIDENCE`

- raw archive/source files and their integrity manifests;
- ARCA and Decreto 557/2023 source registries, snapshots, and review records;
- the ARCA/Decreto evidence packets and unified packets; and
- the supporting InfoLEG parsed index.

Primary blockers are absent governed acquisition metadata, missing content
fingerprints, missing complete official text, missing regulation metadata,
missing real human approval, unverified freshness, and unresolved amendment
history.

### D. `BLOCKED_INVALID_OR_CONFLICTING`

- `data/parsed/arca/arancel-2026-06-14.json`;
- `data/diffs/arca/diff-2026-06-14.json`; and
- the five historical AI extraction outputs listed above.

Primary blockers are schema incompatibility, missing/empty descriptions,
unresolved literal replacement characters, a self-referential diff, and
critic-identified evidence/classification conflicts.

### E. `BLOCKED_SUPERSEDED_OR_EXPIRED`

None can be assigned honestly.

The repository contains evidence that Decreto 557/2023 has modifying norms,
but no reviewed supersession graph or current legal-status decision. “Modified”
must not be inferred to mean fully superseded. The pending synthetic review has
not yet reached its declared expiry as of 2026-07-28.

### F. `FIXTURE_OR_TEST_ONLY`

- `data/fixtures/arca/ai-127-pending-review.json`;
- `tests/fixtures/arca/nomenclador.txt`; and
- all positive approved/rejected/expired/superseded examples constructed only
  in tests, including
  `tests/review/governed-arca-candidate-review.test.ts`,
  `tests/artifacts/approved-arca-artifact-builder.test.ts`,
  `tests/store/durable-arca-review-store.test.ts`, and
  `tests/operator/arca-review-console.test.ts`.

## 5. Current UI and packaging truth

### Exact data flow for `/operator/arca-review`

1. Vercel routes all paths to `api/index.ts`
   (`vercel.json`, `routes[0]`).
2. `createApplicationEntrypoint` resolves the packaged application root from
   `api/index.*` and passes it to `handleApplicationRequest`
   (`api/index.ts`, `PACKAGED_OPERATOR_ASSET_ROOT` and
   `createApplicationEntrypoint`).
3. `handleOperatorConsoleRequest` accepts GET only, requires an authenticated
   authorized identity, and calls `loadRepositoryOperatorReadModel`
   (`src/operator/operator-console-handler.ts`,
   `handleOperatorConsoleRequest`).
4. The repository loader reads the exact file mapped by
   `OPERATOR_READ_MODEL_ARTIFACTS.arca_review_fixture`
   (`src/operator/operator-read-model-assets.ts`).
5. `loadRepositoryOperatorReadModel` extracts `.candidate` and `.review`,
   evaluates them through `evaluateGovernedArcaCandidateReview`, and explicitly
   creates an absent `arca_approved_artifact` projection
   (`src/operator/repository-operator-read-model.ts`,
   `loadRepositoryOperatorReadModel`).
6. `buildArcaReviewConsoleViewModel` translates the immutable read model
   without discovery, mutation, building, export, publication, or authority
   (`src/operator/arca-review-console-view-model.ts`,
   `buildArcaReviewConsoleViewModel`).
7. `renderOperatorConsole` dispatches the path to `arcaReview`, which renders
   candidate, review, evaluation, and absent-artifact sections
   (`src/operator/operator-console.ts`, `CONSOLE_PAGES` and `arcaReview`).

### What is packaged

The canonical manifest contains exactly 21 JSON files. Its only ARCA file is:

`data/fixtures/arca/ai-127-pending-review.json`

This exact equality is enforced by
`tests/architecture/operator-read-model-packaging.test.ts`,
“includes exactly the canonical manifest in the legacy Node build”.

Not packaged:

- `data/sources/arca/**`;
- `data/parsed/arca/**`;
- `data/diffs/arca/**`;
- `snapshots/pcram/**`;
- any durable `var/` state;
- any Approved ARCA Artifact;
- any ARCA export package; and
- any regulation catalog or search index.

The repository has no `var/` directory at the audited snapshot, so there is no
repository-current AI-130 persisted workflow.

### What the current UI can distinguish

| Requested state | Contract/presentation support                                                                      | Current repository value |
| --------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| pendiente       | yes: `pending` / `pending_human_review`                                                            | visible                  |
| aprobada        | yes: review lifecycle `approved`, builder eligibility, and Approved Artifact presence are separate | not present              |
| rechazada       | yes: `rejected`                                                                                    | test-only                |
| vencida         | yes: `expired`                                                                                     | test-only                |
| reemplazada     | yes semantically as canonical `superseded`, displayed “Sustituido”                                 | test-only                |
| inválida        | yes: `invalid_review`, `invalid_candidate`, and binding mismatch are distinct                      | test-only                |

Mappings are in
`src/operator/arca-review-console-view-model.ts`, `ARCA_STATUS_LABELS`, and
`src/operator/operator-presentation.ts`, `STATUS_LABELS`. Coverage is in
`tests/operator/arca-review-console.test.ts`, “projects canonical lifecycle and
evaluator states without inferring decisions”.

The current page is a single workflow-detail page, not a regulatory library.
It has no list, search, topic filter, regulation detail route, official source
anchor, publication/effective date, freshness label, or supersession history.

### Presentation gaps

| Repository truth available somewhere                   | Current production-facing presentation                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Raw file hashes in ARCA manifests                      | not projected                                                                                           |
| Candidate acquisition record/raw hashes in the fixture | not projected                                                                                           |
| Candidate source URL                                   | not projected; only source name is shown                                                                |
| Tariff snapshot date                                   | not projected                                                                                           |
| Regulation title/number/publication/effective date     | not represented in the governed tariff contracts                                                        |
| Source registry freshness                              | not loaded or packaged                                                                                  |
| Source-review limitation/fingerprint gates             | not loaded or packaged                                                                                  |
| `superseded_by` in candidate review contract           | lifecycle can be labeled, but the replacement chain is not projected                                    |
| Approved Artifact discovery                            | hard-coded absent; no catalog scan or durable-store read                                                |
| Time-dependent expiry/freshness                        | loader uses fixed `REPOSITORY_OPERATOR_EVALUATED_AT = 2026-07-15T12:00:00.000Z`; no current-time lookup |

The fixed evaluation timestamp makes the deployed snapshot deterministic, but
it also means the UI does not naturally advance expiry/freshness as wall-clock
time moves. A regulatory library needs an explicit, reviewed “as of” policy.

## 6. Exact blockers and minimum safe production path

### Already production-ready

Infrastructure only:

- read-only authenticated GET routing;
- safe status presentation with no mutation controls;
- deterministic closed schemas for tariff candidates/reviews/artifacts;
- fail-closed candidate review evaluation;
- immutable packaging manifest; and
- local-only durable/store/export/scheduler controls that remain blocked.

No content is production-ready.

### Requires only UI exposure

Nothing yet. UI exposure alone cannot turn any checked-in item into an approved
regulation.

After approved regulatory artifacts and an approved-only catalog exist, the
existing shell, route authorization, safe HTML escaping, hash disclosure, and
status dictionaries can be reused.

### Requires human approval

- every real ARCA content snapshot;
- the currentness and amendment status of Decreto 557/2023 and each proposed
  regulatory instrument;
- reviewer identity and evidence;
- the legal-information disclaimer;
- the first release allowlist; and
- the exact immutable production catalog/package.

### Requires missing metadata

Every proposed regulation needs:

- stable canonical regulation ID;
- official title and regulation number;
- issuing authority;
- direct official source URL;
- publication date;
- effective-from/effective-to dates;
- governed acquisition timestamp;
- raw and canonical content hashes;
- review ID/hash, reviewer identity, decision timestamp, and statement;
- topic taxonomy;
- freshness/as-of status;
- supersedes/superseded-by relationships and history; and
- explicit information-only/non-execution disclaimer.

The current tariff schemas do not model most of these fields.

### Requires new acquisition

Actual version-pinned official regulation bodies and amendments. The current
Decreto 557/2023 records explicitly say the text was not ingested. ARCA source
files may support a future tariff library, but they are not a substitute for a
regulatory instrument corpus.

This audit did not perform that acquisition.

### Requires architectural work

1. Define a separate approved ARCA regulatory-instrument contract. Do not
   silently overload `ApprovedArcaArtifact`, whose payload is tariff lines.
2. Define an immutable approved-only catalog and deterministic search
   projection.
3. Load only exact catalog-listed artifacts; fail closed on a missing,
   malformed, unapproved, expired, superseded-as-current, or hash-mismatched
   item.
4. Add list/search/detail read models and routes.
5. Package the catalog and exact approved artifacts in Vercel without globs.
6. Add an explicit as-of/freshness policy that does not depend on the fixed
   2026-07-15 Operator timestamp.
7. Keep acquisition, review, builder, persistence, scheduler, export, and all
   write actions outside the web application.

## 7. First safe release: “ARCA Regulatory Library — Read Only”

### Release rule

The first non-empty release must contain an explicit allowlist of only
human-approved, content-hash-bound, current regulatory instruments. If no item
passes, the library must render an honest empty state; it must not fall back to
pending fixtures, legacy parsed tariffs, excerpt packets, or model output.

### Read-only capabilities

- list approved ARCA regulations;
- deterministic local search by number, title, and reviewed topic;
- detail page per canonical regulation ID;
- direct official source link;
- publication and effective dates;
- acquisition timestamp;
- raw/canonical content hashes and canonicalization version;
- review status, reviewer identity, review ID/hash, decision time, and evidence
  reference;
- freshness/as-of label;
- supersession state and replacement history; and
- visible disclaimer:
  “Información y evidencia de referencia. No constituye interpretación legal,
  asesoramiento vinculante, autorización de ejecución ni instrucción para
  actuar.”

### Exclusions

- automated legal conclusions;
- customs interpretation or classification decisions;
- provider/model actions;
- scheduler or acquisition controls;
- write actions;
- approval/rejection/build/export/publication buttons;
- database mutation;
- publication bypass;
- hidden fallback to unreviewed content; and
- any implication that “approved evidence” authorizes execution.

### Proposed read path

`exact packaged catalog → validate catalog hash → load exact listed artifacts → validate schema/hash/review/currentness → build immutable read model → list/search/detail renderers`

The browser must never scan directories or decide approval. The catalog is the
reviewed allowlist; all search material is derived deterministically from it.

## 8. ARCA control-plane asset inventory

These assets are supporting controls and test/evidence material, not category A
publication items.

### Core implementation and symbols

| Exact path                                        | Primary symbols / purpose                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/acquisition/governed-source-acquisition.ts`  | `GOVERNED_ARCA_EXACT_SOURCE_URLS`, `GOVERNED_ARCA_ACQUISITION_POLICY`, `acquireSource`               |
| `src/parsers/arca-nomenclador.ts`                 | `TariffLine`, `parseArcaNomencladorText`, `parseArcaNomencladorBytes`                                |
| `src/ingestion/governed-arca-acquired-source.ts`  | `GovernedArcaCandidateArtifact`, `validateGovernedArcaCandidate`, `ingestGovernedArcaAcquiredSource` |
| `src/review/governed-arca-candidate-review.ts`    | `GovernedArcaCandidateReview`, `ArcaReviewLifecycle`, `evaluateGovernedArcaCandidateReview`          |
| `src/artifacts/approved-arca-artifact-builder.ts` | `ApprovedArcaArtifact`, `validateApprovedArcaArtifact`, `buildApprovedArcaArtifact`                  |
| `src/store/durable-arca-review-store.ts`          | `DURABLE_ARCA_STORE_LAYOUT`, `executeDurableArcaStoreCommand`, `readVerifiedDurableArcaExportSource` |
| `src/live-run/controlled-live-arca-run.ts`        | `preflightControlledLiveArcaRun`, `executeControlledLiveArcaRun`, recovery inspectors                |
| `src/export/governed-arca-export.ts`              | `GovernedArcaExportPackage`, `preflightGovernedArcaExport`, `executeGovernedArcaExport`              |
| `src/scheduler/governed-arca-scheduler.ts`        | scheduler schemas, `observeGovernedArcaScheduler`, `runGovernedArcaSchedulerOnce`                    |
| `src/operator/operator-read-model-assets.ts`      | exact production asset manifest                                                                      |
| `src/operator/repository-operator-read-model.ts`  | repository fixture loader and fixed absent Approved Artifact projection                              |
| `src/operator/arca-review-console-view-model.ts`  | presentation-only ARCA projection and state labels                                                   |
| `src/operator/operator-console.ts`                | `arcaReview`, `/operator/arca-review` dispatch                                                       |
| `src/operator/operator-console-handler.ts`        | authenticated GET-only handler                                                                       |
| `src/application/application-shell.ts`            | route registration and allowed roles                                                                 |
| `api/index.ts`                                    | production entrypoint and packaged root                                                              |

Legacy/local utilities, not production library paths:

- `src/crawlers/arca-crawler.ts`
- `src/crawlers/arca-real-crawler.ts`
- `src/crawlers/generate-packet-from-arca.ts`
- `src/cli/arca-source-acquisition.ts`
- `src/cli/arca-acquired-source-ingestion.ts`
- `src/cli/approved-arca-artifact-builder.ts`
- `src/cli/durable-arca-review-store.ts`
- `src/cli/controlled-live-arca-run.ts`
- `src/cli/governed-arca-export.ts`
- `src/cli/governed-arca-scheduler.ts`
- `scripts/create-test-arca-excel.ts`

### Published ARCA schemas

Candidate/review/artifact:

- `schemas/governed-arca-acquired-source-input.schema.json`
- `schemas/governed-arca-candidate.schema.json`
- `schemas/governed-arca-candidate-review.schema.json`
- `schemas/governed-arca-candidate-review-evaluation.schema.json`
- `schemas/approved-arca-artifact.schema.json`
- `schemas/approved-arca-artifact-build-result.schema.json`

Durable store:

- `schemas/durable-arca-store-command.schema.json`
- `schemas/durable-arca-store-audit-event.schema.json`
- `schemas/durable-arca-store-operation-journal.schema.json`
- `schemas/durable-arca-store-operation-result.schema.json`
- `schemas/durable-arca-workflow-projection.schema.json`

Controlled acquisition:

- `schemas/controlled-live-arca-run-proposal.schema.json`
- `schemas/controlled-live-arca-run-authorization.schema.json`
- `schemas/controlled-live-arca-kill-switch.schema.json`
- `schemas/controlled-live-arca-run-journal.schema.json`
- `schemas/controlled-live-arca-run-result.schema.json`
- `schemas/durable-controlled-live-arca-run-record.schema.json`

Export:

- `schemas/arca-export-proposal.schema.json`
- `schemas/arca-export-authorization.schema.json`
- `schemas/arca-export-kill-switch.schema.json`
- `schemas/arca-export-root-configuration.schema.json`
- `schemas/arca-export-package.schema.json`
- `schemas/arca-export-result.schema.json`
- `schemas/arca-export-journal.schema.json`
- `schemas/durable-arca-export-record.schema.json`

Scheduler:

- `schemas/arca-scheduler-configuration.schema.json`
- `schemas/arca-scheduler-activation.schema.json`
- `schemas/arca-scheduled-run-request.schema.json`
- `schemas/arca-scheduler-lease.schema.json`
- `schemas/arca-scheduler-run-journal.schema.json`
- `schemas/arca-scheduler-run-result.schema.json`
- `schemas/arca-scheduler-observation.schema.json`
- `schemas/arca-scheduler-recovery-input.schema.json`
- `schemas/arca-scheduler-recovery-decision.schema.json`
- `schemas/arca-scheduler-kill-switch.schema.json`
- `schemas/arca-scheduler-attempt-ledger.schema.json`
- `schemas/arca-scheduler-attempt-ledger-manifest.schema.json`
- `schemas/arca-scheduler-slot-acceptance.schema.json`
- `schemas/arca-scheduler-reviewed-environment.schema.json`
- `schemas/arca-scheduler-ai-131-disposition.schema.json`
- `schemas/arca-scheduler-ai-132-disposition.schema.json`

Operator projection:

- `schemas/ai-operator-read-model.schema.json`

### Repository-current ARCA configuration

| Exact path                                                       | State                                                             |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `config/ai-131-controlled-live-arca-kill-switch.json`            | active; live execution blocked                                    |
| `config/ai-131-controlled-live-arca-run-template.json`           | template only; no authorization/run/acquisition/candidate         |
| `config/ai-132-governed-arca-export-kill-switch.json`            | active; export blocked                                            |
| `config/ai-133-governed-arca-scheduler.json`                     | inactive, observation-only, maximum runs 0, all authorities false |
| `config/ai-133-governed-arca-scheduler-kill-switch.json`         | active; execution blocked                                         |
| `config/ai-133-governed-arca-scheduler-activation-template.json` | template only; no activation                                      |

### Test and architecture boundary inventory

ARCA contract and behavior:

- `tests/parsers/arca-nomenclador.test.ts`
- `tests/ingestion/governed-arca-acquired-source.test.ts`
- `tests/review/governed-arca-candidate-review.test.ts`
- `tests/artifacts/approved-arca-artifact-builder.test.ts`
- `tests/store/durable-arca-review-store.test.ts`
- `tests/live-run/controlled-live-arca-run.test.ts`
- `tests/export/governed-arca-export.test.ts`
- `tests/scheduler/governed-arca-scheduler.test.ts`
- `tests/operator/arca-review-console.test.ts`
- `tests/helpers/real-arca-boundaries.ts`

Fail-closed dependency boundaries:

- `tests/architecture/governed-arca-ingestion-boundary.test.ts`
- `tests/architecture/governed-arca-candidate-review-boundary.test.ts`
- `tests/architecture/approved-arca-artifact-builder-boundary.test.ts`
- `tests/architecture/durable-arca-review-store-boundary.test.ts`
- `tests/architecture/controlled-live-arca-run-boundary.test.ts`
- `tests/architecture/governed-arca-export-boundary.test.ts`
- `tests/architecture/governed-arca-scheduler-boundary.test.ts`
- `tests/architecture/operator-read-model-boundary.test.ts`
- `tests/architecture/operator-read-model-packaging.test.ts`
- `tests/architecture/vercel-function-deployment.test.ts`

Application routing and presentation:

- `tests/operator/operator-read-model.test.ts`
- `tests/operator/mission-center.test.ts`
- `tests/operator/operator-presentation.test.ts`
- `tests/operator/operator-console.test.ts`
- `tests/operator/operator-spanish-interface.test.ts`
- `tests/application/application-entrypoint.test.ts`
- `tests/application/application-shell.test.ts`

### Evidence and architecture records

- `docs/agents/arca-source-acquisition.md`
- `docs/architecture/durable-arca-review-artifact-store.md`
- `docs/architecture/ai-operator-read-model.md`
- `docs/architecture/ai-lab-operator-console.md`
- `docs/architecture/ai-lab-production-application-shell.md`
- `docs/deployment/ai-lab-vercel-production-preparation.md`
- `docs/evidence/ai-126-governed-arca-acquired-source-ingestion-2026-07-22.md`
- `docs/evidence/ai-127-arca-candidate-human-review-2026-07-22.md`
- `docs/evidence/ai-128-approved-arca-artifact-builder-2026-07-22.md`
- `docs/evidence/ai-129-arca-operator-review-console-2026-07-22.md`
- `docs/evidence/ai-130-durable-arca-review-artifact-store-2026-07-22.md`
- `docs/evidence/ai-131-controlled-live-arca-run-2026-07-22.md`
- `docs/evidence/ai-132-governed-arca-export-boundary-2026-07-22.md`
- `docs/evidence/ai-133-governed-arca-scheduler-locking-recovery-2026-07-23.md`
- `docs/evidence/ai-136-operator-read-model-asset-packaging-2026-07-27.md`

The evidence records consistently say that positive approval/artifact/export
cases exist only in temporary synthetic tests and that no real repository
Approved ARCA Artifact exists. In particular:

- `docs/evidence/ai-128-approved-arca-artifact-builder-2026-07-22.md`:
  “no real artifact created”;
- `docs/evidence/ai-129-arca-operator-review-console-2026-07-22.md`:
  repository state is synthetic and pending; and
- `docs/evidence/ai-132-governed-arca-export-boundary-2026-07-22.md`:
  no real export authorization/package/record exists.

## 9. Required PR sequence, ordered by urgency

No PR should be opened until the human scope decision in section 10 is made.
The paths below are likely changes, not changes authorized by this audit.

### PR 1 — Regulatory-instrument contract and fail-closed validator

Purpose: define what an approved ARCA regulation is, independently of the
existing tariff-line artifact.

Likely files:

- new `schemas/approved-arca-regulatory-instrument.schema.json`;
- new `schemas/approved-arca-regulatory-catalog.schema.json`;
- `schemas/schema-registry.json`;
- new `src/regulatory/approved-arca-regulatory-instrument.ts`;
- new validation and architecture-boundary tests; and
- a dated evidence report.

Exit gate: schemas include all required metadata, content/review hashes,
freshness, supersession, disclaimer, and false authority fields.

### PR 2 — First reviewed evidence set and human approvals

Purpose: add version-pinned official content and review records for the smallest
approved allowlist.

Likely files:

- new governed source/acquisition artifacts under a reviewed data root;
- new approved regulation artifacts under a dedicated immutable root;
- new review/evidence records;
- the approved-only catalog; and
- validation evidence.

This PR depends on a separately authorized acquisition and actual independent
human review. It must not repurpose the synthetic fixture or legacy AI outputs.

### PR 3 — Approved-only regulatory library read model

Purpose: load and validate the exact catalog and build list/search/detail
projections without filesystem discovery.

Likely files:

- `src/operator/operator-read-model.ts`;
- `src/operator/repository-operator-read-model.ts`;
- `schemas/ai-operator-read-model.schema.json` or a separate library read-model
  schema;
- new `src/operator/arca-regulatory-library-view-model.ts`;
- read-model, hash-mutation, expiry, supersession, and fail-closed tests.

Exit gate: pending/rejected/expired/superseded/invalid artifacts cannot enter
the current library; history remains visible where applicable.

### PR 4 — Read-only list, search, and detail UI

Purpose: expose the approved read model.

Likely files:

- `src/application/application-shell.ts`;
- `src/operator/operator-console.ts`;
- `src/operator/operator-console-handler.ts` only if route parsing is needed;
- UI/presentation dictionaries;
- Operator route/accessibility/security tests.

Proposed routes:

- `/operator/arca-library`
- `/operator/arca-library/:canonical-id`

Search must be GET/read-only and deterministic. No approval or action controls.

### PR 5 — Exact production packaging and release evidence

Purpose: package only the catalog and its exact approved artifacts.

Likely files:

- `src/operator/operator-read-model-assets.ts`;
- `vercel.json`;
- `tests/architecture/operator-read-model-packaging.test.ts`;
- `tests/architecture/vercel-function-deployment.test.ts`;
- `docs/deployment/ai-lab-vercel-production-preparation.md`; and
- a release evidence report.

Exit gate: package equality test, missing/tampered artifact fail-closed tests,
production build, authenticated preview review, and separate human deployment
approval.

## 10. Human decisions required

1. Decide whether the first product is a **regulatory instrument library** or
   an **ARCA tariff/NCM library**. The current Approved ARCA Artifact contract
   supports the latter, not the former.
2. Choose the first one to three official instruments and exact source
   editions. Do not start with an unbounded corpus.
3. Decide whether partially amended instruments may be shown as historical
   entries and how current consolidated status is represented.
4. Approve the regulation metadata schema, topic taxonomy, freshness policy,
   and supersession semantics.
5. Define the independent reviewer identity assurance and acceptable reviewer
   evidence.
6. Approve the Spanish disclaimer and placement.
7. Decide whether an empty approved-only library may be deployed before the
   first content approval.
8. Approve each future acquisition, each actual content review, every PR,
   Vercel packaging change, and deployment separately.

## 11. Risks and rollback

| Risk                                                      | Control                                                                    |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Tariff rows mislabeled as regulations                     | separate regulatory-instrument schema and UI name                          |
| Source identity approval mistaken for content approval    | require content fingerprint, version scope, and explicit content review    |
| Stale or amended law shown as current                     | reviewed as-of date, freshness policy, and supersession graph              |
| Legacy AFIP locator conflicts with current ARCA authority | preserve requested/effective URLs and reviewed authority identity          |
| Model-generated claims leak into the library              | catalog admits only human-approved hashed artifacts; no model outputs      |
| Fixed evaluation timestamp hides future expiry            | explicit release-time/currentness policy with deterministic injected as-of |
| Missing or tampered packaged file                         | exact manifest plus schema/hash fail-closed behavior                       |
| UI implies execution authority                            | visible disclaimer and all authority fields false; no mutation controls    |
| Broad Vercel packaging exposes unrelated data             | exact file allowlist; no directory globs                                   |
| Rollback loses mutable review state                       | release is immutable/read-only; review remains outside the web app         |

Rollback for the future release:

1. remove or disable the new library routes in a reviewed revert;
2. restore the prior exact 21-file packaging manifest;
3. redeploy the last reviewed immutable application version; and
4. retain the approved artifacts and review evidence for audit, but do not
   expose them through the reverted catalog.

Because the proposed release performs no writes, rollback requires no database
reversal, scheduler action, acquisition cancellation, or execution-authority
change.

## Final decision

**Production today:** zero ARCA regulations.

**Current production-configured ARCA presentation:** one synthetic,
pending-review fixture and an explicitly absent Approved Artifact, assuming the
live deployment matches the audited repository package.

**Smallest safe path:** define a regulation-specific approved artifact,
acquire/version-pin official content under separate authorization, obtain real
independent human approval, create an exact approved-only catalog, and then add
read-only list/search/detail UI plus exact Vercel packaging.
