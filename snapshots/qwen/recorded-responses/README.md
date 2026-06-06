# Qwen recorded-response fixtures

Sanitized, **demo/synthetic-only** Qwen response fixtures used by the offline
replay path (`pnpm ai:extract:replay-qwen-demo`) and automated tests. These
fixtures let the AI extraction workflow validate real Qwen-shaped output without
any live DashScope/Qwen call or credentials.

## Safety rules

- Fixtures are **demo/synthetic only** and are **not approved intelligence**.
- Replay output is always draft/unreviewed: `human_review_required=true`,
  `downstream_allowed=false`.
- Fixtures contain only the minimal sanitized response shape
  (`choices[].{index,finish_reason}` and `choices[].message.{role,content}`).
- Fixtures must **never** contain API keys, provider request ids, account ids,
  HTTP headers, usage/billing data, or any customer data.
- Tests must **not** require `DASHSCOPE_API_KEY`.

## `origin` field

- `replay_demo_derived` — derived offline from the deterministic demo provider
  over the synthetic embedded-evidence packet. **Not** a real Qwen recording.
- `live_recorded` — captured (and sanitized) from a live Qwen/DashScope call
  against the synthetic demo packet via `pnpm ai:extract:record-qwen-demo`.

The checked-in fixture
(`qwen-demo-embedded-evidence.recorded.json`) is `replay_demo_derived`: it is
shaped exactly like a Qwen OpenAI-compatible response but its content is derived
from synthetic demo data, not captured from a live model.
