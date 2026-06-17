# vlatam-global API Integration Contract

## Purpose and Architecture Boundary

This document is the canonical HTTP boundary contract between `vlatam-ai-lab`
and `vlatam-global`. AI Lab reviews and exports classifier intelligence;
`vlatam-global` consumes only approved, versioned export artifacts through the
read-only HTTP API.

The API response is the stable consumer surface defined by
`schemas/classifier-approved-artifact-export.schema.json`. It intentionally does
not expose:

- raw LLM or provider output;
- AI Lab internal governance flags;
- reviewer identity, review timestamps, or approval references;
- absolute filesystem paths; or
- database or storage internals.

AI Lab remains the source of reviewed export artifacts. `vlatam-global` remains
the operational runtime and must treat responses as read-only inputs rather
than as access to AI Lab internal state.

## Endpoint Specification

### Get an approved classifier export

- **Method:** `GET`
- **URL:** `/api/classifier/:source_id/:artifact_id`
- **Success content type:** `application/json`

| URL parameter | Type | Required | Validation | Example |
| --- | --- | --- | --- | --- |
| `source_id` | string | yes | `^[a-z0-9_-]+$` | `infoleg` |
| `artifact_id` | string | yes | `^artifact--[a-z0-9_-]+--[a-z0-9_-]+$` | `artifact--infoleg--extraction-001` |

Example request:

```http
GET /api/classifier/infoleg/artifact--infoleg--extraction-001
x-vlatam-ai-lab-key: <your-key>
```

Query parameters do not alter artifact selection. Consumers must send the
complete four-segment path shown above.

## Authentication

The classifier endpoint requires a valid API key in the
`x-vlatam-ai-lab-key` request header. Operators configure keys with the
preferred comma-separated `AI_LAB_API_KEYS` variable, or with the single-key
`AI_LAB_API_KEY` fallback when no list is configured. If neither variable
contains a key, the classifier endpoint fails closed.

`GET /health` is public and does not require authentication. Its response
remains limited to the documented health fields and does not expose key or
rate-limit state.

Example:

```bash
curl -H "x-vlatam-ai-lab-key: <your-key>" \
  http://localhost:3000/api/classifier/infoleg/artifact--infoleg--extraction-001
```

## Rate Limiting

All endpoints, including `/health`, use an in-memory per-IP rate limit. The
default permits 100 requests per 60,000-millisecond window. Operators may set
`RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS` to positive integer values.

Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header
whose value is the number of seconds until the current window resets. Because
the store is process-local, limits are not shared across server instances and
reset when an instance restarts; this is an accepted staging limitation.

## Success Response Contract

An HTTP `200` response contains one
`classifier-approved-artifact-export` object. The JSON object has the following
fields and permits no additional properties:

| Field | Type | Required | Contract |
| --- | --- | --- | --- |
| `export_id` | string | yes | Matches `^artifact--[a-z0-9_-]+--[a-z0-9_-]+--export$`. Stable identifier for this export. |
| `artifact_id` | string | yes | Matches the endpoint artifact identifier pattern. |
| `source_id` | string | yes | Matches `^[a-z0-9_-]+$`. |
| `exported_at` | string | yes | ISO 8601 date-time. Deterministically derived during export. |
| `classification_candidate` | object | no | May contain `ncm_code` (string), `description` (string), and `confidence` (number from 0 through 1). No additional properties. |
| `extracted_evidence` | array | yes | Reviewed evidence claims supporting the artifact. |
| `schema_version` | string | yes | Version of the export payload contract. |

Each `extracted_evidence` item requires `claim_id`, `claim_type`, and `text`.
`claim_type` is one of `tariff`, `intervention`, `norm`, `legal`, or
`classification`. An item may also contain `confidence` from 0 through 1 and an
`affected_ncm` array of strings. Evidence items permit no additional
properties.

The fields most relevant to runtime consumers are:

- `export_id`, for stable export identity and audit correlation;
- `classification_candidate.ncm_code` and
  `classification_candidate.confidence`, for the reviewed classification
  candidate and its bounded confidence value; and
- `extracted_evidence`, for the reviewed claims supporting interpretation of
  the candidate.

Example `200 OK` response using the Phase 9 Infoleg E2E fixture:

