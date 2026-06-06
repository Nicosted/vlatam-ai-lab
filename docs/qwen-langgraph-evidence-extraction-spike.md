# Qwen + LangGraph Evidence Extraction Spike

This spike adds the first controlled AI-assisted extraction workflow on top of
`extractable_evidence_packet` fixtures. It is intentionally a local AI Lab
foundation, not a production agent and not approved classifier intelligence.

## Flow

1. A local `extractable_evidence_packet` fixture is loaded or passed into the
   workflow.
2. The extractor node calls a provider-neutral `AiExtractionProvider`.
3. The critic node reviews the draft against the same bounded packet.
4. The validator/gate node emits an `ai_extraction_result` draft with:
   `human_review_required=true` and `downstream_allowed=false`.

The LangGraph graph is deliberately small:

- `extractor`
- `critic`
- `validator`

Tests use fake providers so the graph stays deterministic and never performs a
real network call.

## Provider Boundary

The provider contract is defined in
`src/intelligence/ai-extraction-provider.ts`:

- `provider_id`
- `model_id`
- `generateExtractionDraft(input)`
- `generateCritique(input)`

The Qwen implementation lives in
`src/intelligence/qwen-dashscope-provider.ts` and targets DashScope's
OpenAI-compatible chat completions API. It is intentionally replaceable by
future Bedrock, OpenAI, DeepSeek, or other providers without changing the
workflow contract.

## Manual Qwen Dry-Run

Use only fixture/demo evidence. Do not send customer data.

Required environment variables (manual use only):

- `DASHSCOPE_API_KEY`
- `QWEN_MODEL`
- `QWEN_BASE_URL` optional; defaults to DashScope OpenAI-compatible base URL

Recommended manual commands:

```sh
export QWEN_MODEL="qwen-plus"
pnpm ai:extract:dry-run
```

`qwen3.7-plus` may also be tested manually (`export QWEN_MODEL="qwen3.7-plus"`),
but the repository does not require it and no automated test depends on it.

The script fails safely when required variables are missing. When it runs, it
prints a draft/unreviewed result and never writes an approved artifact.

### Provider connectivity vs. validation

Qwen/DashScope connectivity is working when the dry-run prints
`provider_id=dashscope_qwen` and a non-empty `model_id`. That confirms the
provider boundary, not approved intelligence.

On the locator-only WCO HS 2022 packet, `extraction_status=validation_failed`
is the **expected** outcome: the packet carries only bounded locators/excerpt
references (no embedded evidence text), so there is nothing for the model to
ground a claim on, and any invalid `extracted_claims` shape (for example a plain
string instead of a claim object) is rejected into the conservative fallback.

## Embedded-Evidence Demo Path (Schema Validation Only)

To exercise the schema-valid extraction path without a live provider, the repo
ships a synthetic, demo-only evidence packet
(`snapshots/pcram/extractable-evidence-packet-demo-embedded-evidence.json`) that
embeds short, fictional excerpts under `metadata.embedded_evidence.excerpts`
(stable excerpt IDs, anchors, summaries, and per-excerpt content hashes). The
content is invented (a fictional "Veldoria Demo Tariff Nomenclature") and is
explicitly marked demo-only, non-authoritative, and not classifier-approved.

A deterministic, network-free provider
(`src/intelligence/embedded-evidence-demo-provider.ts`) maps each embedded
excerpt to a schema-compliant draft claim. Run it with no credentials:

```sh
pnpm ai:extract:demo
```

This path exists for schema validation only. Its output is still draft/unreviewed
and is not approved intelligence; the fictional regime carries no legal meaning.

## Recorded Qwen Replay Fixture (Offline)

There are three distinct extraction paths in this lab; keep them separate:

| Path                 | Provider                     | Network | Credentials | Command                                        |
| -------------------- | ---------------------------- | ------- | ----------- | ---------------------------------------------- |
| Deterministic demo   | `demo_embedded_evidence`     | none    | none        | `pnpm ai:extract:demo`                         |
| Live Qwen dry-run    | `dashscope_qwen` (live call) | yes     | required    | `QWEN_MODEL=qwen-plus pnpm ai:extract:dry-run` |
| Recorded Qwen replay | `dashscope_qwen` (recorded)  | none    | none        | `pnpm ai:extract:replay-qwen-demo`             |

The recorded replay path proves that **real Qwen-shaped output** can be
captured, sanitized, normalized, and re-validated against the AI extraction
schema **without a live DashScope/Qwen call** in automated tests.

### Fixture location and shape

