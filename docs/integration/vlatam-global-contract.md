# vlatam-global Contract Alignment

This repository is production-isolated. It must not import from or call
`vlatam-global`. Delta Analyzer instead uses a local bridge that mirrors the
runtime contract required by vlatam-global.

Bridge file:

```text
src/contracts/vlatam-global-bridge.ts
```

## Allowed Claim Types

Delta Analyzer may emit only these five claim types:

```text
tariff
intervention
norm
legal
classification
```

Any other value is a contract violation.

## Mandatory Governance Flags

Every Delta Analyzer evidence packet must include:

```json
{
  "human_review_required": true,
  "downstream_allowed": false,
  "review_only": true,
  "not_final_classification": true
}
```

These flags are non-negotiable. They do not vary by confidence score, source,
or claim type.

## Mapping Rules

Delta Analyzer maps Source Monitor change paths to claim types in this order:

| Path contains | Claim type |
| --- | --- |
| `rate`, `tariff`, `arancel`, `duty`, `tax` | `tariff` |
| `classification`, `ncm`, `hs_code`, `sh_code`, `codification` | `classification` |
| `intervention`, `license`, `permit`, `sensors`, `anmat`, `enacom`, `sennir` | `intervention` |
| `legal`, `law`, `decree`, `resolution`, `disposition`, `statute` | `legal` |
| No match | `norm` |

## Validation Process

Delta Analyzer validates in this sequence:

1. Read the local Source Monitor delta file.
2. Validate the delta against `schemas/source-monitor-delta.schema.json`.
3. Map each delta change to a claim type.
4. Validate each claim type with `isValidClaimType`.
5. Add mandatory governance flags with `getGovernanceFlags`.
6. Validate the output packet against
   `schemas/delta-analyzer-evidence-packet.schema.json`.
7. Write the packet only after all validation passes.

If claim type validation fails, the agent throws:

```text
CONTRACT_VIOLATION: Invalid claim_type <type>
```

No evidence packet is written in that case.

## Runtime Failure Mode

The vlatam-global runtime is fail-closed. If a response contains a claim type
outside its allowlist, the runtime rejects it with:

```text
HTTP 502 contract_rejected
```

Delta Analyzer prevents that class of failure locally by validating every
mapped claim before output.

## Adding Claim Types

Do not add claim types in this repository alone. Adding a claim type requires:

1. vlatam-global contract update.
2. Runtime smoke validation.
3. Local bridge update in `src/contracts/vlatam-global-bridge.ts`.
4. Schema enum update in `schemas/delta-analyzer-evidence-packet.schema.json`.
5. Mapping rule and test updates.
6. Human review before merge.

Until those steps are complete, the only valid claim types are the five listed
above.

## Compatibility Tests

Run:

```bash
pnpm exec tsx --test tests/contracts/vlatam-global-bridge.test.ts
pnpm exec tsx --test tests/schemas/delta-analyzer-evidence-packet-schema.test.ts
pnpm exec tsx --test tests/agents/delta-analyzer.test.ts
```

The full repository checks are:

```bash
pnpm lint
pnpm test
pnpm build
```
