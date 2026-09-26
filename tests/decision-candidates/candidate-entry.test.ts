import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DECISION_CANDIDATE_HASH_DOMAIN,
  DECISION_CANDIDATE_LIFECYCLE,
  computeDecisionCandidateHash,
  deriveDecisionCandidateEvidenceGaps,
  validateDecisionCandidateEntry,
  validateDecisionCandidateSuccession,
  type DecisionCandidateEntry,
} from "../../src/decision-candidates/index.js";
import {
  adapterEntry,
  clone,
  codes,
  modelEntry,
  mutateEntry,
  rehashEntry,
  type Mutable,
} from "./helpers.js";

function assertValid(value: unknown): DecisionCandidateEntry {
  const check = validateDecisionCandidateEntry(value);
  assert.equal(check.ok, true, JSON.stringify(check));
  return (check as { value: DecisionCandidateEntry }).value;
}

function assertIssue(value: unknown, code: string, path?: string): void {
  const check = validateDecisionCandidateEntry(value);
  assert.equal(check.ok, false, `expected ${code}`);
  if (check.ok) return;
  assert.ok(
    check.issues.some(
      (issue) =>
        issue.code === code && (path === undefined || issue.path === path),
    ),
    `expected ${code}${path ? ` at ${path}` : ""}, got ${JSON.stringify(check.issues)}`,
  );
}

const README = "ev-readme";

describe("AI-142 candidate entry: valid discovered candidates", () => {
  it("accepts a minimal discovered candidate", () => {
    const entry = assertValid(modelEntry());
    assert.equal(entry.lifecycle.registry_state, "discovered");
    assert.equal(entry.evidence_revision, 1);
    assert.equal(entry.supersedes, null);
  });

  it("accepts a multiple-role candidate only when every role cites evidence", () => {
    const entry = assertValid(adapterEntry());
    assert.deepEqual(
      entry.roles.map((role) => role.role),
      ["research_methodology", "typed_decision_adapter"],
    );
    assertIssue(
      mutateEntry(adapterEntry(), (e) => {
        e["roles"][1]["evidence_refs"] = [];
      }),
      "evidence_ref_missing",
      "candidate.roles[1].evidence_refs",
    );
  });

  it("accepts an entry whose evidence is complete", () => {
    const entry = mutateEntry(adapterEntry(), (e) => {
      e["upstream"]["archive_state"] = "not_archived";
      e["evidence"].push({
        ...clone(e["evidence"][1]),
        evidence_id: "ev-see-license",
      });
      e["evidence"][2]["evidence_kind"] = "license";
      e["evidence"][2]["locator"]["path"] = "LICENSE";
      e["evidence"][2]["locator"]["source_url"] = e["evidence"][2]["locator"][
        "source_url"
      ].replace(/README\.md$/, "LICENSE");
      e["licensing"]["code"] = {
        status: "evidenced",
        declared_identifier: "Apache-2.0",
        evidence_refs: ["ev-see-license"],
      };
    });
    const valid = assertValid(entry);
    assert.deepEqual(valid.evidence_gaps, []);
    assert.equal(valid.evidence_completeness, "complete");
    assert.deepEqual(valid.lifecycle, DECISION_CANDIDATE_LIFECYCLE);
  });

  it("accepts an unresolved license as an evidence state that grants nothing", () => {
    const entry = assertValid(adapterEntry());
    assert.equal(entry.licensing.code.status, "unresolved");
    assert.equal(entry.licensing.code.declared_identifier, null);
    assert.ok(entry.evidence_gaps.includes("code_license_unresolved"));
    assert.equal(entry.evidence_completeness, "incomplete");
    assert.equal(entry.lifecycle.execution_enabled, false);
    assert.equal(entry.lifecycle.benchmark_execution_enabled, false);
    assert.equal(entry.lifecycle.promotion_eligible, false);
    assert.equal(entry.lifecycle.production_eligible, false);
  });

  it("derives evidence gaps deterministically and rejects a declared mismatch", () => {
    const entry = modelEntry();
    assert.deepEqual(deriveDecisionCandidateEvidenceGaps(entry as never), [
      "base_model_license_unresolved",
      "training_data_provenance_incomplete",
      "weights_license_unresolved",
    ]);
    assertIssue(
      mutateEntry(entry, (e) => (e["evidence_gaps"] = []), false),
      "evidence_gaps_mismatch",
    );
    assertIssue(
      mutateEntry(
        entry,
        (e) => (e["evidence_completeness"] = "complete"),
        false,
      ),
      "evidence_completeness_mismatch",
    );
  });
});

