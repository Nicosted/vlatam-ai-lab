import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createOpenRouterEnvironmentSecretProvider } from "../src/providers/openrouter-secret-provider.js";
import {
  OPENROUTER_FIRST_RUN_FIXTURE_ID,
  runOpenRouterManualSandboxHarness,
} from "../src/providers/openrouter-sandbox-harness.js";
import type {
  OpenRouterRuntimeBindings,
  OpenRouterSandboxRuntimeConfig,
} from "../src/providers/openrouter-sandbox-preflight.js";

const { values } = parseArgs({
  strict: true,
  options: {
    fixture: { type: "string" },
    "preflight-only": { type: "boolean", default: false },
    "confirm-manual-sandbox-call": { type: "boolean", default: false },
    "operator-id": { type: "string", default: "local.operator.pending" },
    "proposal-hash": { type: "string" },
    "dossier-hash": { type: "string" },
    "evidence-pack-hash": { type: "string" },
    "profile-hash": { type: "string" },
    "route-hash": { type: "string" },
    "model-hash": { type: "string" },
    "exact-policy-hash": { type: "string" },
  },
});

if (values.fixture !== OPENROUTER_FIRST_RUN_FIXTURE_ID)
  throw new Error("Only the approved repository fixture may be used.");
const config = JSON.parse(
  readFileSync("config/ai-openrouter-sandbox-runtime.json", "utf8"),
) as OpenRouterSandboxRuntimeConfig;
const supplied: OpenRouterRuntimeBindings = {
  proposal_hash: values["proposal-hash"] ?? config.bindings.proposal_hash,
  dossier_hash: values["dossier-hash"] ?? config.bindings.dossier_hash,
  evidence_pack_hash:
    values["evidence-pack-hash"] ?? config.bindings.evidence_pack_hash,
  profile_hash: values["profile-hash"] ?? config.bindings.profile_hash,
  route_hash: values["route-hash"] ?? config.bindings.route_hash,
  model_hash: values["model-hash"] ?? config.bindings.model_hash,
  exact_policy_hash:
    values["exact-policy-hash"] ?? config.bindings.exact_policy_hash,
};

const result = await runOpenRouterManualSandboxHarness({
  config,
  expected_bindings: config.bindings,
  supplied_hashes: supplied,
  kill_switch: {
    evaluate: (reference) => ({ reference, active: true }),
  },
  budget: { available: () => false },
  secret_provider: createOpenRouterEnvironmentSecretProvider(),
  executor: {
    executeFixture: async () => {
      throw new Error("repository_live_executor_not_configured");
    },
  },
  fixture_id: values.fixture,
  confirmation: values["confirm-manual-sandbox-call"],
  preflight_only: values["preflight-only"],
  now: new Date(),
  operator_id: values["operator-id"],
  on_preflight: (preflight) => {
    process.stdout.write(
      `${JSON.stringify({ event: "preflight", ...preflight })}\n`,
    );
  },
});
process.stdout.write(
  `${JSON.stringify({
    status: result.status,
    preflight_outcome: result.preflight.outcome,
    consumption_result: result.consumption_result,
    adapter_outcome: result.adapter_outcome,
    http_status_category: result.http_status_category,
    reported_input_tokens: result.reported_input_tokens,
    reported_output_tokens: result.reported_output_tokens,
    reported_cost_usd: result.reported_cost_usd,
  })}\n`,
);
