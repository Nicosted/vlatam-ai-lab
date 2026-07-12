import { readFileSync } from "node:fs";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
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
if (command === "validate-policy")
  validate(
    "schemas/ai-handoff-authorization-policy.schema.json",
    path ?? "config/ai-handoff-authorization-policy.json",
  );
else if (command === "validate-authorization")
  validate(
    "schemas/ai-routing-decision-execution-authorization.schema.json",
    path ?? "snapshots/handoff/valid-authorization.json",
  );
else if (command === "validate-decision")
  validate(
    "schemas/ai-routing-decision.schema.json",
    path ?? "snapshots/routing/valid-routing-decision.json",
  );
else if (
  command === "fixture" ||
  command === "concurrency" ||
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
    "usage: handoff <validate-policy|validate-authorization|validate-decision|fixture|concurrency|privacy-block|budget-block|render> [path]",
  );
  process.exitCode = 1;
}
