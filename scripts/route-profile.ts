import { readFileSync } from "node:fs";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  BestProfilePolicyRouter,
  type ProfileSelectionPolicy,
  type ReviewedBenchmarkEvidenceReference,
  type RoutingRequest,
} from "../src/routing/index.js";
import type { CampaignResult } from "../src/benchmark/index.js";

const load = <T>(path: string): T =>
  JSON.parse(readFileSync(path, "utf8")) as T;
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (ajv: Ajv) => void;
const validate = (schemaPath: string, dataPath: string) => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const check = ajv.compile(load(schemaPath));
  const value = load(dataPath);
  if (!check(value)) throw new Error(ajv.errorsText(check.errors));
  return value;
};
function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "validate-policy") {
    validate("schemas/ai-profile-selection-policy.schema.json", args[0]!);
    console.log(
      JSON.stringify({ valid: true, type: "profile-selection-policy" }),
    );
    return;
  }
  if (command === "validate-evidence") {
    validate("schemas/ai-reviewed-benchmark-evidence.schema.json", args[0]!);
    console.log(
      JSON.stringify({ valid: true, type: "reviewed-benchmark-evidence" }),
    );
    return;
  }
  if (command === "render") {
    console.log(JSON.stringify(load(args[0]!), null, 2));
    return;
  }
  if (command !== "decide")
    throw new Error(
      "usage: route-profile <validate-policy|validate-evidence|decide|render> ...",
    );
  const [policyPath, evidencePath, resultPath, requestPath] = args;
  const input = {
    policy: validate(
      "schemas/ai-profile-selection-policy.schema.json",
      policyPath!,
    ) as ProfileSelectionPolicy,
    evidence: validate(
      "schemas/ai-reviewed-benchmark-evidence.schema.json",
      evidencePath!,
    ) as ReviewedBenchmarkEvidenceReference,
    campaign_result: load<CampaignResult>(resultPath!),
    request: validate(
      "schemas/ai-routing-request.schema.json",
      requestPath!,
    ) as RoutingRequest,
  };
  console.log(
    JSON.stringify(new BestProfilePolicyRouter().route(input), null, 2),
  );
}
try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "routing failed");
  process.exitCode = 1;
}