describe("AI-142 candidate entry: pinned upstream revision", () => {
  it("rejects a mutable-only upstream reference", () => {
    for (const ref of ["main", "HEAD", "v1.0.0", "refs/heads/main"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream"]["pinned_commit_sha"] = ref;
        }),
        "upstream_revision_unpinned",
        "candidate.upstream.pinned_commit_sha",
      );
  });

  it("rejects an invalid commit SHA", () => {
    const sha = modelEntry()["upstream"]["pinned_commit_sha"] as string;
    for (const bad of [sha.slice(0, 7), sha.slice(0, 39), sha.toUpperCase()])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream"]["pinned_commit_sha"] = bad;
        }),
        "commit_sha_invalid",
        "candidate.upstream.pinned_commit_sha",
      );
  });

  it("rejects evidence not bound to the pinned commit or repository", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"][0]["locator"]["commit_sha"] = "f".repeat(40);
      }),
      "evidence_commit_mismatch",
      "candidate.evidence[0].locator.commit_sha",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"][0]["locator"]["repository"] = "someone-else/project";
      }),
      "evidence_repository_mismatch",
    );
  });

  it("rejects mutable-only evidence locators", () => {
    const repo = modelEntry()["upstream"]["repository"] as string;
    for (const url of [
      `https://github.com/${repo}/blob/main/README.md`,
      `https://raw.githubusercontent.com/${repo}/main/README.md`,
      `https://github.com/${repo}`,
      `https://github.com/${repo}/tree/main`,
    ])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["evidence"][2]["locator"]["source_url"] = url;
        }),
        "mutable_evidence_reference",
        "candidate.evidence[2].locator.source_url",
      );
  });

  it("requires file evidence to carry path, blob SHA and content hash", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"][2]["locator"]["blob_sha"] = null;
      }),
      "evidence_hash_invalid",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"][2]["locator"]["path"] = "../README.md";
      }),
      "evidence_locator_invalid",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"][2]["content_sha256"] = "abc";
      }),
      "evidence_hash_invalid",
    );
  });

  it("rejects a repository URL that does not match the resolved repository", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["upstream"]["repository_url"] = "https://example.com/elsewhere";
      }),
      "repository_url_mismatch",
    );
  });

  it("records a redirect explicitly instead of hiding it", () => {
    const entry = assertValid(
      mutateEntry(modelEntry(), (e) => {
        e["upstream"]["requested_repository"] = "ai-lab-fixtures/old-name";
      }),
    );
    assert.notEqual(
      entry.upstream.requested_repository,
      entry.upstream.repository,
    );
  });

  it("rejects malformed timestamps", () => {
    for (const bad of [
      "2026-02-30T00:00:00Z",
      "2026-09-26",
      "2026-09-26T12:00:00+00:00",
    ])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream"]["observed_at"] = bad;
        }),
        "timestamp_invalid",
      );
  });
});

describe("AI-142 candidate entry: evidence and claims", () => {
  it("rejects duplicate evidence ids", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"][1]["evidence_id"] = "ev-license";
      }),
      "duplicate_evidence_id",
    );
  });

  it("rejects out-of-order evidence without re-sorting it", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"].reverse();
      }),
      "evidence_order_invalid",
    );
  });

  it("rejects a reference to an unknown evidence id", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["upstream_claims"][0]["evidence_refs"] = ["ev-unknown"];
      }),
      "evidence_ref_unknown",
    );
  });

  it("rejects an upstream claim without evidence", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["upstream_claims"][0]["evidence_refs"] = [];
      }),
      "evidence_ref_missing",
      "candidate.upstream_claims[0].evidence_refs",
    );
  });

  it("never admits a claim as AI LAB verified", () => {
    for (const verification of ["ai_lab_verified", "verified", "confirmed"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream_claims"][0]["verification"] = verification;
        }),
        "claim_verification_invalid",
      );
  });

  it("rejects duplicate claim ids and unknown claim kinds", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["upstream_claims"][1]["claim_id"] = "claim-execution-surface";
      }),
      "duplicate_claim_id",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["upstream_claims"][0]["claim_kind"] = "leaderboard_position";
      }),
      "claim_kind_invalid",
    );
  });

  it("rejects an unknown candidate role", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["roles"][0]["role"] = "typed_decision_oracle";
      }),
      "role_unknown",
    );
  });
});

