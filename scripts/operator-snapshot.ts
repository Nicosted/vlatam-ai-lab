import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../src/operator/repository-operator-read-model.js";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const repositoryRoot = resolve(
  argument("--repository-root") ?? resolve(import.meta.dirname, ".."),
);
const readModel = await loadRepositoryOperatorReadModel({
  repository_root: repositoryRoot,
  evaluated_at: argument("--evaluated-at") ?? REPOSITORY_OPERATOR_EVALUATED_AT,
});
const serialized = `${JSON.stringify(readModel, null, 2)}\n`;
const output = argument("--output");
if (output)
  writeFileSync(resolve(output), serialized, { encoding: "utf8", flag: "wx" });
else process.stdout.write(serialized);

if (readModel.system_summary.overall_status === "invalid_state")
  process.exitCode = 1;
