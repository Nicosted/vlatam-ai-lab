import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  PricingCatalog,
  validatePricingEntry,
} from "../../src/governance/index.js";
import { pricing, rate } from "../helpers/governance.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const load = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("AI-74 catalogs and audit safety", () => {
  for (const [name, schemaPath, dataPath] of [
    ["pricing", "schemas/ai-pricing.schema.json", "config/ai-pricing.json"],
    [
      "budget",
      "schemas/ai-budget-policies.schema.json",
      "config/ai-budget-policies.json",
    ],
  ] as const)
    it(`${name} catalog validates and rejects invalid units`, () => {
      const ajv = new Ajv({ allErrors: true });
      addFormats(ajv);
      const validate = ajv.compile(load(schemaPath));
      assert.equal(
        validate(load(dataPath)),
        true,
        JSON.stringify(validate.errors),
      );
      const bad = structuredClone(load(dataPath));
      if (name === "pricing") bad.prices[0].currency = "usd";
      else bad.policies[0].currency = "usd";
      assert.equal(validate(bad), false);
    });

  it("registers schema-invalid pricing fixtures", () => {
    const ajv = new Ajv({ allErrors: true });
    addFormats(ajv);
    const validate = ajv.compile(load("schemas/ai-pricing.schema.json"));
    for (const fixture of [
      "snapshots/governance/invalid-pricing-denominator-zero.json",
      "snapshots/governance/invalid-pricing-missing-evidence-hash.json",
    ])
      assert.equal(
        validate(load(fixture)),
        false,
        `${fixture} must be invalid`,
      );
  });

  it("rejects semantic pricing failures that JSON Schema cannot express", () => {
    const valid = pricing();
    assert.equal(
      validatePricingEntry({
        ...valid,
        rates: [
          rate("input", "1"),
          { ...rate("output", "1"), currency: "EUR" },
        ],
      }),
      false,
      "mixed currencies fail closed",
    );
    assert.equal(
      validatePricingEntry({ ...valid, rates: [rate("input", "2", "4")] }),
      false,
      "unreduced fractions fail runtime validation",
    );
    assert.throws(
      () =>
        new PricingCatalog({
          schema_version: "2.0.0",
          prices: [
            pricing({
              evidence: {
                ...valid.evidence,
                expires_at: "2026-01-01T00:00:00.000Z",
              },
            }),
          ],
          legacy_prices: [],
        }).resolve(
          {
            provider_id: "replay",
            model_id: "model.test",
            mode: "replay",
          } as never,
          new Date("2026-07-13T00:00:00.000Z"),
          true,
        ),
      (error) =>
        error instanceof Error &&
        "governance_code" in error &&
        error.governance_code === "PRICING_EXPIRED",
    );
  });

  it("catalogs contain no credential-shaped fields", () => {
    const text =
      readFileSync("config/ai-pricing.json", "utf8") +
      readFileSync("config/ai-budget-policies.json", "utf8");
    assert.doesNotMatch(
      text,
      /api[_-]?key|password|bearer|authorization|secret/i,
    );
  });
});