describe("AI-142 candidate entry: layered licensing", () => {
  it("rejects malformed license evidence: evidenced without identifier", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["code"]["declared_identifier"] = null;
      }),
      "license_identifier_inconsistent",
      "candidate.licensing.code.declared_identifier",
    );
  });

  it("rejects an identifier on an unresolved or not-applicable layer", () => {
    assertIssue(
      mutateEntry(adapterEntry(), (e) => {
        e["licensing"]["code"]["declared_identifier"] = "MIT";
      }),
      "license_identifier_inconsistent",
    );
    assertIssue(
      mutateEntry(adapterEntry(), (e) => {
        e["licensing"]["base_model"]["declared_identifier"] = "Apache-2.0";
      }),
      "license_identifier_inconsistent",
    );
  });

  it("never establishes a license from a README, manifest or metadata alone", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["code"]["evidence_refs"] = [README];
      }),
      "license_evidence_insufficient",
      "candidate.licensing.code.evidence_refs",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["code"]["evidence_refs"] = ["ev-metadata"];
      }),
      "license_evidence_insufficient",
    );
  });

  it("keeps the weight license independent from the code license", () => {
    const entry = assertValid(modelEntry());
    assert.equal(entry.licensing.code.status, "evidenced");
    assert.equal(entry.licensing.weights.involvement, "involved");
    assert.equal(entry.licensing.weights.status, "unresolved");
    assert.equal(entry.licensing.weights.declared_identifier, null);
    // A README describing the weights never establishes their license.
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["weights"]["status"] = "evidenced";
        e["licensing"]["weights"]["declared_identifier"] = "MIT";
      }),
      "license_evidence_insufficient",
      "candidate.licensing.weights.evidence_refs",
    );
    // Nor does the code LICENSE: the weight and base-model layers are never
    // inferred from the code layer's evidence.
    for (const layer of ["weights", "base_model"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["licensing"][layer]["status"] = "evidenced";
          e["licensing"][layer]["declared_identifier"] = "MIT";
          e["licensing"][layer]["evidence_refs"] = ["ev-license"];
        }),
        "license_layer_inferred",
        `candidate.licensing.${layer}.evidence_refs`,
      );
    // A separate weight license document is admitted as its own evidence.
    const own = assertValid(
      mutateEntry(modelEntry(), (e) => {
        e["evidence"].push({
          ...clone(e["evidence"][2]),
          evidence_id: "ev-weights-card",
          evidence_kind: "model_card",
        });
        e["licensing"]["weights"]["status"] = "evidenced";
        e["licensing"]["weights"]["declared_identifier"] = "CC-BY-4.0";
        e["licensing"]["weights"]["evidence_refs"] = ["ev-weights-card"];
      }),
    );
    assert.equal(own.licensing.weights.declared_identifier, "CC-BY-4.0");
    assert.equal(own.licensing.code.declared_identifier, "MIT");
  });

  it("never lets a candidate's notice about a third party establish a license", () => {
    for (const layer of ["weights", "base_model"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["evidence"].push({
            ...clone(e["evidence"][2]),
            evidence_id: "ev-third-party",
            evidence_kind: "third_party_notice",
          });
          e["licensing"][layer]["status"] = "evidenced";
          e["licensing"][layer]["declared_identifier"] = "Apache-2.0";
          e["licensing"][layer]["evidence_refs"] = ["ev-third-party"];
        }),
        "license_evidence_insufficient",
        `candidate.licensing.${layer}.evidence_refs`,
      );
  });

  it("enforces weights involvement, location and status consistency", () => {
    assertIssue(
      mutateEntry(adapterEntry(), (e) => {
        e["licensing"]["weights"]["status"] = "unresolved";
      }),
      "weights_inconsistent",
      "candidate.licensing.weights.status",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["weights"]["location"] = "not_applicable";
        e["licensing"]["weights"]["declared_reference"] = null;
      }),
      "weights_inconsistent",
      "candidate.licensing.weights.location",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["weights"]["declared_reference"] = null;
      }),
      "weights_inconsistent",
      "candidate.licensing.weights.declared_reference",
    );
    const unresolved = assertValid(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["weights"] = {
          involvement: "unresolved",
          location: "unresolved",
          declared_reference: null,
          status: "unresolved",
          declared_identifier: null,
          evidence_refs: [],
        };
      }),
    );
    assert.ok(
      unresolved.evidence_gaps.includes("weights_involvement_unresolved"),
    );
    assert.ok(unresolved.evidence_gaps.includes("weights_location_unresolved"));
  });

  it("requires a declared base name for an evidenced base-model license", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["base_model"] = {
          status: "evidenced",
          declared_name: null,
          declared_identifier: "Apache-2.0",
          evidence_refs: ["ev-license"],
        };
      }),
      "base_model_inconsistent",
    );
  });

  it("requires evidence for evidenced or partially evidenced training data", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["training_data"]["status"] = "partially_evidenced";
      }),
      "evidence_ref_missing",
      "candidate.licensing.training_data.evidence_refs",
    );
    const partial = assertValid(
      mutateEntry(modelEntry(), (e) => {
        e["licensing"]["training_data"] = {
          status: "partially_evidenced",
          evidence_refs: [README],
        };
      }),
    );
    assert.ok(
      partial.evidence_gaps.includes("training_data_provenance_incomplete"),
    );
  });

  it("rejects legal or commercial approval language anywhere", () => {
    for (const text of [
      "Commercially safe for any use.",
      "Commercial use approved by upstream.",
      "Legally cleared weights.",
    ])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream_claims"][0]["statement"] = text;
        }),
        "legal_conclusion_forbidden",
      );
  });
});

