import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import {
  defaultBriefingPath,
  evaluateBriefingQuality,
  renderBriefingQualityGateReport,
  runBriefingQualityGate,
} from "../src/reports/briefing-quality-gate.js";

function normalizeMarkdownText(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

async function readCurrentBriefing(): Promise<string> {
  return readUtf8File(path.resolve(process.cwd(), defaultBriefingPath));
}

test("briefing quality gate reads the generated briefing locally and passes", async () => {
  const outputDir = await mkdtemp(
    path.join(tmpdir(), "briefing-quality-gate-"),
  );
  const outputPath = path.join(outputDir, "quality-gate.md");
  const result = await runBriefingQualityGate(defaultBriefingPath, outputPath);

  assert.equal(path.isAbsolute(defaultBriefingPath), false);
  assert.equal(
    defaultBriefingPath,
    "reports/operational-briefing-preview-p1.md",
  );
  assert.equal(result.sourceBriefingPath, defaultBriefingPath);
  assert.equal(result.result, "pass");
  assert.equal(result.failedChecks, 0);

  const report = await readUtf8File(outputPath);
  assert.equal(report.includes("# Briefing Quality Gate P1"), true);
});

test("briefing quality gate enforces required sections", async () => {
  const markdown = await readCurrentBriefing();
  const result = evaluateBriefingQuality(
    markdown.replace("## Executive Signal", "## Signal Summary"),
  );

  const failedCheck = result.checks.find(
    (check) => check.check_id === "required-section-executive-signal",
  );

  assert.equal(result.result, "fail");
  assert.equal(failedCheck?.status, "fail");
});

test("briefing quality gate fails when Evidence & Traceability is missing", async () => {
  const markdown = await readCurrentBriefing();
  const result = evaluateBriefingQuality(
    markdown.replace("## Evidence & Traceability", "## Source References"),
  );

  const failedCheck = result.checks.find(
    (check) => check.check_id === "required-section-evidence-traceability",
  );

  assert.equal(result.result, "fail");
  assert.equal(failedCheck?.status, "fail");
});

test("briefing quality gate fails when final-determination boundary is missing", async () => {
  const markdown = await readCurrentBriefing();
  const result = evaluateBriefingQuality(
    markdown.replace(
      "not a final legal or customs determination",
      "decision support for operator review",
    ),
  );

  const failedCheck = result.checks.find(
    (check) => check.check_id === "no-final-determination",
  );

  assert.equal(result.result, "fail");
  assert.equal(failedCheck?.status, "fail");
});

test("briefing quality gate fails raw JSON-looking content", async () => {
  const markdown = await readCurrentBriefing();
  const result = evaluateBriefingQuality(
    `${markdown}\n\n\`\`\`json\n{"schema_version":"1.0.0"}\n\`\`\`\n`,
  );

  const failedCheck = result.checks.find(
    (check) => check.check_id === "no-raw-json-dumps",
  );

  assert.equal(result.result, "fail");
  assert.equal(failedCheck?.status, "fail");
});

test("briefing quality gate fails when Recommended Next Actions is missing", async () => {
  const markdown = await readCurrentBriefing();
  const result = evaluateBriefingQuality(
    markdown.replace("## Recommended Next Actions", "## Review Checklist"),
  );

  const requiredSectionCheck = result.checks.find(
    (check) => check.check_id === "required-section-recommended-next-actions",
  );
  const actionCheck = result.checks.find(
    (check) => check.check_id === "recommended-actions-present",
  );

  assert.equal(result.result, "fail");
  assert.equal(requiredSectionCheck?.status, "fail");
  assert.equal(actionCheck?.status, "fail");
});

test("briefing quality gate report includes PASS or FAIL result", async () => {
  const markdown = await readCurrentBriefing();
  const passResult = evaluateBriefingQuality(markdown);
  const failResult = evaluateBriefingQuality(
    markdown.replace("## Briefing Quality Bar", "## Quality Notes"),
  );
  const passReport = normalizeMarkdownText(
    renderBriefingQualityGateReport(passResult),
  );
  const failReport = normalizeMarkdownText(
    renderBriefingQualityGateReport(failResult),
  );

  assert.equal(passReport.includes("Quality gate result:** PASS"), true);
  assert.equal(failReport.includes("Quality gate result:** FAIL"), true);
});

test("briefing quality gate report rendering is deterministic", async () => {
  const markdown = await readCurrentBriefing();
  const result = evaluateBriefingQuality(markdown);
  const first = renderBriefingQualityGateReport(result);
  const second = renderBriefingQualityGateReport(result);

  assert.equal(first, second);
});

test("briefing quality gate renderer avoids network, env, Supabase client, production, and runtime APIs", async () => {
  const source = await readUtf8File(
    path.resolve(process.cwd(), "src/reports/briefing-quality-gate.ts"),
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
