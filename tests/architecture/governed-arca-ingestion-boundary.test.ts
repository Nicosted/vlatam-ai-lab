import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const BOUNDARY_FILES = [
  "src/ingestion/governed-arca-acquired-source.ts",
  "src/cli/arca-acquired-source-ingestion.ts",
];

test("governed ARCA ingestion remains acquisition-bound and production-isolated", async () => {
  const source = (
    await Promise.all(BOUNDARY_FILES.map((path) => readFile(path, "utf8")))
  ).join("\n");

  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bhttps?\.request\s*\(/);
  assert.doesNotMatch(source, /\bOpenAI\b|\bAnthropic\b|\bprompt\s*:/i);
  assert.doesNotMatch(source, /supabase|postgres|database\.write/i);
  assert.doesNotMatch(source, /scheduler|cron|setInterval/i);
  assert.doesNotMatch(source, /approved-artifact\.schema|ApprovedArtifact/);
  assert.doesNotMatch(source, /vlatam-global|vlatamGlobal/);
  assert.match(source, /record\.mode !== "replay" && record\.mode !== "live"/);
  assert.match(source, /review_state: "human_review_required"/);
  assert.match(source, /publication_status: "not_publishable"/);
});

test("CLI exposes no URL, prompt, live, or arbitrary raw-file argument", async () => {
  const source = await readFile(
    "src/cli/arca-acquired-source-ingestion.ts",
    "utf8",
  );
  const allowedArguments = [
    '"--contract"',
    '"--acquisition-root"',
    '"--candidate-root"',
  ];
  for (const argument of allowedArguments)
    assert.match(source, new RegExp(argument));
  assert.doesNotMatch(source, /"--url"|"--prompt"|"--raw-file"|"--live"/);
});