describe("AI-142 candidate entry: authority and secrets fail closed", () => {
  it("rejects provider, model and credential fields", () => {
    for (const key of ["api_key", "token", "provider", "model_id", "secret"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream"][key] = "x";
        }),
        "forbidden_field",
      );
  });

  it("rejects credential-shaped values", () => {
    for (const value of [
      `ghp_${"a".repeat(36)}`,
      `hf_${"B".repeat(34)}`,
      "https://user:pass@github.com/x/y",
    ])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream_claims"][0]["statement"] = value;
        }),
        "credential_value_forbidden",
      );
  });

  it("rejects private reasoning", () => {
    for (const key of ["reasoning", "chain_of_thought", "scratchpad"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["upstream_claims"][0][key] = "hidden";
        }),
        "private_reasoning_forbidden",
      );
  });

  for (const flag of [
    "ai_lab_executed",
    "execution_enabled",
    "benchmark_execution_enabled",
    "promotion_eligible",
    "production_eligible",
    "routing_enabled",
  ])
    it(`rejects lifecycle.${flag}=true`, () => {
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["lifecycle"][flag] = true;
        }),
        "lifecycle_invalid",
        `candidate.lifecycle.${flag}`,
      );
    });

  it("admits only the discovered registry state", () => {
    for (const state of [
      "approved",
      "sandbox_only",
      "benchmark_candidate",
      "shadow",
      "canary",
      "preferred",
    ])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["lifecycle"]["registry_state"] = state;
        }),
        "lifecycle_invalid",
        "candidate.lifecycle.registry_state",
      );
  });

  it("rejects activation, approval, promotion, traffic and ranking fields", () => {
    for (const [where, key] of [
      ["lifecycle", "approval_ref"],
      ["lifecycle", "approved_by"],
      ["lifecycle", "activation"],
      ["lifecycle", "kill_switch"],
      ["lifecycle", "traffic_stage"],
      ["upstream", "command"],
      ["upstream", "install_command"],
      ["", "promotion"],
      ["", "score"],
      ["", "tier"],
      ["", "winner"],
    ] as const)
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          (where === "" ? e : e[where])[key] = true;
        }),
        "authority_field_forbidden",
      );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["lifecycle"]["authority"] = "execution";
      }),
      "lifecycle_invalid",
    );
  });

  it("rejects unknown properties and an unsupported schema major", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["notes"] = "extra";
      }),
      "unknown_property",
      "candidate.notes",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["schema_version"] = "2.0.0";
      }),
      "schema_version_unsupported",
    );
  });

  it("rejects malformed candidate ids", () => {
    for (const id of ["laya", "TDC-x", "tdc-", "tdc-Upper", "tdc x"])
      assertIssue(
        mutateEntry(modelEntry(), (e) => {
          e["candidate_id"] = id;
        }),
        "candidate_id_invalid",
      );
  });
});

