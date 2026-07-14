import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import {
  computeEvidenceHash,
  evaluateCandidateProfileReadiness,
  REQUIRED_EVIDENCE_CATEGORIES,
  type CandidateProfileReadiness,
  type ProviderEvidenceRecord,
} from "../../src/providers/provider-evidence.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const addFormats = ((addFormatsModule as any).default ?? addFormatsModule) as (
  ajv: Ajv,
) => void;
const load = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const now = new Date("2026-07-13T12:00:00.000Z");
const catalog = (
  load("config/ai-provider-evidence.json") as {
    evidence: ProviderEvidenceRecord[];
  }
).evidence;
const profiles = (
  load("config/ai-candidate-profile-readiness.json") as {
    profiles: CandidateProfileReadiness[];
  }
).profiles;
const clone = <T>(value: T): T => structuredClone(value);

describe("AI-81/AI-82 provider evidence and candidate readiness", () => {
  it("validates the versioned catalogs and keeps both candidates disabled and blocked", () => {
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
    assert.ok(
      profiles.every(
        (profile) =>
          !profile.enabled && profile.runtime_eligibility === "blocked",
      ),
    );
  });

  it("covers every required category for the one selected candidate identity", () => {
    const selected = profiles.find(
      (profile) =>
        (profile as CandidateProfileReadiness & { evaluation_status?: string })
          .evaluation_status === "selected_evaluated",
    )!;
    const records = catalog.filter((record) =>
      selected.evidence_refs.includes(record.evidence_id),
    );
    assert.deepEqual(
      [...new Set(records.map((record) => record.category))].sort(),
      [...REQUIRED_EVIDENCE_CATEGORIES].sort(),
    );
    assert.ok(
      records.every((record) => record.provider_id === selected.provider_id),
    );
  });

  it("verifies canonical primary-source URLs, references, and deterministic hashes", () => {
    const ids = new Set(catalog.map((record) => record.evidence_id));
    assert.equal(ids.size, catalog.length);
    for (const record of catalog) {
      const url = new URL(record.source.canonical_url);
      assert.equal(url.protocol, "https:");
      assert.ok(
        ["openrouter.ai", "platform.minimax.io"].includes(url.hostname),
      );
      assert.equal(computeEvidenceHash(record), record.evidence_hash);
      assert.ok(record.limitations.length > 0);
    }
    for (const profile of profiles.filter(
      (item) => item.evidence_refs.length > 0,
    )) {
      assert.ok(profile.evidence_refs.every((reference) => ids.has(reference)));
    }
  });

  it("produces deterministic fail-closed readiness results on replay", () => {
    for (const profile of profiles.filter(
      (item) => item.evidence_refs.length > 0,
    )) {
      const first = evaluateCandidateProfileReadiness(profile, catalog, now);
      const second = evaluateCandidateProfileReadiness(
        profile,
        [...catalog].reverse(),
        now,
      );
      assert.deepEqual(first, second);
      assert.ok(first.includes("privacy_unknown"));
      assert.ok(first.includes("unsupported_capability"));
    }
  });

  for (const { name, expected } of (
    load("snapshots/providers/ai-82-invalid-scenarios.json") as {
      scenarios: { name: string; expected: string }[];
    }
  ).scenarios) {
    it(`fails closed for ${name}`, () => {
      const profile = clone(
        profiles.find((item) => item.provider_id === "openrouter")!,
      ) as CandidateProfileReadiness & { evidence_refs: string[] };
      profile.evidence_refs = catalog
        .filter((item) => item.provider_id === "openrouter")
        .map((item) => item.evidence_id);
      const evidence = clone(catalog);
      const record = evidence.find(
        (item) => item.provider_id === "openrouter",
      )!;
      const category = (id: string) =>
        evidence.find((item) => item.evidence_id === id)!;
      switch (name) {
        case "ambiguous-model-identity": {
          const identity = category(
            "openrouter.model-identity.v2",
          ) as unknown as Record<string, unknown>;
          identity["status"] = "unknown";
          delete identity["value"];
          break;
        }
        case "aggregator-upstream-scope-confusion":
          (
            category("openrouter.model-identity.v2") as unknown as {
              upstream_provider_id: string;
            }
          ).upstream_provider_id = "other";
          break;
        case "stale-expired-evidence":
          (record as unknown as { expires_at: string }).expires_at =
            "2026-01-01T00:00:00.000Z";
          break;
        case "missing-retrieval-date":
          (record.source as unknown as { retrieved_at: string }).retrieved_at =
            "";
          break;
        case "missing-review-date":
          (record.review as unknown as { reviewed_at: null }).reviewed_at =
            null;
          break;
        case "unsupported-capability":
          break;
        case "contradictory-pricing":
          break;
        case "false-unsupported-zdr": {
          const zdr = category("openrouter.zdr.v2") as unknown as Record<
            string,
            unknown
          >;
          zdr["value"] = true;
          break;
        }
        case "provider-wide-applied-to-model":
          (record as unknown as { model_id: string }).model_id =
            profile.model_id!;
          break;
        case "credential-shaped-field":
          (record as unknown as Record<string, unknown>)["client_secret"] =
            "fixture";
          break;
        case "unreviewed-evidence":
          (record.review as unknown as { status: string }).status = "pending";
          break;
        case "variable-provider-routing":
          break;
        case "missing-upstream-provider-evidence":
          (
            profile as unknown as { upstream_provider_id: null }
          ).upstream_provider_id = null;
          break;
        case "evidence-hash-mismatch":
          (record as unknown as { finding: string }).finding =
            `${record.finding} changed`;
          break;
        default:
          assert.fail(`unknown scenario ${name}`);
      }
      assert.ok(
        evaluateCandidateProfileReadiness(profile, evidence, now).includes(
          expected,
        ),
      );
    });
  }

  it("keeps candidates outside executable profiles and the live adapter registry", async () => {
    const executionProfiles = JSON.parse(
      readFileSync("config/ai-execution-profiles.json", "utf8"),
    ) as {
      profiles: {
        provider_id: string;
        enabled: boolean;
        sandbox_controls?: { configuration_status: string };
      }[];
    };
    assert.ok(
      executionProfiles.profiles
        .filter((profile) =>
          ["openrouter", "minimax-direct"].includes(profile.provider_id),
        )
        .every(
          (profile) =>
            !profile.enabled &&
            profile.sandbox_controls?.configuration_status === "proposal_only",
        ),
    );
    const { ProviderAdapterRegistry } =
      await import("../../src/providers/adapter-registry.js");
    assert.deepEqual(new ProviderAdapterRegistry().listProviderAdapters(), []);
  });
});
