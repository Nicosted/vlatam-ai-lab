import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  BUDGET_LEDGER_SCHEMA_VERSION,
  SqliteBudgetLedger,
  type BudgetReservationBinding,
  type BudgetPolicy,
} from "../src/governance/index.js";

const [command, databasePath, workerId] = process.argv.slice(2);
if (!databasePath)
  throw new Error("an explicit local database path is required");
const policy: BudgetPolicy = {
  policy_id: "policy.cross-process",
  schema_version: "1.0.0",
  priority: 1,
  capability_id: "capability.test",
  execution_mode: "replay",
  request_classification: "*",
  environment_id: "local",
  project_id: "vlatam-ai-lab",
  tenant_id: "sandbox",
  scope_id: "scope.cross-process",
  currency: "USD",
  require_usage: false,
  require_verified_pricing: true,
  behavior: "hard_block",
  max_estimated_tokens_per_request: 10,
  max_actual_tokens_per_request: 20,
  max_estimated_cost_minor_per_request: 10,
  max_actual_cost_minor_per_request: 20,
  rolling_request_limit: 1,
  rolling_token_limit: 10,
  rolling_cost_minor_limit: 10,
  rolling_window_seconds: 3600,
  reservation_ttl_seconds: 300,
};
const binding = (id: string): BudgetReservationBinding => ({
  execution_id: `execution.${id}`,
  request_id: `request.${id}`,
  capability_id: policy.capability_id,
  profile_id: "profile.test",
  profile_version: "1.0.0",
  budget_policy_id: policy.policy_id,
  budget_policy_version: policy.schema_version,
  pricing_id: "pricing.test",
  pricing_evidence_id: "repo:test-fixture",
  pricing_evidence_hash: "a".repeat(64),
  scope_id: policy.scope_id,
  currency: policy.currency,
  estimated_input_tokens: 2,
  estimated_output_tokens: 2,
  estimated_cost_minor: 4n,
  reserved_cost_minor: 4n,
  schema_version: BUDGET_LEDGER_SCHEMA_VERSION,
});
const waitFor = async (path: string, timeoutMs = 5000) => {
  const end = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= end) throw new Error("budget fixture barrier timeout");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

if (command === "internal-worker") {
  const id = workerId ?? "missing";
  writeFileSync(`${databasePath}.${id}.ready`, "ready", { flag: "wx" });
  await waitFor(`${databasePath}.barrier`);
  const store = new SqliteBudgetLedger({ databasePath, busyTimeoutMs: 2000 });
  let result: string;
  try {
    store.reserve(binding(id), policy, new Date("2026-07-13T12:00:00.000Z"));
    result = "reserved";
  } catch (error) {
    result =
      error instanceof Error && "code" in error ? String(error.code) : "error";
  } finally {
    store.close();
  }
  writeFileSync(
    `${databasePath}.${id}.result`,
    JSON.stringify({ id, result }),
    { flag: "wx" },
  );
} else if (command === "concurrency-fixture") {
  const initialized = new SqliteBudgetLedger({ databasePath });
  initialized.initialize();
  initialized.close();
  const children = ["one", "two"].map((id) =>
    spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/budget-ledger.ts",
        "internal-worker",
        databasePath,
        id,
      ],
      {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
      },
    ),
  );
  await Promise.all(
    ["one", "two"].map((id) => waitFor(`${databasePath}.${id}.ready`)),
  );
  writeFileSync(`${databasePath}.barrier`, "go", { flag: "wx" });
  const exits = await Promise.all(
    children.map(
      (child) =>
        new Promise<{ code: number | null; stderr: string }>((resolve) => {
          let stderr = "";
          child.stderr.on("data", (chunk) => (stderr += String(chunk)));
          child.on("exit", (code) => resolve({ code, stderr }));
        }),
    ),
  );
  if (exits.some(({ code }) => code !== 0))
    throw new Error(JSON.stringify(exits));
  const results = ["one", "two"].map((id) =>
    JSON.parse(readFileSync(`${databasePath}.${id}.result`, "utf8")),
  );
  const store = new SqliteBudgetLedger({ databasePath });
  const listed = store.listRecent();
  store.close();
  console.log(
    JSON.stringify({ results, listed }, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
  );
} else {
  throw new Error("unknown budget-ledger command");
}
