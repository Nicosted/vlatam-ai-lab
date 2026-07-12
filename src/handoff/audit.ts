import type { HandoffAuditEvent } from "./contracts.js";
const FORBIDDEN =
  /(prompt|payload|provider_response|credential|secret|personal|email|customer|raw|sensitive|context)/i;
export const assertHandoffAuditMetadataOnly = (
  event: HandoffAuditEvent,
): readonly string[] =>
  Object.keys(event)
    .filter((key) => FORBIDDEN.test(key))
    .map((key) => `forbidden field: ${key}`);
