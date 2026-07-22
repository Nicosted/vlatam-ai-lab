import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  DURABLE_ARCA_STORE_COMMAND_VERSION,
  executeDurableArcaStoreCommand,
  type DurableArcaStoreCommand,
  type DurableArcaStoreOperation,
} from "../store/durable-arca-review-store.js";

const FALSE_AUTHORITIES = {
  export_authorized: false,
  publication_authorized: false,
  production_authorized: false,
  network_authorized: false,
  database_authorized: false,
  scheduler_authorized: false,
  deployment_authorized: false,
  vlatam_global_access_authorized: false,
} as const;

function usage(): never {
  throw new Error(
    "Usage: durable-arca-store <record-candidate|record-review|record-evaluation|record-approved-artifact|rebuild-projection|verify-store> --store-root <path> --actor <identity> --timestamp <canonical-utc> [--record <governed-json> | --candidate-id <id>]",
  );
}

function parseArgs(argv: readonly string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--"))
      usage();
    if (args.has(key)) throw new Error(`Duplicate argument: ${key}`);
    if (/^(?:https?|file):\/\//i.test(value))
      throw new Error("URLs are not accepted by the durable store CLI");
    args.set(key, value);
  }
  return args;
}

const OPERATION_BY_COMMAND: Readonly<
  Record<string, DurableArcaStoreOperation>
> = {
  "record-candidate": "record_candidate",
  "record-review": "record_review",
  "record-evaluation": "record_evaluation",
  "record-approved-artifact": "record_approved_artifact",
  "rebuild-projection": "rebuild_projection",
  "verify-store": "verify_store",
};

async function main(): Promise<void> {
  const [subcommand, ...rest] = process.argv.slice(2);
  const operation = subcommand ? OPERATION_BY_COMMAND[subcommand] : undefined;
  if (!operation) usage();
  const args = parseArgs(rest);
  const allowed = new Set([
    "--store-root",
    "--actor",
    "--timestamp",
    "--record",
    "--candidate-id",
  ]);
  for (const key of args.keys())
    if (!allowed.has(key)) throw new Error(`Unsupported argument: ${key}`);
  const storeRoot = args.get("--store-root");
  const actor = args.get("--actor");
  const timestamp = args.get("--timestamp");
  if (!storeRoot || !actor || !timestamp) usage();
  const recordPath = args.get("--record");
  const candidateId = args.get("--candidate-id") ?? null;
  const isRecord = operation.startsWith("record_");
  if ((isRecord && (!recordPath || candidateId)) || (!isRecord && recordPath))
    usage();
  if (operation === "rebuild_projection" && !candidateId) usage();
  if (operation === "verify_store" && candidateId) usage();
  const governedRecord = recordPath
    ? (JSON.parse(await readFile(resolve(recordPath), "utf8")) as unknown)
    : null;
  const command: DurableArcaStoreCommand = {
    schema_version: DURABLE_ARCA_STORE_COMMAND_VERSION,
    operation,
    actor_identity: actor,
    event_timestamp: timestamp,
    candidate_id: candidateId,
    governed_record: governedRecord,
    ...FALSE_AUTHORITIES,
  };
  const output = await executeDurableArcaStoreCommand(
    resolve(storeRoot),
    command,
  );
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.success) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
