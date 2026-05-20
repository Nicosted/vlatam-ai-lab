import path from "node:path";

import { timestampForFilename } from "../lib/date.js";
import { readUtf8File, writeUtf8File } from "../lib/fs.js";
import { generatePcramDelta } from "../pcram/generate-delta.js";

function usage(): void {
  console.error(
    "Usage: tsx src/pipelines/generate-pcram-delta.ts <previous-snapshot-path> <current-snapshot-path> [output-path]",
  );
}

async function parseJsonFile(filePath: string): Promise<unknown> {
  const content = await readUtf8File(filePath);
  return JSON.parse(content) as unknown;
}

async function run(): Promise<void> {
  const previousPathArg = process.argv[2];
  const currentPathArg = process.argv[3];
  const outputPathArg = process.argv[4];

  if (!previousPathArg || !currentPathArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const previousPath = path.resolve(process.cwd(), previousPathArg);
  const currentPath = path.resolve(process.cwd(), currentPathArg);

  let previousSnapshot: unknown;
  let currentSnapshot: unknown;

  try {
    [previousSnapshot, currentSnapshot] = await Promise.all([
      parseJsonFile(previousPath),
      parseJsonFile(currentPath),
    ]);
  } catch (error) {
    console.error("Could not parse one or both snapshot files as JSON.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const result = generatePcramDelta(previousSnapshot, currentSnapshot);
  if (!result.ok) {
    console.error("PCRAM delta generation failed due to validation errors:");
    for (const validationError of result.errors) {
      console.error(`- ${validationError}`);
    }
    process.exitCode = 1;
    return;
  }

  const outputPath = outputPathArg
    ? path.resolve(process.cwd(), outputPathArg)
    : path.resolve(
        process.cwd(),
        "reports",
        `pcram-delta-${timestampForFilename()}.json`,
      );

  const artifact = {
    ...result.delta,
    evidence_paths: [previousPathArg, currentPathArg],
  };

  await writeUtf8File(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);

  console.log(`PCRAM delta generated successfully: ${outputPath}`);
  console.log(`Change classification: ${result.changeClassification}`);
}

run().catch((error) => {
  console.error("Delta pipeline failed", error);
  process.exitCode = 1;
});
