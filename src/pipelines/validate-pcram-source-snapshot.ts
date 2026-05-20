import path from "node:path";

import { readUtf8File } from "../lib/fs.js";
import { validatePcramSourceSnapshot } from "../pcram/validate-source-snapshot.js";

function usage(): void {
  console.error(
    "Usage: tsx src/pipelines/validate-pcram-source-snapshot.ts <snapshot-json-path>",
  );
}

async function run(): Promise<void> {
  const inputPath = process.argv[2];

  if (!inputPath) {
    usage();
    process.exitCode = 1;
    return;
  }

  const absolutePath = path.resolve(process.cwd(), inputPath);

  let parsed: unknown;
  try {
    const content = await readUtf8File(absolutePath);
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    console.error(`Invalid JSON input file: ${inputPath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const result = validatePcramSourceSnapshot(parsed);
  if (result.ok) {
    console.log(`PCRAM snapshot is valid: ${inputPath}`);
    return;
  }

  console.error(`PCRAM snapshot is invalid: ${inputPath}`);
  for (const validationError of result.errors) {
    console.error(`- ${validationError}`);
  }
  process.exitCode = 1;
}

run().catch((error) => {
  console.error("Snapshot validation pipeline failed", error);
  process.exitCode = 1;
});
