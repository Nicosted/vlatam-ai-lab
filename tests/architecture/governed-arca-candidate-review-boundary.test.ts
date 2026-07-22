import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const REVIEW_MODULE = "src/review/governed-arca-candidate-review.ts";

test("ARCA candidate review evaluator is pure, injected, and production-isolated", async () => {
  const source = await readFile(REVIEW_MODULE, "utf8");

  assert.doesNotMatch(source, /from ["']node:fs|from ["']node:path/);
  assert.doesNotMatch(source, /\bfetch\s*\(|https?\.request|WebSocket/);
  assert.doesNotMatch(source, /OpenAI|Anthropic|provider.*adapter|prompt\s*:/i);
  assert.doesNotMatch(
    source,
    /from .*supabase|from .*postgres|database\.(?:write|insert|update)|\.insert\s*\(/i,
  );
  assert.doesNotMatch(
    source,
    /from .*scheduler|from .*cron|setInterval\s*\(|setTimeout\s*\(/i,
  );
  assert.doesNotMatch(
    source,
    /approved-artifact\.schema|ApprovedArtifactBuilder/,
  );
  assert.doesNotMatch(source, /from .*export|from .*publisher/i);
  assert.doesNotMatch(source, /vlatam-global|vlatamGlobal/);
  assert.doesNotMatch(source, /process\.env|secret|credential/i);
  assert.match(source, /candidateValue: unknown/);
  assert.match(source, /reviewValue: unknown/);
  assert.match(source, /export_authorized: false/);
  assert.match(source, /publication_authorized: false/);
  assert.match(source, /execution_performed: false/);
});
