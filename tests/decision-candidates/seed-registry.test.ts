import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import {
  DECISION_CANDIDATE_LIFECYCLE,
  validateDecisionCandidateRegistry,
  type DecisionCandidateEntry,
  type DecisionCandidateRegistry,
} from "../../src/decision-candidates/index.js";
import { load } from "./helpers.js";

const ROOT = "data/decision-candidates/v1";

function readRegistry(): {
  registry: DecisionCandidateRegistry;
  entries: DecisionCandidateEntry[];
} {
  const entries = readdirSync(`${ROOT}/candidates`)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => load<DecisionCandidateEntry>(`${ROOT}/candidates/${name}`));
  return {
    registry: load<DecisionCandidateRegistry>(`${ROOT}/registry.json`),
    entries,
  };
}

function byId(
  entries: readonly DecisionCandidateEntry[],
  id: string,
): DecisionCandidateEntry {
  const entry = entries.find((e) => e.candidate_id === id);
  assert.ok(entry, id);
  return entry;
}

/**
 * The exact upstream revisions inspected during AI-142 evidence capture.
 * A refresh must add a new evidence revision and registry version; it
 * never silently rewrites these.
 */
/**
 * The repository names AI LAB was asked to inspect, where they differ from
 * the resolved repository (moves and redirects stay visible).
 */
const REQUESTED: Record<string, string> = {
  "tdc-theoleecj-semif": "theoleecj/semif",
};

const PINNED: Record<string, readonly [string, string]> = {
  "tdc-bespokelabsai-nimble": [
    "bespokelabsai/nimble",
    "62076b4f2d365b5879dafcf7f6dd072a1fe76df7",
  ],
  "tdc-jaredpalmer-kev": [
    "jaredpalmer/kev",
    "f1535963cea021439370c23127bc970b6788e730",
  ],
  "tdc-nandhakishorm-laya": [
    "NandhaKishorM/laya",
    "4066d5d5fbf08b66c6757ddeedbd797bd7655bc0",
  ],
  "tdc-rizzo-ai-academy-rizzo-flow": [
    "Rizzo-AI-Academy/rizzo-flow",
    "b9ba007ee4d2928bbab5b1d8bfe9009c3696b6de",
  ],
  // Requested as theoleecj/semif; the host resolves it to this repository.
  "tdc-theoleecj-semif": [
    "TheoLeeCJ/SemIf-OpenJev",
    "23cf1f39fc9534fe81437200959b6dfc7106e45a",
  ],
  "tdc-tianyucodings-nanojev": [
    "TianyuCodings/NanoJev",
    "76fdfc9ecdca45a9bcef17991a07d3041a87685a",
  ],
  "tdc-wfzyx-von": ["wfzyx/von", "fb6e7a937e4fc6b6e72b2ce5035edd56bc370e54"],
};

