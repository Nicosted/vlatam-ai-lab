import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DECISION_CANDIDATE_REGISTRY_HASH_DOMAIN,
  DECISION_CANDIDATE_REGISTRY_REVIEW_STATES,
  computeDecisionCandidateRegistryHash,
  validateDecisionCandidateRegistry,
  validateDecisionCandidateRegistryManifest,
  validateDecisionCandidateRegistrySuccession,
  type DecisionCandidateRegistry,
} from "../../src/decision-candidates/index.js";
import {
  adapterEntry,
  clone,
  codes,
  fixtureRegistry,
  modelEntry,
  mutateEntry,
  registryFor,
  rehashRegistry,
  type Mutable,
} from "./helpers.js";

function manifestCodes(value: unknown): string[] {
  return codes(validateDecisionCandidateRegistryManifest(value));
}

function registryCodes(manifest: unknown, entries: unknown[]): string[] {
  return codes(validateDecisionCandidateRegistry(manifest, entries));
}

function mutateRegistry(
  base: Mutable,
  mutate: (registry: Mutable) => void,
): Mutable {
  const registry = clone(base);
  mutate(registry);
  return rehashRegistry(registry);
}

describe("AI-142 candidate registry manifest", () => {
  it("accepts the fixture registry with its exact entries", () => {
    const check = validateDecisionCandidateRegistry(fixtureRegistry(), [
      adapterEntry(),
      modelEntry(),
    ]);
    assert.equal(check.ok, true, JSON.stringify(check));
    if (!check.ok) return;
    assert.deepEqual(
      check.value.candidates.map((entry) => entry.candidate_id),
      ["tdc-fixture-decision-model", "tdc-fixture-direct-logit-adapter"],
    );
    assert.equal(check.value.registry.authority, "evidence_only");
    assert.equal(check.value.registry.universal_winner, false);
  });

  it("binds exact candidate ids, revisions, hashes, commits, roles and completeness", () => {
    const registry = fixtureRegistry();
    const model = modelEntry();
    const binding = (registry["candidates"] as Mutable[]).find(
      (b) => b["candidate_id"] === model["candidate_id"],
    )!;
    assert.deepEqual(binding, {
      candidate_id: model["candidate_id"],
      evidence_revision: 1,
      candidate_hash: model["candidate_hash"],
      repository: model["upstream"]["repository"],
      pinned_commit_sha: model["upstream"]["pinned_commit_sha"],
      roles: ["typed_decision_model"],
      evidence_completeness: "incomplete",
    });
    assert.deepEqual(registry["role_distribution"], {
      research_methodology: 1,
      typed_decision_adapter: 1,
      typed_decision_model: 1,
    });
    assert.deepEqual(registry["evidence_completeness_distribution"], {
      incomplete: 2,
    });
  });

  it("rejects duplicate candidate ids", () => {
    const registry = mutateRegistry(fixtureRegistry(), (r) => {
      r["candidates"][1]["candidate_id"] = r["candidates"][0]["candidate_id"];
    });
    assert.ok(manifestCodes(registry).includes("duplicate_candidate_id"));
    assert.ok(
      registryCodes(fixtureRegistry(), [
        modelEntry(),
        modelEntry(),
        adapterEntry(),
      ]).includes("duplicate_candidate_id"),
    );
  });

  it("rejects duplicate candidate hashes", () => {
    const registry = mutateRegistry(fixtureRegistry(), (r) => {
      r["candidates"][1]["candidate_hash"] =
        r["candidates"][0]["candidate_hash"];
    });
    assert.ok(manifestCodes(registry).includes("duplicate_candidate_hash"));
  });

  it("rejects a missing candidate", () => {
    assert.deepEqual(registryCodes(fixtureRegistry(), [modelEntry()]), [
      "candidate_missing",
    ]);
  });

  it("rejects an extra candidate not bound by the registry", () => {
    const extra = mutateEntry(modelEntry(), (e) => {
      e["candidate_id"] = "tdc-fixture-extra";
    });
    assert.deepEqual(
      registryCodes(fixtureRegistry(), [modelEntry(), adapterEntry(), extra]),
      ["candidate_not_in_registry"],
    );
  });

  it("rejects a tampered candidate", () => {
    const tampered = modelEntry();
    tampered["display_name"] = "Tampered";
    const found = registryCodes(fixtureRegistry(), [tampered, adapterEntry()]);
    assert.ok(found.includes("candidate_hash_mismatch"), found.join());
    assert.ok(found.includes("candidate_invalid"));
  });

  it("rejects a re-hashed candidate that no longer matches its binding", () => {
    const changed = mutateEntry(modelEntry(), (e) => {
      e["evidence"][2]["content_sha256"] = "5".repeat(64);
    });
    assert.deepEqual(
      registryCodes(fixtureRegistry(), [changed, adapterEntry()]),
      ["candidate_binding_mismatch"],
    );
  });

  it("rejects out-of-order bindings without re-sorting them", () => {
    const registry = mutateRegistry(fixtureRegistry(), (r) => {
      r["candidates"].reverse();
    });
    assert.ok(manifestCodes(registry).includes("candidate_order_invalid"));
  });

  it("recomputes distributions and rejects declared mismatches", () => {
    const registry = mutateRegistry(fixtureRegistry(), (r) => {
      r["role_distribution"]["typed_decision_model"] = 2;
    });
    assert.deepEqual(manifestCodes(registry), ["distribution_mismatch"]);
    const completeness = mutateRegistry(fixtureRegistry(), (r) => {
      r["evidence_completeness_distribution"] = { complete: 2 };
    });
    assert.deepEqual(manifestCodes(completeness), ["distribution_mismatch"]);
  });

  it("rejects mutable commits in bindings", () => {
    const registry = mutateRegistry(fixtureRegistry(), (r) => {
      r["candidates"][0]["pinned_commit_sha"] = "main";
    });
    assert.ok(manifestCodes(registry).includes("upstream_revision_unpinned"));
  });

  it("rejects an empty registry", () => {
    const registry = mutateRegistry(fixtureRegistry(), (r) => {
      r["candidates"] = [];
      r["role_distribution"] = {};
      r["evidence_completeness_distribution"] = {};
    });
    assert.ok(manifestCodes(registry).includes("registry_empty"));
  });

  it("computes a deterministic registry hash under its own domain", () => {
    assert.equal(
      DECISION_CANDIDATE_REGISTRY_HASH_DOMAIN,
      "vlatam-ai-lab:typed-decision-candidate-registry:v1",
    );
    const registry = fixtureRegistry();
    const a = computeDecisionCandidateRegistryHash(
      registry as DecisionCandidateRegistry,
    );
    const reordered = Object.fromEntries(Object.entries(registry).reverse());
    const b = computeDecisionCandidateRegistryHash(
      reordered as unknown as DecisionCandidateRegistry,
    );
    assert.equal(a, b);
    assert.equal(a, registry["registry_hash"]);
    assert.equal(
      registryFor([modelEntry(), adapterEntry()], {
        registry_id: "ai-lab-fixture-decision-candidates",
      })["registry_hash"],
      registry["registry_hash"],
    );
  });

  it("changes the registry hash when any candidate evidence changes", () => {
    const changed = mutateEntry(modelEntry(), (e) => {
      e["upstream"]["observed_at"] = "2026-09-27T00:00:00Z";
    });
    const next = registryFor([changed, adapterEntry()]);
    assert.notEqual(next["registry_hash"], fixtureRegistry()["registry_hash"]);
    assert.equal(
      validateDecisionCandidateRegistry(next, [changed, adapterEntry()]).ok,
      true,
    );
  });

  it("rejects registry hash tampering", () => {
    const registry = fixtureRegistry();
    registry["registry_version"] = "1.0.1";
    assert.deepEqual(manifestCodes(registry), ["registry_hash_mismatch"]);
  });
});

