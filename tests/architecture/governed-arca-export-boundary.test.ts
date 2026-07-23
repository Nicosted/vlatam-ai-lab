import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI-132 imports only approved artifact, durable store, review hash and local helpers", async () => {
  const source = await readFile("src/export/governed-arca-export.ts", "utf8");
  for (const prohibited of [
    "/acquisition/",
    "openai",
    "@anthropic",
    "fetch(",
    "http/client",
    "supabase",
    "vlatam-global-bridge",
    "prepareApprovedArcaArtifact",
    "evaluateGovernedArcaCandidateReview",
  ])
    assert.equal(source.includes(prohibited), false, prohibited);
  assert.match(source, /validateApprovedArcaArtifact/);
  assert.match(source, /readVerifiedDurableArcaExportSource/);
  assert.match(source, /external_network_transfer_performed: false/);
});

test("AI-132 recovery preserves exact consumption and kill-switch authority", async () => {
  const source = await readFile("src/export/governed-arca-export.ts", "utf8");
  const cli = await readFile("src/cli/governed-arca-export.ts", "utf8");

  assert.match(source, /consumption_relative_path/);
  assert.match(source, /consumption_bytes_sha256/);
  assert.match(source, /rereadExactReviewedDisabledSwitch/);
  assert.match(source, /kill_switch_sha256/);
  assert.match(cli, /--recover-journal/);
  assert.match(cli, /--kill-switch/);
  assert.equal(cli.includes("--bypass"), false);
  assert.equal(cli.includes("--force"), false);
});
