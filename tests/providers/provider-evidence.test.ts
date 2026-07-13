import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  assertCandidateProfileReady,
  evaluateCandidateProfileReadiness,
  type CandidateProfileReadiness,
  type ProviderEvidenceRecord,
} from "../../src/providers/provider-evidence.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const load = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const now = new Date("2026-07-12T12:00:00.000Z");

describe("AI-81 provider evidence and candidate readiness", () => {
  it("validates catalogs while keeping every real-provider candidate disabled and blocked", () => {
    for (const [schema, fixture] of [
      [
        "schemas/ai-provider-evidence.schema.json",
        "config/ai-provider-evidence.json",
      ],
      [
        "schemas/ai-candidate-profile-readiness.schema.json",
        "config/ai-candidate-profile-readiness.json",
      ],
    ] as const) {
      const ajv = new Ajv({ allErrors: true, strict: true });
      addFormats(ajv);
      const validate = ajv.compile(load(schema) as object);
      assert.equal(
        validate(load(fixture)),
        true,
        JSON.stringify(validate.errors),
      );
    }
    const profiles = (
      load("config/ai-candidate-profile-readiness.json") as {
        profiles: CandidateProfileReadiness[];
      }
    ).profiles;
    assert.ok(
      profiles.every(
        (profile) =>
          profile.lifecycle_status === "candidate" &&
          !profile.enabled &&
          profile.runtime_eligibility === "blocked",
      ),
    );
  });

  it("accepts only complete, reviewed, unexpired, matching evidence as review-ready", () => {
    const fixture = load(
      "snapshots/providers/valid-reviewed-evidence.json",
    ) as {
      profile: CandidateProfileReadiness;
      evidence: ProviderEvidenceRecord[];
    };
    assert.deepEqual(
      evaluateCandidateProfileReadiness(fixture.profile, fixture.evidence, now),
      [],
    );
    assert.doesNotThrow(() =>
      assertCandidateProfileReady(fixture.profile, fixture.evidence, now),
    );
  });

  for (const [name, reason] of [
    ["missing-expiry", "missing_expiry"],
    ["expired-evidence", "expired_evidence"],
    ["unsupported-capability", "unsupported_capability"],
    ["ambiguous-model-identity", "ambiguous_model_identity"],
    ["unreviewed-evidence", "unreviewed_evidence"],
    ["credential-shaped-field", "credential_shaped_field"],
    ["false-zdr-declaration", "false_zdr_declaration"],
    ["profile-evidence-mismatch", "profile_evidence_mismatch"],
  ] as const) {
    it(`fails closed for ${name}`, () => {
      const fixture = load(`snapshots/providers/invalid-${name}.json`) as {
        profile: CandidateProfileReadiness;
        evidence: ProviderEvidenceRecord[];
      };
      assert.ok(
        evaluateCandidateProfileReadiness(
          fixture.profile,
          fixture.evidence,
          now,
        ).includes(reason),
      );
      assert.throws(
        () =>
          assertCandidateProfileReady(fixture.profile, fixture.evidence, now),
        /PROVIDER_PROFILE_NOT_READY/,
      );
    });
  }

  it("does not register either provider adapter or activate a production profile", async () => {
    const { ProviderAdapterRegistry } =
      await import("../../src/providers/adapter-registry.js");
    const registry = new ProviderAdapterRegistry();
    assert.deepEqual(registry.listProviderAdapters(), []);
    const text = readFileSync(
      "config/ai-candidate-profile-readiness.json",
      "utf8",
    );
    assert.doesNotMatch(
      text,
      /"lifecycle_status"\s*:\s*"production"|"enabled"\s*:\s*true/,
    );
  });
});
