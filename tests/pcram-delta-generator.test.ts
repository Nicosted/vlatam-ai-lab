import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ErrorObject, ValidateFunction } from "ajv";

import { readUtf8File } from "../src/lib/fs.js";
import { generatePcramDelta } from "../src/pcram/generate-delta.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020") as new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => {
  compile: (schema: unknown) => ValidateFunction;
};

async function readJsonFixture(
  relativePath: string,
): Promise<Record<string, unknown>> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as Record<string, unknown>;
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) {
    return "(no schema errors reported)";
  }

  return errors
    .map(
      (error) =>
        `${error.instancePath || "/"}: ${error.message ?? "validation error"}`,
    )
    .join("\n");
}

test("valid previous/current snapshots generate a delta", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );

  const result = generatePcramDelta(previous, current);

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("Expected valid delta result");
  }

  assert.equal(result.changeClassification, "content_changed");
  assert.equal(result.delta.change_type, "modified");
});

test("identical normalized payloads generate no_change", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = JSON.parse(JSON.stringify(previous)) as Record<
    string,
    unknown
  >;

  const result = generatePcramDelta(previous, current);

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("Expected valid delta result");
  }

  assert.equal(result.changeClassification, "no_change");
  assert.equal(result.delta.change_type, "no_change");
});

test("invalid previous snapshot returns structured error", async () => {
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );

  const result = generatePcramDelta({}, current);

  assert.equal(result.ok, false);
  if (result.ok) {
    assert.fail("Expected invalid delta result");
  }

  assert.equal(
    result.errors.some((errorMessage) =>
      errorMessage.startsWith("previous snapshot"),
    ),
    true,
  );
});

test("generated delta includes required schema-compatible fields", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );

  const result = generatePcramDelta(previous, current);

  assert.equal(result.ok, true);
  if (!result.ok) {
    assert.fail("Expected valid delta result");
  }

  const delta = result.delta;
  const requiredFields = [
    "delta_id",
    "source_id",
    "previous_snapshot_id",
    "current_snapshot_id",
    "change_type",
    "affected_codes",
    "summary",
    "operational_impact",
    "risk_level",
    "requires_human_review",
    "evidence_paths",
  ] as const;

  for (const field of requiredFields) {
    assert.notEqual(delta[field], undefined);
  }

  assert.equal(["no_change", "modified"].includes(delta.change_type), true);
  assert.equal(["low", "medium"].includes(delta.risk_level), true);
  assert.equal(Array.isArray(delta.affected_codes), true);
  assert.equal(Array.isArray(delta.evidence_paths), true);
  assert.equal(delta.evidence_paths.length > 0, true);
});

test("generated delta validates against pcram-delta schema", async () => {
  const previous = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-previous.json",
  );
  const current = await readJsonFixture(
    "snapshots/pcram/example-source-snapshot-current.json",
  );
  const schema = await readJsonFixture("schemas/pcram-delta.schema.json");

  const result = generatePcramDelta(previous, current);
  if (!result.ok) {
    assert.fail("Expected valid delta generation");
  }

  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  const validate = ajv.compile(schema);
  const isSchemaValid = validate(result.delta);

  assert.equal(
    isSchemaValid,
    true,
    `Generated delta failed schema validation:\n${formatSchemaErrors(validate.errors)}`,
  );
});
