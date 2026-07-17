import { readFileSync } from "node:fs";

import {
  buildGlmRedactedProviderRequest,
  validateGlmRedactedOperationInput,
} from "../src/providers/openrouter-glm-supervised-pilot.js";

const suppliedPath = process.argv[2];
if (!suppliedPath) {
  process.stderr.write(
    "Usage: npm run ai:glm:validate-redacted -- /explicit/path/to/redacted-operation.json\n",
  );
  process.exitCode = 2;
} else {
  const candidate: unknown = JSON.parse(readFileSync(suppliedPath, "utf8"));
  const reasons = validateGlmRedactedOperationInput(candidate);
  if (reasons.length > 0) {
    process.stderr.write(`Blocked: ${reasons.join(",")}\n`);
    process.exitCode = 1;
  } else {
    const request = buildGlmRedactedProviderRequest(candidate as never);
    process.stdout.write(
      `${JSON.stringify({ status: "validated_not_executed", request_id: request.request_id, transport_invoked: false })}\n`,
    );
  }
}