describe("AI-142 seed candidate registry ai-lab-typed-decision-candidates@1.0.0", () => {
  it("validates all seven entries against the exact registry bindings", () => {
    const { registry, entries } = readRegistry();
    const check = validateDecisionCandidateRegistry(registry, entries);
    assert.equal(check.ok, true, JSON.stringify(check));
    assert.equal(registry.registry_id, "ai-lab-typed-decision-candidates");
    assert.equal(registry.registry_version, "1.0.0");
    assert.equal(registry.review.state, "in_review");
    assert.equal(registry.authority, "evidence_only");
    assert.equal(registry.universal_winner, false);
    assert.deepEqual(
      registry.candidates.map((c) => c.candidate_id),
      Object.keys(PINNED).sort(),
    );
    assert.equal(entries.length, 7);
  });

  it("each entry validates against the entry JSON Schema", () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(
      load("schemas/ai-typed-decision-candidate-entry.schema.json"),
    );
    const validateRegistry = new Ajv2020({
      allErrors: true,
      strict: true,
    }).compile(
      load("schemas/ai-typed-decision-candidate-registry.schema.json"),
    );
    const { registry, entries } = readRegistry();
    for (const entry of entries)
      assert.equal(
        validate(entry),
        true,
        `${entry.candidate_id}: ${JSON.stringify(validate.errors)}`,
      );
    assert.equal(
      validateRegistry(registry),
      true,
      JSON.stringify(validateRegistry.errors),
    );
  });

  it("pins every entry and every evidence record to the exact inspected commit", () => {
    const { entries } = readRegistry();
    for (const entry of entries) {
      const [repository, commit] = PINNED[entry.candidate_id]!;
      assert.equal(entry.upstream.repository, repository);
      assert.equal(
        entry.upstream.requested_repository,
        REQUESTED[entry.candidate_id] ?? repository,
      );
      assert.equal(
        entry.upstream.repository_url,
        `https://github.com/${repository}`,
      );
      assert.equal(entry.upstream.pinned_commit_sha, commit);
      assert.match(entry.upstream.pinned_commit_sha, /^[a-f0-9]{40}$/);
      assert.equal(entry.evidence_revision, 1);
      assert.equal(entry.supersedes, null);
      for (const evidence of entry.evidence) {
        assert.equal(evidence.locator.commit_sha, commit);
        assert.equal(
          evidence.locator.source_url,
          `https://github.com/${repository}/blob/${commit}/${evidence.locator.path}`,
        );
        assert.match(evidence.locator.blob_sha!, /^[a-f0-9]{40}$/);
        assert.match(evidence.content_sha256, /^[a-f0-9]{64}$/);
      }
    }
  });

  it("uses no mutable-only source identity", () => {
    const text = [
      readFileSync(`${ROOT}/registry.json`, "utf8"),
      ...readdirSync(`${ROOT}/candidates`).map((name) =>
        readFileSync(`${ROOT}/candidates/${name}`, "utf8"),
      ),
    ].join("\n");
    assert.doesNotMatch(
      text,
      /github\.com\/[^"\s]+\/(?:blob|tree|raw)\/(?:main|master|HEAD)\b|raw\.githubusercontent\.com|refs\/heads\//,
    );
  });

  it("keeps every execution, benchmark, promotion, production and routing flag false", () => {
    const { entries } = readRegistry();
    for (const entry of entries) {
      assert.deepEqual(entry.lifecycle, DECISION_CANDIDATE_LIFECYCLE);
      assert.equal(entry.lifecycle.ai_lab_executed, false);
      assert.equal(entry.lifecycle.execution_enabled, false);
      assert.equal(entry.lifecycle.benchmark_execution_enabled, false);
      assert.equal(entry.lifecycle.promotion_eligible, false);
      assert.equal(entry.lifecycle.production_eligible, false);
    }
  });

  it("marks no claim as AI LAB verified and binds every claim to evidence", () => {
    const { entries } = readRegistry();
    for (const entry of entries) {
      assert.ok(entry.upstream_claims.length > 0, entry.candidate_id);
      const ids = new Set(entry.evidence.map((e) => e.evidence_id));
      for (const claim of entry.upstream_claims) {
        assert.equal(claim.verification, "upstream_claim");
        assert.ok(claim.evidence_refs.length > 0, claim.claim_id);
        for (const ref of claim.evidence_refs) assert.ok(ids.has(ref), ref);
      }
    }
  });

  it("records every license layer as evidenced, unresolved or not_applicable", () => {
    const { entries } = readRegistry();
    for (const entry of entries) {
      for (const layer of ["code", "weights", "base_model"] as const)
        assert.ok(
          ["evidenced", "unresolved", "not_applicable"].includes(
            entry.licensing[layer].status,
          ),
          `${entry.candidate_id}.${layer}`,
        );
      assert.ok(
        [
          "evidenced",
          "partially_evidenced",
          "unresolved",
          "not_applicable",
        ].includes(entry.licensing.training_data.status),
      );
      // Base-model licenses are never established from a candidate's own
      // statements about a third party.
      assert.equal(entry.licensing.base_model.status, "unresolved");
    }
  });

  it("contains no legal or commercial approval language", () => {
    for (const file of [
      `${ROOT}/registry.json`,
      ...readdirSync(`${ROOT}/candidates`).map(
        (name) => `${ROOT}/candidates/${name}`,
      ),
    ])
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /commercial|legally|legal approval|license approved|cleared for/i,
        file,
      );
  });

  it("stores no weights, upstream source or copied documents", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : [path];
      });
    const files = walk("data/decision-candidates");
    assert.deepEqual(files.map((f) => f.split("\\").join("/")).sort(), [
      `${ROOT}/candidates/${"tdc-bespokelabsai-nimble"}.json`,
      `${ROOT}/candidates/${"tdc-jaredpalmer-kev"}.json`,
      `${ROOT}/candidates/${"tdc-nandhakishorm-laya"}.json`,
      `${ROOT}/candidates/${"tdc-rizzo-ai-academy-rizzo-flow"}.json`,
      `${ROOT}/candidates/${"tdc-theoleecj-semif"}.json`,
      `${ROOT}/candidates/${"tdc-tianyucodings-nanojev"}.json`,
      `${ROOT}/candidates/${"tdc-wfzyx-von"}.json`,
      `${ROOT}/registry.json`,
    ]);
    for (const file of files)
      assert.ok(statSync(file).size < 32_000, `${file} is unexpectedly large`);
  });

  it("represents unlike projects by evidenced role, not a false equivalence", () => {
    const { entries } = readRegistry();
    const roles = (id: string) => byId(entries, id).roles.map((r) => r.role);
    // Direct-logit technique over existing models: an adapter with no weights.
    assert.deepEqual(roles("tdc-theoleecj-semif"), [
      "research_methodology",
      "typed_decision_adapter",
    ]);
    assert.equal(
      byId(entries, "tdc-theoleecj-semif").licensing.weights.involvement,
      "not_involved",
    );
    // Runtime infrastructure that also ships its own fine-tuned weights.
    assert.deepEqual(roles("tdc-rizzo-ai-academy-rizzo-flow"), [
      "typed_decision_model",
      "typed_decision_runtime",
    ]);
    // Multi-size families stay one entry, not one per variant.
    assert.equal(
      entries.filter((e) => e.upstream.repository === "jaredpalmer/kev").length,
      1,
    );
    // No role is a tier: distributions are counts only.
    const { registry } = readRegistry();
    assert.deepEqual(registry.role_distribution, {
      research_methodology: 4,
      typed_decision_adapter: 1,
      typed_decision_model: 6,
      typed_decision_runtime: 1,
    });
    assert.deepEqual(registry.evidence_completeness_distribution, {
      incomplete: 7,
    });
  });

  it("records unresolved and upstream-only facts without guessing", () => {
    const { entries } = readRegistry();
    // No project-level license file or statement at the pinned revision.
    const nimble = byId(entries, "tdc-bespokelabsai-nimble");
    assert.equal(nimble.licensing.code.status, "unresolved");
    assert.equal(nimble.licensing.code.declared_identifier, null);
    assert.ok(nimble.evidence_gaps.includes("code_license_unresolved"));
    // Weight licenses are evidenced only by first-party model cards, never
    // by the code license.
    for (const id of ["tdc-jaredpalmer-kev", "tdc-wfzyx-von"]) {
      const entry = byId(entries, id);
      assert.equal(entry.licensing.weights.status, "evidenced");
      const kinds = entry.licensing.weights.evidence_refs.map(
        (ref) =>
          entry.evidence.find((e) => e.evidence_id === ref)!.evidence_kind,
      );
      assert.ok(
        kinds.every((kind) => kind === "model_card"),
        id,
      );
    }
    // Order invariance is an upstream claim, not an AI LAB property.
    const von = byId(entries, "tdc-wfzyx-von");
    const invariance = von.upstream_claims.find(
      (c) => c.claim_kind === "invariance",
    );
    assert.equal(invariance?.verification, "upstream_claim");
    // Archive state could not be observed and is recorded as unresolved.
    for (const entry of entries) {
      assert.equal(entry.upstream.archive_state, "unresolved");
      assert.ok(entry.evidence_gaps.includes("archive_state_unresolved"));
      assert.equal(entry.evidence_completeness, "incomplete");
    }
  });

  it("records the SemIf move without changing identity, revision or evidence bytes", () => {
    const { registry, entries } = readRegistry();
    const semif = byId(entries, "tdc-theoleecj-semif");
    assert.equal(semif.upstream.requested_repository, "theoleecj/semif");
    assert.equal(semif.upstream.repository, "TheoLeeCJ/SemIf-OpenJev");
    assert.equal(semif.evidence_revision, 1);
    assert.equal(semif.upstream.default_branch_at_observation, "master");
    assert.deepEqual(
      semif.evidence.map((e) => [
        e.locator.path,
        e.locator.blob_sha,
        e.content_sha256,
      ]),
      [
        [
          "LICENSE",
          "ca562883550941229de6555a8374fe2c83a18e08",
          "f765f2140f8507a8f0d81ec0fd2c4bd72fe6a066841ef27883ff876a76bf61be",
        ],
        [
          "README.md",
          "8f607dad48e9bff34b5bb5079e3d825715b01134",
          "89f00284285ea0dac7b0e10ff04ebe643e37fb1a3165ab7dbd13686e97d65f62",
        ],
        [
          "THIRD_PARTY.md",
          "c11c1a471d6d9d35173dd244c2a4148dda098e90",
          "cf1815041c71181c6601c8acde1dd0d93fc4c9528efcd4a0637922d7fa96286b",
        ],
      ],
    );
    const binding = registry.candidates.find(
      (c) => c.candidate_id === "tdc-theoleecj-semif",
    )!;
    assert.equal(binding.repository, "TheoLeeCJ/SemIf-OpenJev");
    assert.equal(binding.candidate_hash, semif.candidate_hash);
    assert.equal(registry.registry_version, "1.0.0");
    assert.equal(registry.supersedes, null);
  });

  it("is bound by a deterministic registry hash", () => {
    const { registry } = readRegistry();
    assert.equal(
      registry.registry_hash,
      "bd6e3aadd0518e189b704a543edb04f638414eae50ab67d1a94e732439965cfd",
    );
  });
});