```json
{
  "export_id": "artifact--infoleg--extraction-001--export",
  "artifact_id": "artifact--infoleg--extraction-001",
  "source_id": "infoleg",
  "exported_at": "2026-06-16T20:00:00Z",
  "classification_candidate": {
    "ncm_code": "42029200110V",
    "description": "NCM 4202.92.00.110V appears in the source material as a classification-relevant candidate.",
    "confidence": 0.82
  },
  "extracted_evidence": [
    {
      "claim_id": "claim-001",
      "claim_type": "classification",
      "text": "NCM 4202.92.00.110V appears in the source material as a classification-relevant candidate.",
      "confidence": 0.82,
      "affected_ncm": [
        "42029200110V"
      ]
    },
    {
      "claim_id": "claim-002",
      "claim_type": "norm",
      "text": "The source material requires human review before any downstream classifier use.",
      "confidence": 0.7
    }
  ],
  "schema_version": "1.0.0"
}
```

## Error Handling

All error responses use `application/json` and this stable envelope:

```json
{
  "error": "HTTP status name",
  "message": "Sanitized consumer-safe message"
}
```

### `400 Bad Request`

Returned when the route shape or a URL parameter is invalid.

```json
{
  "error": "Bad Request",
  "message": "Invalid artifact_id format"
}
```

Other possible sanitized `400` messages are `Invalid URL format`,
`Invalid source_id format`, and `Invalid path`.

### `401 Unauthorized`

Returned when a classifier request has a missing or invalid API key.

```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

### `404 Not Found`

Returned when the endpoint is unknown or the requested export does not exist.

```json
{
  "error": "Not Found",
  "message": "Export artifact not found"
}
```

An unknown route returns the sanitized message `Endpoint not found`.

### `429 Too Many Requests`

Returned when the client IP exceeds its configured request limit. The response
includes `Retry-After` in seconds.

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded"
}
```

### `405 Method Not Allowed`

Returned when the endpoint is called with a method other than `GET`.

```json
{
  "error": "Method Not Allowed",
  "message": "Only GET is supported"
}
```

### `500 Internal Server Error`

Returned when an export cannot be read or fails export-contract validation.

```json
{
  "error": "Internal Server Error",
  "message": "Artifact validation failed"
}
```

A read or JSON parsing failure uses the sanitized message
`Artifact could not be read`.

Error messages never expose absolute filesystem paths, raw schema-validation
details, database internals, or internal artifact contents. Consumers should
fail closed, record the status plus sanitized message, and avoid inferring
internal state from an error.

## Security and Governance Rules

### Read-only

The API reads approved export JSON and returns it unchanged after validation. It
does not create, update, delete, or write back data.

### Deterministic identity and timestamps

Export identifiers are derived from the approved artifact identifier. The
export timestamp is stable and reproducible: by default, export creation uses
the approved artifact's `reviewed_at` value, with an explicit controlled
override available to local generation workflows. It does not use a wall-clock
fallback.

### Path containment

Strict parameter patterns reject malformed identifiers and traversal input.
The resolved artifact path must remain inside the configured exports root;
otherwise the request fails with `400 Bad Request`.

### P1 invariants and Human Review Gate

The export pipeline is the governance gate before the API surface. It creates
an export only when the source classifier intelligence artifact:

- passed the Human Review Gate;
- has `review_status: reviewed_approved`;
- has `downstream_allowed: true`;
- contains the required review and approval evidence; and
- is not marked with synthetic or demo provenance.

Synthetic and demo artifacts can never become downstream-allowed and therefore
must never be exported or served. Governance flags and reviewer metadata are
validated before export and deliberately removed from the consumer payload.
The API additionally validates the clean export contract before returning a
response.

## Consumer Responsibilities

`vlatam-global` must:

- validate the supported `schema_version` and fail closed on unsupported
  versions;
- treat missing, malformed, or non-`200` responses as unavailable input;
- retain `export_id`, `artifact_id`, and `source_id` for runtime-side audit
  correlation;
- preserve evidence and confidence context when using a classification
  candidate; and
- keep runtime decisions, overrides, and audit records on the
  `vlatam-global` side.

## Future Considerations (Out of Scope)

The current local contract adds staging API-key authentication and process-local
rate limiting. Shared rate-limit storage, consumer-specific quotas, JWT/OAuth2,
and shared caching remain out of scope. A future reviewed integration may
define a version-aware caching strategy for stable export responses, including
explicit invalidation and fail-closed behavior.

Any additions require separate review and must not weaken the read-only,
Human Review Gate, schema-validation, path-containment, or production-isolation
boundaries defined here.

## Source Snapshot, Assumptions, and Limitations

This contract was derived from and checked against the local Phase 11 server,
the approved export schema and validator, the Export Contract agent contract,
and the Phase 9 E2E fixture as of 2026-06-17. It documents the current local HTTP
surface. Authentication and rate limiting are local staging controls; this
phase does not activate production connectivity, a database bridge, shared
infrastructure, or any `vlatam-global` runtime change.
