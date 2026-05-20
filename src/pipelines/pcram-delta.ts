import path from "node:path";

import { nowIso } from "../lib/date.js";
import { listFiles, readUtf8File } from "../lib/fs.js";
import { writeMarkdownReport } from "../reports/write-markdown-report.js";

function formatList(items: string[]): string {
  if (items.length === 0) {
    return "- None";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

async function run(): Promise<void> {
  const snapshotsDir = path.resolve(process.cwd(), "snapshots");
  const reportsDir = path.resolve(process.cwd(), "reports");

  const snapshotFiles = (await listFiles(snapshotsDir)).filter((filePath) =>
    /pcram-(bulletin|ncm)-.*\.(md|txt|json)$/i.test(path.basename(filePath)),
  );

  const latest = snapshotFiles.at(-1);
  const previous = snapshotFiles.at(-2);

  let changed = false;
  let previousLength = 0;
  let currentLength = 0;
  let note =
    "Insufficient local snapshots for a content delta (need at least 2 files).";

  if (latest && previous) {
    const [latestContent, previousContent] = await Promise.all([
      readUtf8File(latest),
      readUtf8File(previous),
    ]);

    changed = latestContent !== previousContent;
    currentLength = latestContent.length;
    previousLength = previousContent.length;
    note = "Local-only comparison completed successfully.";
  }

  const reportPath = await writeMarkdownReport({
    title: "PCRAM Delta Report",
    fileNamePrefix: "pcram-delta",
    directory: reportsDir,
    sections: [
      {
        heading: "Metadata",
        body: `- Generated At: ${nowIso()}\n- Mode: local-only placeholder\n- Pipeline: src/pipelines/pcram-delta.ts`,
      },
      {
        heading: "Snapshot Inputs",
        body: formatList(
          snapshotFiles.map((filePath) => path.basename(filePath)),
        ),
      },
      {
        heading: "Delta Summary",
        body: `- Changed: ${changed}\n- Previous length: ${previousLength}\n- Current length: ${currentLength}\n- Character delta: ${currentLength - previousLength}`,
      },
      {
        heading: "Evidence Notes",
        body: `- ${note}\n- No network requests were performed.\n- Human review required before action.`,
      },
    ],
  });

  console.log(`Report written: ${reportPath}`);
}

run().catch((error) => {
  console.error("pcram-delta pipeline failed", error);
  process.exitCode = 1;
});
