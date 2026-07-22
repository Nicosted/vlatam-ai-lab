import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI-131 imports only governed acquisition, ingestion, store, parser identity, and validation", async () => {
  const source = await readFile(
    "src/live-run/controlled-live-arca-run.ts",
    "utf8",
  );
  for (const forbidden of [
    /["']\.\.\/providers\//,
    /["']\.\.\/adapters\//,
    /["']\.\.\/review\//,
    /["']\.\.\/artifacts\//,
    /from ["'][^"']*scheduler/,
    /from ["'][^"']*publisher/,
    /from ["'][^"']*vlatam-global/,
    /from ["'](?:openai|@supabase|pg|postgres)/,
  ])
    assert.doesNotMatch(source, forbidden);
  assert.match(source, /acquisition\/governed-source-acquisition/);
  assert.match(source, /ingestion\/governed-arca-acquired-source/);
  assert.match(source, /store\/durable-arca-review-store/);
  assert.doesNotMatch(
    source,
    /ApprovedArcaArtifact|evaluateGovernedArcaCandidateReview/,
  );
});

test("manual CLI has no arbitrary transport or downstream authority controls", async () => {
  const source = await readFile("src/cli/controlled-live-arca-run.ts", "utf8");
  for (const forbidden of [
    "--url",
    "--host",
    "--headers",
    "--cookie",
    "--proxy",
    "--retry",
    "--scheduler",
    "--export",
    "--publish",
    "--production",
    "--disable-kill-switch",
  ])
    assert.doesNotMatch(source, new RegExp(`"${forbidden}"`));
  assert.doesNotMatch(source, /readline|prompt|password|credential/);
});
