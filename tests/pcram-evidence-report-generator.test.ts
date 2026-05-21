import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readUtf8File } from "../src/lib/fs.js";
import { renderPcramEvidenceReport } from "../src/pcram/render-evidence-report.js";

const FIXED_GENERATED_AT = "2026-05-21T10:40:00.000Z";

interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function runProcess(
  command: string,
  args: string[],
  cwd: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function readJsonFixture(
  relativePath: string,
): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as Record<string, unknown>;
}

test("renders markdown report from valid fixtures", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );
  const delta = await readJsonFixture("snapshots/pcram/example-delta.json");

  const report = renderPcramEvidenceReport({
    previousSnapshot: previous,
    currentSnapshot: current,
    delta,
    generatedAt: FIXED_GENERATED_AT,
  });

  assert.equal(report.startsWith("# PCRAM Evidence Report\n"), true);
  assert.equal(
    report.includes(`- Generated At: \`${FIXED_GENERATED_AT}\``),
    true,
  );
  assert.equal(report.includes("## Assumptions / Limitations"), true);
});

test("report includes previous/current snapshot identifiers", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );
  const delta = await readJsonFixture("snapshots/pcram/example-delta.json");

  const report = renderPcramEvidenceReport({
    previousSnapshot: previous,
    currentSnapshot: current,
    delta,
    generatedAt: FIXED_GENERATED_AT,
  });

  assert.equal(
    report.includes(
      "- Previous Snapshot ID: `snapshot-pcram-bulletin-2026-05-13t120000z`",
    ),
    true,
  );
  assert.equal(
    report.includes(
      "- Current Snapshot ID: `snapshot-pcram-bulletin-2026-05-20t120000z`",
    ),
    true,
  );
});

test("report includes delta id, change type, and risk level", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );
  const delta = await readJsonFixture("snapshots/pcram/example-delta.json");

  const report = renderPcramEvidenceReport({
    previousSnapshot: previous,
    currentSnapshot: current,
    delta,
    generatedAt: FIXED_GENERATED_AT,
  });

  assert.equal(
    report.includes(
      "- Delta ID: `delta-pcram-bulletin-snapshot-pcram-bulletin-2026-05-13t120000z-to-snapshot-pcram-bulletin-2026-05-20t120000z-content-changed`",
    ),
    true,
  );
  assert.equal(report.includes("- Change Type: `modified`"), true);
  assert.equal(report.includes("- Risk Level: `medium`"), true);
});

test("report includes human review requirement", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );
  const delta = await readJsonFixture("snapshots/pcram/example-delta.json");

  const report = renderPcramEvidenceReport({
    previousSnapshot: previous,
    currentSnapshot: current,
    delta,
    generatedAt: FIXED_GENERATED_AT,
  });

  assert.equal(report.includes("- Requires Human Review: `true`"), true);
});

test("renderer is local-only and does not require network or env access", async () => {
  const source = await readUtf8File(
    path.resolve(process.cwd(), "src/pcram/render-evidence-report.ts"),
  );

  assert.equal(source.includes("process.env"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("http://"), false);
  assert.equal(source.includes("https://"), false);
});

test("CLI generates evidence report end-to-end", async () => {
  const temporaryReportPath = path.join(
    os.tmpdir(),
    `pcram-evidence-cli-${process.pid}-${Date.now()}.md`,
  );
  const tsxCliPath = path.resolve(
    process.cwd(),
    "node_modules",
    "tsx",
    "dist",
    "cli.mjs",
  );

  try {
    const result = await runProcess(
      process.execPath,
      [
        tsxCliPath,
        "src/pipelines/generate-pcram-evidence-report.ts",
        "snapshots/pcram/example-source-snapshot-previous.json",
        "snapshots/pcram/example-source-snapshot-current.json",
        "snapshots/pcram/example-delta.json",
        temporaryReportPath,
      ],
      process.cwd(),
    );

    assert.equal(
      result.exitCode,
      0,
      `Expected CLI to exit successfully. stderr:\n${result.stderr}\nstdout:\n${result.stdout}`,
    );

    await access(temporaryReportPath);
    const markdown = await readFile(temporaryReportPath, "utf8");

    assert.equal(markdown.includes("# PCRAM Evidence Report"), true);
    assert.equal(
      markdown.includes(
        "- Previous Snapshot ID: `snapshot-pcram-bulletin-2026-05-13t120000z`",
      ),
      true,
    );
    assert.equal(
      markdown.includes(
        "- Current Snapshot ID: `snapshot-pcram-bulletin-2026-05-20t120000z`",
      ),
      true,
    );
    assert.equal(
      markdown.includes(
        "- Delta ID: `delta-pcram-bulletin-snapshot-pcram-bulletin-2026-05-13t120000z-to-snapshot-pcram-bulletin-2026-05-20t120000z-content-changed`",
      ),
      true,
    );
    assert.equal(markdown.includes("- Change Type: `modified`"), true);
    assert.equal(markdown.includes("- Requires Human Review: `true`"), true);
  } finally {
    await rm(temporaryReportPath, { force: true });
  }
});
