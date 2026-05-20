import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import type { ErrorObject, ValidateFunction } from "ajv";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020") as new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => {
  compile: (schema: unknown) => ValidateFunction;
};

export type SnapshotValidationResult =
  | { ok: true }
  | { ok: false; errors: string[] };

let compiledValidator: ValidateFunction | null = null;
let compileError: string | null = null;

function formatAjvError(error: ErrorObject): string {
  const instancePath = error.instancePath || "/";
  const message = error.message ?? "validation error";
  return `${instancePath}: ${message}`;
}

function loadSchema(): unknown {
  const schemaPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../schemas/pcram-source-snapshot.schema.json",
  );
  const schemaContent = readFileSync(schemaPath, "utf8");
  return JSON.parse(schemaContent) as unknown;
}

function getValidator(): ValidateFunction | null {
  if (compiledValidator || compileError) {
    return compiledValidator;
  }

  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: false,
      validateFormats: false,
    });
    compiledValidator = ajv.compile(loadSchema());
    return compiledValidator;
  } catch (error) {
    compileError =
      error instanceof Error ? error.message : "Unknown schema compile error";
    return null;
  }
}

export function validatePcramSourceSnapshot(
  input: unknown,
): SnapshotValidationResult {
  const validator = getValidator();

  if (!validator) {
    return {
      ok: false,
      errors: [compileError ?? "Could not initialize schema validator"],
    };
  }

  const isValid = validator(input);
  if (isValid) {
    return { ok: true };
  }

  const errors = (validator.errors ?? []).map(formatAjvError);
  return {
    ok: false,
    errors: errors.length > 0 ? errors : ["Snapshot did not satisfy schema"],
  };
}