describe("AI-142 candidate registry: review state is non-authoritative", () => {
  it("admits only draft and in_review", () => {
    assert.deepEqual(DECISION_CANDIDATE_REGISTRY_REVIEW_STATES, [
      "draft",
      "in_review",
    ]);
    for (const state of ["draft", "in_review"])
      assert.deepEqual(
        manifestCodes(
          mutateRegistry(fixtureRegistry(), (r) => {
            r["review"]["state"] = state;
          }),
        ),
        [],
      );
    for (const state of ["approved", "published", "active"])
      assert.ok(
        manifestCodes(
          mutateRegistry(fixtureRegistry(), (r) => {
            r["review"]["state"] = state;
          }),
        ).includes("review_invalid"),
      );
  });

  it("carries no self-approval reference", () => {
    for (const key of ["approval_ref", "approved_by", "approval_id"]) {
      const found = manifestCodes(
        mutateRegistry(fixtureRegistry(), (r) => {
          r["review"][key] = "self";
        }),
      );
      assert.ok(found.includes("authority_field_forbidden"), found.join());
      assert.ok(found.includes("unknown_property"));
    }
    assert.ok(
      manifestCodes(
        mutateRegistry(fixtureRegistry(), (r) => {
          r["review"]["human_review_required"] = false;
        }),
      ).includes("review_invalid"),
    );
  });

  it("never declares a winner or authority", () => {
    assert.ok(
      manifestCodes(
        mutateRegistry(fixtureRegistry(), (r) => {
          r["universal_winner"] = true;
        }),
      ).includes("authority_invalid"),
    );
    assert.ok(
      manifestCodes(
        mutateRegistry(fixtureRegistry(), (r) => {
          r["authority"] = "promotion";
        }),
      ).includes("authority_invalid"),
    );
    for (const key of ["winner", "ranking", "leaderboard", "preferred"])
      assert.ok(
        manifestCodes(
          mutateRegistry(fixtureRegistry(), (r) => {
            r[key] = "tdc-fixture-decision-model";
          }),
        ).includes("authority_field_forbidden"),
      );
  });
});

