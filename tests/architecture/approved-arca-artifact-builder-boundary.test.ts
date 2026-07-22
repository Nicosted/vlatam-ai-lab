import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const FILES = [
  "src/artifacts/approved-arca-artifact-builder.ts",
  "src/cli/approved-arca-artifact-builder.ts",
];

test("Approved ARCA builder remains local, deterministic, and production-isolated", async () => {
  const source = (
    await Promise.all(FILES.map((path) => readFile(path, "utf8")))
  ).join("\n");
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
    /from .*deployment|from .*publisher|from .*export/i,
  );
  assert.doesNotMatch(source, /process\.env|from .*secret|from .*credential/i);
  assert.doesNotMatch(source, /vlatam-global|vlatamGlobal/);
  assert.doesNotMatch(source, /Date\.now\s*\(|new Date\s*\(\s*\)/);
  assert.match(source, /validateGovernedArcaCandidate/);
  assert.match(source, /validateGovernedArcaCandidateReviewEvaluation/);
  assert.match(source, /evaluateGovernedArcaCandidateReview/);
  assert.match(source, /publication_authorized: false/);
  assert.match(source, /network_call_authorized: false/);
  assert.match(source, /database_write_authorized: false/);
  assert.match(source, /scheduler_authorized: false/);
  assert.match(source, /deployment_authorized: false/);
  assert.match(source, /vlatam_global_access_authorized: false/);
});

test("builder CLI exposes only governed local contract and identity inputs", async () => {
  const source = await readFile(
    "src/cli/approved-arca-artifact-builder.ts",
    "utf8",
  );
  for (const argument of [
    '"--candidate"',
    '"--review"',
    '"--evaluation"',
    '"--approved-artifact-root"',
    '"--builder-identity"',
    '"--build-timestamp"',
  ])
    assert.match(source, new RegExp(argument));
  assert.doesNotMatch(
    source,
    /"--url"|"--prompt"|"--raw-file"|"--credential"|"--network"|"--publish"|"--export"|"--production"/,
  );
});
