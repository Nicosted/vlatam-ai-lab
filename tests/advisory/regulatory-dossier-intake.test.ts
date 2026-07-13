import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER,
  DOSSIER_READINESS_STATES,
  DOSSIER_REASON_CODES,
  EVIDENCE_STATES,
  evaluateRegulatoryDossier,
  type RegulatoryDossier,
} from "../../src/advisory/regulatory-dossier-intake.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const applyFormats = ((addFormatsModule as any).default ??
  addFormatsModule) as (ajv: AjvClass) => void;

interface InvalidScenario {
  readonly scenario_id: string;
  readonly operation: "set" | "append" | "duplicate_dossier";
  readonly path: string;
  readonly value: unknown;
  readonly expected_reason: (typeof DOSSIER_REASON_CODES)[number];
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function mutate(
  root: Record<string, unknown>,
  scenario: InvalidScenario,
): void {
  const parts = scenario.path.split(".");
  const last = parts.pop();
  assert.ok(last);
  let cursor: unknown = root;
  for (const part of parts) {
    assert.ok(typeof cursor === "object" && cursor !== null);
    cursor = (cursor as Record<string, unknown>)[part];
  }
  assert.ok(typeof cursor === "object" && cursor !== null);
  const record = cursor as Record<string, unknown>;
  if (scenario.operation === "append") {
    const target = record[last];
    assert.ok(Array.isArray(target));
    target.push(scenario.value);
  } else {
    record[last] = scenario.value;
  }
}

describe("AI-84 regulatory dossier intake", () => {
  it("publishes stable evidence and readiness vocabularies", () => {
    assert.deepEqual(EVIDENCE_STATES, [
      "provided_unreviewed",
      "reviewed_supported",
      "reviewed_unsupported",
      "missing",
      "conflicting",
      "not_applicable",
    ]);
    assert.deepEqual(DOSSIER_READINESS_STATES, [
      "intake_incomplete",
      "ready_for_research",
      "research_in_progress",
      "ready_for_professional_review",
      "blocked",
      "reviewed_advisory_ready",
    ]);
    assert.equal(DOSSIER_REASON_CODES.length, 18);
  });

  it("validates the repository fixture against the versioned JSON Schema", () => {
    const schema = json(
      "schemas/regulatory-dossier-intake.schema.json",
    ) as Record<string, unknown>;
    const fixture = json(
      "data/fixtures/advisory/regulatory-dossier-intake-ar-es-ecological-agrochemicals.json",
    );
    const ajv = new AjvClass({ allErrors: true, strict: false });
    applyFormats(ajv);
    const validate = ajv.compile(schema);
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    assert.deepEqual(fixture, ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER);
  });

  it("keeps the initial dossier incomplete, human-reviewed, and downstream-blocked", () => {
    const evaluation = evaluateRegulatoryDossier(
      ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER,
    );
    assert.equal(evaluation.readiness, "intake_incomplete");
    assert.equal(evaluation.human_review_required, true);
    assert.equal(evaluation.downstream_allowed, false);
    for (const reason of [
      "MISSING_INTENDED_USE",
      "MISSING_ACTIVE_INGREDIENTS",
      "MISSING_SDS_MSDS",
      "MISSING_IMPORTER",
    ] as const) {
      assert.ok(evaluation.missing_evidence_reason_codes.includes(reason));
    }
    assert.ok(
      evaluation.blocker_reason_codes.includes("PROFESSIONAL_REVIEW_REQUIRED"),
    );
    assert.notEqual(evaluation.readiness, "reviewed_advisory_ready");
  });

  it("evaluates every invalid or blocked fixture with its machine-readable reason", () => {
    const fixture = json(
      "data/fixtures/advisory/regulatory-dossier-invalid-scenarios.json",
    ) as {
      readonly scenarios: readonly InvalidScenario[];
    };
    assert.equal(fixture.scenarios.length, 17);
    for (const scenario of fixture.scenarios) {
      const dossier = structuredClone(
        ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER,
      ) as unknown as Record<string, unknown>;
      if (scenario.operation === "duplicate_dossier") {
        const typed = dossier as unknown as RegulatoryDossier;
        const result = evaluateRegulatoryDossier(typed, [
          typed,
          structuredClone(typed),
        ]);
        assert.ok(
          result.blocker_reason_codes.includes(scenario.expected_reason),
          scenario.scenario_id,
        );
        continue;
      }
      mutate(dossier, scenario);
      const result = evaluateRegulatoryDossier(
        dossier as unknown as RegulatoryDossier,
      );
      assert.ok(
        [
          ...result.blocker_reason_codes,
          ...result.missing_evidence_reason_codes,
        ].includes(scenario.expected_reason),
        scenario.scenario_id,
      );
      assert.equal(result.downstream_allowed, false, scenario.scenario_id);
    }
  });

  it("does not infer regulated facts from the product name or catalog reference", () => {
    const dossier = ARGENTINA_SPAIN_ECOLOGICAL_AGROCHEMICAL_DOSSIER;
    assert.equal(dossier.product.intended_use, null);
    assert.equal(dossier.product.formulation, null);
    assert.deepEqual(dossier.product.active_ingredients, []);
    assert.equal(dossier.claims[0]?.evidence_state, "provided_unreviewed");
    assert.equal(dossier.downstream_eligibility.downstream_allowed, false);
  });

  it("contains no provider execution, network, credential, or approved-export behavior", () => {
    const source = readFileSync(
      "src/advisory/regulatory-dossier-intake.ts",
      "utf8",
    );
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /process\.env/);
    assert.doesNotMatch(source, /registerProviderAdapter/);
    assert.doesNotMatch(source, /MultiProviderGateway/);
    assert.doesNotMatch(source, /approved-artifact/);
  });
});
