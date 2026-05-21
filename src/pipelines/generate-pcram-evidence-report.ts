import path from "node:path";

import { timestampForFilename } from "../lib/date.js";
import { readUtf8File, writeUtf8File } from "../lib/fs.js";
import { renderPcramEvidenceReport } from "../pcram/render-evidence-report.js";

function usage(): void {
  console.error(
    "Usage: tsx src/pipelines/generate-pcram-evidence-report.ts <previous-snapshot-path> <current-snapshot-path> <delta-path> [output-markdown-path]",
  );
}

async function parseJsonFile(filePath: string): Promise<unknown> {
  const content = await readUtf8File(filePath);
  return JSON.parse(content) as unknown;
}

async function run(): Promise<void> {
  const previousPathArg = process.argv[2];
  const currentPathArg = process.argv[3];
  const deltaPathArg = process.argv[4];
  const outputPathArg = process.argv[5];

  if (!previousPathArg || !currentPathArg || !deltaPathArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const previousPath = path.resolve(process.cwd(), previousPathArg);
  const currentPath = path.resolve(process.cwd(), currentPathArg);
  const deltaPath = path.resolve(process.cwd(), deltaPathArg);

  let previousSnapshot: unknown;
  let currentSnapshot: unknown;
  let delta: unknown;

  try {
    [previousSnapshot, currentSnapshot, delta] = await Promise.all([
      parseJsonFile(previousPath),
      parseJsonFile(currentPath),
      parseJsonFile(deltaPath),
    ]);
  } catch (error) {
    console.error("Could not parse one or more input files as JSON.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  let markdown: string;
  try {
    markdown = renderPcramEvidenceReport({
      previousSnapshot,
      currentSnapshot,
      delta,
    });
  } catch (error) {
    console.error("PCRAM evidence report generation failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const outputPath = outputPathArg
    ? path.resolve(process.cwd(), outputPathArg)
    : path.resolve(
        process.cwd(),
        "reports",
        `pcram-evidence-${timestampForFilename()}.md`,
      );

  await writeUtf8File(outputPath, `${markdown.trimEnd()}\n`);

  console.log(`PCRAM evidence report generated successfully: ${outputPath}`);
}

run().catch((error) => {
  console.error("Evidence report pipeline failed", error);
  process.exitCode = 1;
});