describe("AI-142 candidate registry succession", () => {
  const previous = fixtureRegistry();

  function successor(entries: Mutable[], overrides: Mutable = {}): Mutable {
    return registryFor(entries, {
      registry_version: "1.1.0",
      supersedes: {
        registry_version: previous["registry_version"],
        registry_hash: previous["registry_hash"],
      },
      ...overrides,
    });
  }

  it("accepts a new version that adds an evidence revision", () => {
    const model = modelEntry();
    const revised = mutateEntry(model, (e) => {
      e["evidence_revision"] = 2;
      e["supersedes"] = {
        evidence_revision: 1,
        candidate_hash: model["candidate_hash"],
      };
      e["upstream"]["observed_at"] = "2026-10-01T00:00:00Z";
    });
    const next = successor([revised, adapterEntry()]);
    const check = validateDecisionCandidateRegistrySuccession(previous, next);
    assert.equal(check.ok, true, JSON.stringify(check));
  });

  it("rejects a candidate rewritten without a new evidence revision", () => {
    const rewritten = mutateEntry(modelEntry(), (e) => {
      e["upstream"]["observed_at"] = "2026-10-01T00:00:00Z";
    });
    assert.deepEqual(
      codes(
        validateDecisionCandidateRegistrySuccession(
          previous,
          successor([rewritten, adapterEntry()]),
        ),
      ),
      ["candidate_rewritten_without_revision"],
    );
  });

  it("rejects silent removal, unbound supersession and non-increasing versions", () => {
    assert.deepEqual(
      codes(
        validateDecisionCandidateRegistrySuccession(
          previous,
          successor([modelEntry()]),
        ),
      ),
      ["candidate_removed"],
    );
    assert.deepEqual(
      codes(
        validateDecisionCandidateRegistrySuccession(
          previous,
          successor([modelEntry(), adapterEntry()], {
            supersedes: {
              registry_version: "1.0.0",
              registry_hash: "6".repeat(64),
            },
          }),
        ),
      ),
      ["succession_supersedes_mismatch"],
    );
    assert.ok(
      codes(
        validateDecisionCandidateRegistrySuccession(
          previous,
          successor([modelEntry(), adapterEntry()], {
            registry_version: "0.9.0",
          }),
        ),
      ).includes("succession_version_not_increased"),
    );
  });
});
