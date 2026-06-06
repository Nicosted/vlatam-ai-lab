import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

import type { ValidateFunction } from "ajv";

import { readUtf8File } from "../src/lib/fs.js";
import {
  deriveSourceFreshness,
  isSampleLocator,
  isSourceDownstreamAllowed,
  isVerifiedOfficialSource,
  sourceVerificationLabel,
} from "../src/intelligence/source-onboarding.js";
import type { SourceRegistryEntry } from "../src/intelligence/types.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020") as new (options?: {
  allErrors?: boolean;
  strict?: boolean;
  validateFormats?: boolean;
}) => {
  compile: (schema: unknown) => ValidateFunction;
};

const NOW = new Date("2026-06-06T00:00:00.000Z");

const wcoHs2022Fixture =
  "snapshots/pcram/intelligence-source-registry-wco-hs-2022-official.json";
const wcoHs2028Fixture =
  "snapshots/pcram/intelligence-source-registry-wco-hs-2028-official.json";
const mercosurFixture =
  "snapshots/pcram/intelligence-source-registry-mercosur-ncm-aec-official.json";
const decretoFixture =
  "snapshots/pcram/intelligence-source-registry-ar-decreto-557-2023-official.json";
const arcaFixture =
  "snapshots/pcram/intelligence-source-registry-ar-arca-arancel-official.json";

const verifiedOfficialFixtures = [
  wcoHs2022Fixture,
  wcoHs2028Fixture,
  mercosurFixture,
  decretoFixture,
  arcaFixture,
];

const sectoralPlaceholderFixture =
  "snapshots/pcram/intelligence-source-registry-sectoral-placeholder.json";

async function readFixture(relativePath: string): Promise<SourceRegistryEntry> {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  const content = await readUtf8File(absolutePath);
  return JSON.parse(content) as SourceRegistryEntry;
}

async function buildValidator(): Promise<ValidateFunction> {
  const schemaPath = path.resolve(
    process.cwd(),
    "schemas/intelligence-source-registry.schema.json",
  );
  const schema = JSON.parse(await readUtf8File(schemaPath));
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });

  return ajv.compile(schema);
}

for (const fixture of verifiedOfficialFixtures) {
  test(`verified official fixture passes schema validation: ${fixture}`, async () => {
    const validate = await buildValidator();
    const entry = await readFixture(fixture);

    assert.equal(validate(entry), true);
  });
}

test("sectoral placeholder passes schema validation", async () => {
  const validate = await buildValidator();
  const entry = await readFixture(sectoralPlaceholderFixture);

  assert.equal(validate(entry), true);
});

test("verified official fixtures never use a sample:// locator", async () => {
  for (const fixture of verifiedOfficialFixtures) {
    const entry = await readFixture(fixture);

    assert.equal(entry.verification_status, "verified_official", fixture);
    assert.equal(isSampleLocator(entry.source_locator), false, fixture);
    assert.equal(isVerifiedOfficialSource(entry), true, fixture);
    assert.equal(sourceVerificationLabel(entry), "verified-official", fixture);
  }
});

test("official source metadata does not make downstream_allowed true", async () => {
  for (const fixture of verifiedOfficialFixtures) {
    const entry = await readFixture(fixture);

    assert.equal(entry.downstream_allowed, false, fixture);
    assert.equal(entry.human_review_required, true, fixture);
    assert.equal(isSourceDownstreamAllowed(entry), false, fixture);
  }
});

test("verified official fixtures carry conservative, non-current freshness", async () => {
  for (const fixture of verifiedOfficialFixtures) {
    const entry = await readFixture(fixture);

    assert.notEqual(entry.freshness_status, "current", fixture);
    // The stored freshness must match the conservative derivation.
    assert.equal(
      entry.freshness_status,
      deriveSourceFreshness(entry, { now: NOW }),
      fixture,
    );
  }
});

test("verified official fixtures require authority and reliability metadata", async () => {
  for (const fixture of verifiedOfficialFixtures) {
    const entry = await readFixture(fixture);

    assert.notEqual(entry.authority_level, "unknown", fixture);
    assert.notEqual(entry.reliability_level, "unknown", fixture);
  }
});

test("missing last_checked_at never derives current freshness", () => {
  const status = deriveSourceFreshness(
    {
      // No last_checked_at supplied.
      expected_update_cadence: { label: "monthly" },
      human_review_required: false,
      authority_level: "official",
      reliability_level: "high",
    },
    { now: NOW },
  );

  assert.equal(status, "unknown");
});

test("missing authority metadata derives requires_review, never current", () => {
  const status = deriveSourceFreshness(
    {
      last_checked_at: "2026-06-05T00:00:00.000Z",
      expected_update_cadence: { label: "monthly" },
      human_review_required: false,
      authority_level: "unknown",
      reliability_level: "high",
    },
    { now: NOW },
  );

  assert.equal(status, "requires_review");
});

test("WCO/MERCOSUR/Argentina fixtures are distinguishable by scope and authority", async () => {
  const wco = await readFixture(wcoHs2022Fixture);
  const mercosur = await readFixture(mercosurFixture);
  const decreto = await readFixture(decretoFixture);
  const arca = await readFixture(arcaFixture);

  assert.equal(wco.jurisdiction_scope, "global");
  assert.equal(wco.source_type, "wco_hs_reference");

  assert.equal(mercosur.jurisdiction_scope, "regional");
  assert.equal(mercosur.regional_scope, "MERCOSUR");
  assert.equal(mercosur.source_type, "mercosur_norm");

  assert.equal(decreto.jurisdiction_scope, "national");
  assert.equal(decreto.country_code, "AR");
  assert.equal(decreto.source_type, "ncm_reference");

  assert.equal(arca.jurisdiction_scope, "national");
  assert.equal(arca.country_code, "AR");
  assert.equal(arca.source_type, "customs_authority");

  // Each verified official source has a stable, unique source_id.
  const ids = [wco, mercosur, decreto, arca].map((entry) => entry.source_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("sectoral placeholder remains unverified and requires_review", async () => {
  const entry = await readFixture(sectoralPlaceholderFixture);

  assert.equal(entry.verification_status, "unverified_sample");
  assert.equal(isVerifiedOfficialSource(entry), false);
  assert.equal(sourceVerificationLabel(entry), "unverified-sample");
  assert.equal(entry.freshness_status, "requires_review");
  assert.equal(entry.downstream_allowed, false);
  assert.equal(isSampleLocator(entry.source_locator), true);
});

test("a sample locator with a verified_official status is flagged inconsistent", () => {
  const label = sourceVerificationLabel({
    verification_status: "verified_official",
    source_locator: "sample://wco/hs-nomenclature",
  });

  assert.equal(label, "inconsistent");
  assert.equal(
    isVerifiedOfficialSource({
      verification_status: "verified_official",
      source_locator: "sample://wco/hs-nomenclature",
    }),
    false,
  );
});

test("downstream guard rejects a verified official entry that is not explicitly allowed", () => {
  assert.equal(
    isSourceDownstreamAllowed({
      downstream_allowed: false,
      verification_status: "verified_official",
      source_locator: "https://www.wcoomd.org/",
      human_review_required: true,
    }),
    false,
  );
});
