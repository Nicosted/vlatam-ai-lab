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
