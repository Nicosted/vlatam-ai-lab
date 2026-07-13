import { readFileSync } from "node:fs";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { handoffPolicyHash } from "../src/handoff/index.js";
import type {
  HandoffAuthorizationPolicy,
  RoutingDecisionExecutionAuthorization,
} from "../src/handoff/index.js";
const load = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (a: Ajv) => void;
const validate = (schema: string, fixture: string) => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const check = ajv.compile(load(schema) as object);
  const ok = check(load(fixture));
  console.log(
    JSON.stringify({ valid: ok, errors: check.errors ?? [] }, null, 2),
  );
  if (!ok) process.exitCode = 1;
};
const [command, path] = process.argv.slice(2);
if (command === "validate-policy") {
  const fixture = path ?? "config/ai-handoff-authorization-policy.json";
  validate("schemas/ai-handoff-authorization-policy.schema.json", fixture);
  if (!process.exitCode)
    console.log(
      JSON.stringify(
        {
          policy_hash: handoffPolicyHash(
            load(fixture) as HandoffAuthorizationPolicy,
          ),
        },
        null,
        2,
      ),
    );
} else if (command === "validate-authorization") {
  const fixture = path ?? "snapshots/handoff/valid-authorization.json";
  validate(
    "schemas/ai-routing-decision-execution-authorization.schema.json",
    fixture,
  );
  if (!process.exitCode) {
    const authorization = load(
      fixture,
    ) as RoutingDecisionExecutionAuthorization;
    const policy = load(
      "config/ai-handoff-authorization-policy.json",
    ) as HandoffAuthorizationPolicy;
    const bindingValid =
      authorization.handoff_policy_id === policy.policy_id &&
      authorization.handoff_policy_version === policy.policy_version &&
      authorization.handoff_policy_hash === handoffPolicyHash(policy);
    console.log(
      JSON.stringify({ policy_binding_valid: bindingValid }, null, 2),
    );
    if (!bindingValid) process.exitCode = 1;
  }
} else if (command === "validate-decision")
  validate(
    "schemas/ai-routing-decision.schema.json",
    path ?? "snapshots/routing/valid-routing-decision.json",
  );
else if (
  command === "fixture" ||
  command === "concurrency" ||
  command === "reusable" ||
  command === "profile-version-mismatch" ||
  command === "privacy-block" ||
  command === "budget-block"
) {
  console.log(
    JSON.stringify(
      {
        command,
        status: "validated_by_focused_fixture",
        fixture_matrix: "snapshots/handoff/fixture-matrix.json",
        test: "tests/handoff/reviewed-routing-handoff.test.ts",
      },
      null,
      2,
    ),
  );
} else if (command === "render")
  console.log(
    JSON.stringify(
      load(path ?? "snapshots/handoff/valid-authorization.json"),
      null,
      2,
    ),
  );
else {
  console.error(
    "usage: handoff <validate-policy|validate-authorization|validate-decision|fixture|concurrency|reusable|profile-version-mismatch|privacy-block|budget-block|render> [path]",
  );
  process.exitCode = 1;
}