The checked-in fixture lives at
`snapshots/qwen/recorded-responses/qwen-demo-embedded-evidence.recorded.json`.
It carries only the minimal sanitized response shape
(`choices[].{index,finish_reason}` plus `choices[].message.{role,content}`,
where `content` is the model's JSON string). It never contains API keys,
provider request ids, account ids, HTTP headers, usage/billing data, or customer
data. The capture timestamp is normalized.

The fixture's `origin` field records its provenance:

- `replay_demo_derived` — derived offline from the deterministic demo provider
  over the synthetic embedded-evidence packet. It is shaped like a Qwen response
  but is **not** a real Qwen recording.
- `live_recorded` — captured and sanitized from a live Qwen/DashScope call
  against the synthetic demo packet.

The fixture currently committed is `replay_demo_derived` (no live recording was
performed), and it is demo/synthetic only — **not approved intelligence**.

### Recording (optional, requires a key)

```sh
# Requires DASHSCOPE_API_KEY; QWEN_MODEL defaults to qwen-plus.
pnpm ai:extract:record-qwen-demo
```

The recorder:

- refuses to run against anything but the synthetic demo packet
  (`metadata.demo_only=true`, `non_authoritative=true`,
  `classifier_approved=false`, `jurisdiction_scope=demo`);
- sanitizes responses at the provider boundary and scans the serialized output
  for credential markers before writing;
- never prints the API key or raw payloads;
- fails gracefully with a clear message (and leaves the checked-in fixture
  untouched) when `DASHSCOPE_API_KEY` is absent.

### Replaying (offline, no key)

```sh
pnpm ai:extract:replay-qwen-demo
```

Replay reads the checked-in fixture, runs the LangGraph workflow with the
`RecordedQwenResponseProvider`, and prints a draft/unreviewed result. It performs
no network calls and requires no credentials. Output remains
`human_review_required=true` and `downstream_allowed=false`.

## Draft-Only Doctrine

Every AI extraction result remains unreviewed:

- `human_review_required` is always `true`.
- `downstream_allowed` is always `false`.
- Unsupported claims are surfaced in `unsupported_claims`.
- Confidence is only a triage signal and never approval.
- Extraction-ready evidence does not mean classifier-approved intelligence.

The schema enforces the safety flags, and the workflow sets them regardless of
provider output.

## Why Tests Use Fake Providers

Tests must be local, deterministic, and free of provider side effects. Fake
providers cover:

- successful extraction draft
- extractor + critic path
- critic flagging unsupported claims
- invalid model output
- incomplete model output with conservative fallback
- final safety flags

The deterministic `EmbeddedEvidenceDemoProvider` additionally backs three
schema-focused tests:

- the embedded-evidence demo packet produces at least one schema-valid claim and
  the whole result validates against `ai-extraction-result.schema.json`
- the locator-only packet stays conservative (empty claims, no downstream)
- plain strings inside `extracted_claims` are rejected with a path-specific
  warning (e.g. `extracted_claims[0]: claim must be a JSON object ...`)

The offline recorded-replay path adds further tests
(`tests/recorded-qwen-response-replay.test.ts`):

- the recorded fixture loads and replays through the workflow with global
  `fetch` disabled (proving no network access), producing a schema-valid result
- the replayed result keeps `human_review_required=true` and
  `downstream_allowed=false`
- the checked-in fixture is sanitized: choices carry only the allowed keys and
  the file trips no credential marker
- the fixture parser rejects raw provider metadata and any fixture that weakens
  the draft-only safety flags
- the recorder gate fails (without any network call) when `DASHSCOPE_API_KEY` is
  absent, and the recorder refuses non-demo evidence packets

No test requires `DASHSCOPE_API_KEY`, contacts DashScope, or performs any real
network call.

## AI Lab / vLatamGlobal Boundary

This spike does not integrate with vLatamGlobal. It creates no Supabase
migration, no production cron, no background agent, no classifier approval, and
no downstream-safe artifact. Future handoff remains limited to reviewed,
approved artifacts exposed through explicit review/API boundaries.

## Future AgentCore Path

The provider-neutral boundary and LangGraph workflow can later be hosted behind
AWS Bedrock AgentCore or another orchestrator by swapping the provider adapter
and adding explicit approval gates. That future runtime work must still consume
reviewed local artifacts only and must not expose raw internal agent state.

## Future Dual-Agent Evaluation

The same boundary can support Qwen/DeepSeek dual-agent evaluation by running two
extractor providers against the same evidence packet, routing both drafts
through the critic, and comparing unsupported-claim surfaces. Any comparison
output would remain draft-only until a human review manifest approves a derived
artifact.

## Deferred

- Production persistence
- vLatamGlobal integration
- classifier approval
- live source fetching
- customer-data inputs
- automatic approved artifact creation
- autonomous background execution