describe("AI-142 candidate entry: identity, revision and hashing", () => {
  it("binds the candidate hash under its own domain and excludes the self-hash", () => {
    assert.equal(
      DECISION_CANDIDATE_HASH_DOMAIN,
      "vlatam-ai-lab:typed-decision-candidate:v1",
    );
    const entry = modelEntry();
    const hash = computeDecisionCandidateHash(entry as DecisionCandidateEntry);
    assert.equal(hash, entry["candidate_hash"]);
    assert.equal(
      computeDecisionCandidateHash({
        ...entry,
        candidate_hash: "0".repeat(64),
      } as DecisionCandidateEntry),
      hash,
    );
  });

  it("rejects candidate hash tampering", () => {
    const tampered = modelEntry();
    tampered["display_name"] = "Renamed without rehash";
    assertIssue(tampered, "candidate_hash_mismatch");
    const flipped = modelEntry();
    flipped["candidate_hash"] = "0".repeat(64);
    assertIssue(flipped, "candidate_hash_mismatch");
  });

  it("changes the candidate hash when the pinned revision or evidence changes", () => {
    const base = modelEntry();
    const newCommit = mutateEntry(base, (e) => {
      const next = "fedcba9876543210fedcba9876543210fedcba98";
      e["upstream"]["pinned_commit_sha"] = next;
      for (const ev of e["evidence"] as Mutable[]) {
        ev["locator"]["source_url"] = ev["locator"]["source_url"].replace(
          ev["locator"]["commit_sha"],
          next,
        );
        ev["locator"]["commit_sha"] = next;
      }
    });
    assertValid(newCommit);
    assert.notEqual(newCommit["candidate_hash"], base["candidate_hash"]);
    const newEvidence = mutateEntry(base, (e) => {
      e["evidence"][2]["content_sha256"] = "1".repeat(64);
    });
    assert.notEqual(newEvidence["candidate_hash"], base["candidate_hash"]);
  });

  it("keeps candidate identity distinct from its evidence revision", () => {
    const first = modelEntry();
    const second = mutateEntry(first, (e) => {
      e["evidence_revision"] = 2;
      e["supersedes"] = {
        evidence_revision: 1,
        candidate_hash: first["candidate_hash"],
      };
      e["evidence"][2]["content_sha256"] = "2".repeat(64);
    });
    assertValid(second);
    const succession = validateDecisionCandidateSuccession(first, second);
    assert.equal(succession.ok, true, JSON.stringify(succession));
    assert.equal(second["candidate_id"], first["candidate_id"]);
    assert.notEqual(second["candidate_hash"], first["candidate_hash"]);

    const renamed = mutateEntry(second, (e) => {
      e["candidate_id"] = "tdc-fixture-renamed";
    });
    assert.deepEqual(
      codes(validateDecisionCandidateSuccession(first, renamed)),
      ["succession_identity_mismatch"],
    );
    const skipped = mutateEntry(second, (e) => {
      e["evidence_revision"] = 3;
      e["supersedes"]["evidence_revision"] = 2;
    });
    assert.ok(
      codes(validateDecisionCandidateSuccession(first, skipped)).includes(
        "succession_revision_invalid",
      ),
    );
    const unbound = mutateEntry(second, (e) => {
      e["supersedes"]["candidate_hash"] = "3".repeat(64);
    });
    assert.ok(
      codes(validateDecisionCandidateSuccession(first, unbound)).includes(
        "succession_supersedes_mismatch",
      ),
    );
  });

  it("requires supersedes to be null exactly at revision 1", () => {
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["supersedes"] = {
          evidence_revision: 0,
          candidate_hash: "4".repeat(64),
        };
      }),
      "supersedes_invalid",
    );
    assertIssue(
      mutateEntry(modelEntry(), (e) => {
        e["evidence_revision"] = 2;
      }),
      "supersedes_invalid",
    );
  });

  it("never mutates, reorders or repairs its input", () => {
    const entry = mutateEntry(modelEntry(), (e) => e["evidence"].reverse());
    const before = JSON.stringify(entry);
    validateDecisionCandidateEntry(entry);
    assert.equal(JSON.stringify(entry), before);
    const valid = modelEntry();
    const snapshot = JSON.stringify(valid);
    rehashEntry(clone(valid));
    validateDecisionCandidateEntry(valid);
    assert.equal(JSON.stringify(valid), snapshot);
  });
});
