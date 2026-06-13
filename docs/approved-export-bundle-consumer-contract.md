# Approved Export Bundle Consumer Contract

## Purpose

Define the read-only consumer contract for the approved export bundle generated
by AI Lab.

AI Lab remains repo-first. The source of truth is reviewed, versioned,
human-approved repository artifacts validated by local schemas, fixtures,
reports, and deterministic tests. This contract describes what a future
consumer may rely on after local verification and bundling; it does not
implement a live bridge.

## Source Snapshot Context

Current local handoff surface:

- verified catalog fixture:
  `snapshots/pcram/demo-classifier-approved-artifact-export-catalog.json`
- bundle output:
  `exports/approved-catalog/index.json`
- bundle builder:
  `src/pipelines/build-approved-export-bundle.ts`
- catalog verifier:
  `src/pipelines/verify-approved-export-catalog.ts`
- catalog schema:
  `schemas/classifier-approved-artifact-export-catalog.schema.json`
- export contract schema:
  `schemas/classifier-approved-artifact-export-contract.schema.json`

The generated bundle is local-only and deterministic. Its `generated_at` value is
copied from the verified source catalog, not from wall-clock generation time.

## Producer Sequence

Before any future consumer treats the bundle as available, the producer must run:

```bash
pnpm ai:exports:verify
pnpm ai:exports:bundle
```

`pnpm ai:exports:verify` validates the approved export catalog handoff,
including schema shape, referenced export contracts, approved artifact refs,
review status, downstream permission, hashes, deterministic repository-relative
references, and no live runtime coupling.

`pnpm ai:exports:bundle` runs the same verification gate and writes:

```text
exports/approved-catalog/index.json
```

The bundle is a repo-local handoff artifact. It is not an API route, database
sync, production service, Graphify output, provider integration, or vLatamGlobal
runtime behavior change.

## Bundle Definition

The approved export bundle is a deterministic JSON index over the verified
approved export catalog. It exposes only reviewed handoff metadata:

- bundle schema name and version;
- bundle id and version;
- source catalog id, version, schema version, ref, and scope;
- verification metadata showing the local verifier command passed;
- explicit boundary flags declaring read-only, no live integration, no shared
  database coupling, no production route, no runtime writeback, no raw model
  output, and no local machine paths;
- approved artifact entries with export contract refs, artifact refs, review
  manifest refs, content refs, evidence refs, repository refs, and hashes.

The bundle intentionally excludes raw model output, secrets, local machine
paths, live service URLs, database project refs, runtime assumptions, and
writeback behavior.

## Consumer Reliance Contract

A future consumer may rely on the following fields only after verification
metadata is present and the consumer has validated the bundle shape it supports:

- schema and version metadata:
  `schema_name`, `schema_version`, `bundle_id`, `bundle_version`;
- catalog metadata:
  `source_catalog.catalog_id`, `source_catalog.catalog_version`,
  `source_catalog.catalog_schema_version`, `source_catalog.catalog_ref`, and
  `source_catalog.catalog_scope`;
- reviewed approved artifact refs:
  `artifact_ref`, `review_manifest_ref`, `content_ref`, `content_hash`, and
  `repository_refs`;
- export contract refs:
  `export_contract_ref`, `export_contract_hash`, `contract_id`,
  `contract_schema_version`, and `export_version`;
- downstream eligibility flags only when backed by review approval:
  `review_status: approved`, `approval_state: approved`,
  `human_review_required: true`, `downstream_eligible: true`, and
  `downstream_allowed: true`;
- deterministic repo-relative references that stay inside the repository and do
  not use absolute paths, home-directory refs, parent traversal, protocol refs,
  or local machine paths.

Consumers should treat the bundle as an index, not as the full decision payload.
The referenced approved artifact, export contract, review manifest, content, and
evidence files remain part of the reviewed handoff surface and must be verified
before use.

## Consumer Prohibitions

A future consumer must not:

- treat demo or synthetic artifacts as production-ready;
- treat Graphify output as approved intelligence or regulatory truth;
- infer final customs, classification, tax, logistics, or legal decisions from
  the bundle;
- bypass human review, review manifests, approval scope, limitations, or
  downstream boundaries;
- mutate AI Lab artifacts, write back into this repository, or create runtime
  state inside AI Lab;
- call live provider APIs as part of consuming the bundle;
- depend on Supabase, shared databases, or runtime APIs unless a future explicit
  integration introduces them through reviewed implementation work;
- consume raw LLM/provider outputs or internal agent state;
- loosen review, downstream eligibility, hash, schema, or repo-relative
  reference checks.

## Expected vLatamGlobal Consumption Mode

Future vLatamGlobal consumption, if introduced by a later PR, should be:

- read-only;
- contract-based;
- pinned to a bundle id, bundle version, and content hash or equivalent
  integrity marker;
- fail-closed when verification metadata is missing, stale, invalid, or
  unsupported;
- explicit in the UI about source, review, draft, approval, eligibility,
  limitation, and downstream-use boundaries.

vLatamGlobal should record its own runtime-side review, override, and audit
events on its side. AI Lab remains the source of reviewed, versioned,
human-approved intelligence artifacts; it does not become the operational
classifier runtime.

## Future Bridge Requirements

A future bridge PR must satisfy this checklist before any runtime consumption is
enabled:

- AI Lab bundle generated and verified;
- consumer validates bundle shape and supported schema/version metadata;
- consumer treats the bundle and referenced AI Lab artifacts as read-only;
- consumer preserves human-review, approval-scope, limitation, draft, and
  downstream boundaries;
- consumer exposes no raw provider output or internal agent state;
- consumer has tests for stale, missing, malformed, unsupported, and invalid
  bundles;
- no Supabase, shared database, live API, or runtime coupling unless explicitly
  introduced by a future reviewed PR.

## Assumptions and Limitations

This contract is documentation-only. It reflects the current local bundle and
verification behavior, but it does not add schemas, migrations, runtime APIs,
provider calls, Supabase configuration, Graphify output, or vLatamGlobal bridge
behavior.

Any future external integration must define its own validation, pinning, failure
mode, UI boundary, audit, and security requirements before consuming the bundle.
