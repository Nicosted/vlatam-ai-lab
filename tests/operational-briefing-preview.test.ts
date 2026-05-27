import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import {
  briefingInputPaths,
  buildOperationalBriefingModel,
  readOperationalBriefingInputs,
  renderOperationalBriefingPreview,
} from "../src/reports/operational-briefing-preview.js";

const forbiddenPathPattern =
  /(^|[/\\])\.env|https?:\/\/|supabase\.(co|com)|production\.(local|com|net)|secret|credentials/i;

function normalizeMarkdownText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

test("operational briefing reads only expected local fixture and registry paths", async () => {
  const paths = Object.values(briefingInputPaths);

  assert.deepEqual(paths, [
    "schemas/schema-registry.json",
    "snapshots/pcram/example-approved-kb-snapshot.json",
    "snapshots/pcram/example-relevance-assessment.json",
    "snapshots/pcram/example-jurisdiction-pack.json",
    "snapshots/pcram/example-approved-artifact.json",
    "snapshots/pcram/example-evidence-report-metadata.json",
    "snapshots/pcram/example-broker-profile.json",
  ]);

  for (const inputPath of paths) {
    assert.equal(path.isAbsolute(inputPath), false);
    assert.equal(
      forbiddenPathPattern.test(inputPath),
      false,
      `Forbidden local input path: ${inputPath}`,
    );
  }

  const inputs = await readOperationalBriefingInputs();
  assert.equal(Array.isArray(inputs.registry["contracts"]), true);
});

test("operational briefing markdown includes product-facing sections", async () => {
  const inputs = await readOperationalBriefingInputs();
  const model = buildOperationalBriefingModel(inputs);
  const markdown = renderOperationalBriefingPreview(model);

  assert.equal(
    markdown.includes("# Operational Intelligence Briefing Preview"),
    true,
  );
  assert.equal(markdown.includes("## Executive Signal"), true);
  assert.equal(markdown.includes("## Decision Workspace Snapshot"), true);
  assert.equal(markdown.includes("## Evidence & Traceability"), true);
  assert.equal(markdown.includes("## Risk, Uncertainty & Limits"), true);
  assert.equal(markdown.includes("## Recommended Next Actions"), true);
  assert.equal(markdown.includes("## Human Review & Downstream Use"), true);
  assert.equal(markdown.includes("## Briefing Quality Bar"), true);
});

test("operational briefing includes local-only and legal-boundary language", async () => {
  const inputs = await readOperationalBriefingInputs();
  const model = buildOperationalBriefingModel(inputs);
  const markdown = renderOperationalBriefingPreview(model);
  const normalized = normalizeMarkdownText(markdown);

  assert.equal(normalized.includes("repository fixtures only"), true);
  assert.equal(normalized.includes("no production systems"), true);
  assert.equal(normalized.includes("external services"), true);
  assert.equal(normalized.includes("network access"), true);
  assert.equal(
    normalized.includes("not a final legal or customs determination"),
    true,
  );
});

test("operational briefing separates evidence from inference", async () => {
  const inputs = await readOperationalBriefingInputs();
  const model = buildOperationalBriefingModel(inputs);
  const markdown = renderOperationalBriefingPreview(model);
  const normalized = normalizeMarkdownText(markdown);

  assert.equal(normalized.includes("AI-Inferred"), true);
  assert.equal(normalized.includes("Human-Reviewed Evidence"), true);
  assert.equal(normalized.includes("Evidence boundary"), true);
  assert.equal(
    normalized.includes("review-manifest-pcram-delta-2026-05-20"),
    true,
  );
  assert.equal(
    normalized.includes("approved-artifact-pcram-delta-2026-05-20"),
    true,
  );
});

test("operational briefing avoids raw JSON dumps", async () => {
  const inputs = await readOperationalBriefingInputs();
  const model = buildOperationalBriefingModel(inputs);
  const markdown = renderOperationalBriefingPreview(model);

  assert.equal(markdown.includes("```json"), false);
  assert.equal(markdown.includes('"schema_version"'), false);
  assert.equal(markdown.includes('{"'), false);
  assert.equal(markdown.includes("not raw schema output"), true);
});

test("operational briefing rendering is deterministic for the same inputs", async () => {
  const inputs = await readOperationalBriefingInputs();
  const model = buildOperationalBriefingModel(inputs);
  const first = renderOperationalBriefingPreview(model);
  const second = renderOperationalBriefingPreview(model);

  assert.equal(first, second);
});

test("operational briefing renderer avoids network, env, Supabase, production, and runtime APIs", async () => {
  const source = await readUtf8File(
    path.resolve(process.cwd(), "src/reports/operational-briefing-preview.ts"),
  );

  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("node:http"), false);
  assert.equal(source.includes("node:https"), false);
  assert.equal(source.includes("http.request"), false);
  assert.equal(source.includes("https.request"), false);
  assert.equal(source.includes("@supabase/"), false);
  assert.equal(source.includes("createClient"), false);
  assert.equal(source.includes("api/"), false);
});
