import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import { renderOperatorConsole } from "../../src/operator/operator-console.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";
import {
  ARCA_REGULATORY_BATCH_ASSET_PATHS,
  ARCA_REGULATORY_TARGET_NUMBERS,
  computeArcaRegulatoryCanonicalHash,
  computeArcaRegulatoryReviewPackageHash,
  evaluateArcaSourceAgreement,
  loadArcaRegulatoryBatch,
  validateArcaRegulatoryArtifact,
  type ArcaRegulatoryArtifact,
} from "../../src/regulatory/arca-regulatory-batch.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const batch = loadArcaRegulatoryBatch(root);
const artifactByNumber = (number: number) =>
  batch.artifacts.find((artifact) => artifact.instrument_number === number)!;

const applyFormats = ((addFormatsModule as unknown as { default?: unknown })
  .default ?? addFormatsModule) as (ajv: AjvClass) => void;

const compileSchema = (path: string) => {
  const ajv = new AjvClass({ allErrors: true, strict: true });
  applyFormats(ajv);
  return ajv.compile(
    JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<
      string,
      unknown
    >,
  );
};

describe("AI-137 first real governed ARCA regulatory batch", () => {
  it("contains exactly RG 5859, 5845, and 5838 in the requested order", () => {
    assert.deepEqual(
      batch.artifacts.map((artifact) => artifact.regulation_number),
      [...ARCA_REGULATORY_TARGET_NUMBERS],
    );
    assert.equal(batch.artifacts.length, 3);
    for (const artifact of batch.artifacts) {
      assert.equal(artifact.regulation_year, 2026);
      assert.equal(
        artifact.official_identifier,
        `Resolución General ARCA ${artifact.regulation_number}/2026`,
      );
    }
  });

  it("validates all artifacts and review packages against their JSON schemas", () => {
    const validateArtifact = compileSchema(
      "schemas/arca-regulatory-artifact.schema.json",
    );
    const validateReview = compileSchema(
      "schemas/arca-regulatory-review-package.schema.json",
    );
    for (const artifact of batch.artifacts)
      assert.equal(
        validateArtifact(artifact),
        true,
        JSON.stringify(validateArtifact.errors),
      );
    for (const review of batch.review_packages)
      assert.equal(
        validateReview(review),
        true,
        JSON.stringify(validateReview.errors),
      );
  });

  it("binds every artifact to both authorized official source domains", () => {
    for (const artifact of batch.artifacts) {
      assert.deepEqual(
        artifact.official_source_urls.map((source) => source.source_id),
        ["arca_biblioteca", "boletin_oficial"],
      );
      for (const source of artifact.official_source_urls)
        assert.ok(
          ["biblioteca.arca.gob.ar", "www.boletinoficial.gob.ar"].includes(
            new URL(source.url).hostname,
          ),
        );
      assert.ok(
        artifact.official_source_urls.every((source) =>
          /^[a-f0-9]{64}$/.test(source.sha256),
        ),
      );
    }
  });

  it("preserves exact official text with its SHA-256 hash", async () => {
    const { createHash } = await import("node:crypto");
    for (const artifact of batch.artifacts)
      assert.equal(
        createHash("sha256").update(artifact.official_text).digest("hex"),
        artifact.source_hashes.official_text_sha256,
      );
  });

  it("rejects changed official text even when the canonical hash is recomputed", () => {
    const artifact = structuredClone(
      artifactByNumber(5859),
    ) as unknown as Record<string, unknown>;
    artifact["official_text"] =
      `${artifact["official_text"] as string}\nALTERADO`;
    artifact["canonical_hash"] = computeArcaRegulatoryCanonicalHash(artifact);
    assert.throws(
      () => validateArcaRegulatoryArtifact(artifact),
      /source_hash_binding_invalid/,
    );
  });

  it("records one matching official annex for RG 5859", () => {
    const artifact = artifactByNumber(5859);
    assert.equal(artifact.annexes.length, 1);
    assert.equal(
      artifact.annexes[0]?.document_number,
      "IF-2026-01712669-ARCA-SGDADVCOAD#SDGINS",
    );
    assert.equal(artifact.annexes[0]?.source_match, true);
  });

  it("records that RG 5845 has no separate official annex", () => {
    assert.deepEqual(artifactByNumber(5845).annexes, []);
  });

  it("records all three byte-matched official annexes for RG 5838", () => {
    const annexes = artifactByNumber(5838).annexes;
    assert.equal(annexes.length, 3);
    assert.deepEqual(
      annexes.map((annex) => annex.page_count),
      [3, 2, 1],
    );
    for (const annex of annexes) {
      assert.equal(annex.arca_sha256, annex.boletin_sha256);
      assert.equal(annex.sha256, annex.arca_sha256);
    }
  });

  it("computes deterministic canonical artifact hashes", () => {
    for (const artifact of batch.artifacts) {
      assert.equal(
        computeArcaRegulatoryCanonicalHash(artifact),
        artifact.canonical_hash,
      );
      assert.equal(
        computeArcaRegulatoryCanonicalHash(structuredClone(artifact)),
        artifact.canonical_hash,
      );
    }
  });

  it("computes deterministic review package hashes and exact bindings", () => {
    batch.review_packages.forEach((review, index) => {
      assert.equal(
        review.artifact_canonical_hash,
        batch.artifacts[index]?.canonical_hash,
      );
      assert.equal(
        computeArcaRegulatoryReviewPackageHash(review),
        review.review_package_hash,
      );
    });
  });

  it("keeps all three real items pending human decision with an evidence-only recommendation", () => {
    assert.equal(batch.pending_count, 3);
    assert.equal(batch.approved_count, 0);
    for (const review of batch.review_packages) {
      assert.equal(review.lifecycle, "pending_human_review");
      assert.equal(review.review_status, "pending_human_review");
      assert.equal(review.recommendation, "eligible_for_human_review");
      assert.equal(review.reviewer, null);
      assert.equal(review.decision_timestamp, null);
    }
  });

  it("keeps every artifact and review package unpublished", () => {
    for (const artifact of batch.artifacts) {
      assert.equal(artifact.not_published, true);
      assert.equal(artifact.publication_status, "not_published");
      assert.equal(artifact.review_status, "pending_human_review");
    }
    for (const review of batch.review_packages) {
      assert.equal(review.not_published, true);
      assert.equal(review.publication_status, "not_published");
    }
  });

  it("fails closed on a cross-source metadata or text mismatch", () => {
    const result = evaluateArcaSourceAgreement({
      fields_match: false,
      official_text_match: false,
      expected_annex_count: 0,
      annex_hash_pairs: [],
    });
    assert.equal(result.status, "mismatch");
    assert.equal(result.review_eligible, false);
    assert.deepEqual(result.reason_codes, [
      "official_metadata_mismatch",
      "official_text_mismatch",
    ]);
  });

  it("fails closed when an expected official annex is missing", () => {
    const result = evaluateArcaSourceAgreement({
      fields_match: true,
      official_text_match: true,
      expected_annex_count: 1,
      annex_hash_pairs: [],
    });
    assert.equal(result.review_eligible, false);
    assert.deepEqual(result.reason_codes, ["official_annex_missing"]);
  });

  it("rejects a truncated annex set even when the artifact hash is recomputed", () => {
    const artifact = structuredClone(
      artifactByNumber(5838),
    ) as unknown as Record<string, unknown>;
    artifact["annexes"] = (
      artifact["annexes"] as ArcaRegulatoryArtifact["annexes"]
    ).slice(0, 2);
    artifact["canonical_hash"] = computeArcaRegulatoryCanonicalHash(artifact);
    assert.throws(
      () => validateArcaRegulatoryArtifact(artifact),
      /official_annex_missing/,
    );
  });

  it("records modification, implementation, and abrogation relationships", () => {
    assert.deepEqual(
      artifactByNumber(5859).supersedes_or_modifies.map(
        (relationship) => relationship.relationship,
      ),
      ["implements"],
    );
    assert.deepEqual(
      artifactByNumber(5845).supersedes_or_modifies.map(
        (relationship) => relationship.relationship,
      ),
      ["modifies", "modifies"],
    );
    assert.deepEqual(
      artifactByNumber(5838).supersedes_or_modifies.map(
        (relationship) => relationship.relationship,
      ),
      ["abrogates", "abrogates"],
    );
    assert.equal(artifactByNumber(5845).modifies.length, 2);
    assert.equal(artifactByNumber(5838).repeals.length, 2);
    for (const artifact of batch.artifacts) {
      assert.deepEqual(artifact.modified_by, []);
      assert.deepEqual(artifact.repealed_by, []);
      assert.deepEqual(artifact.supersedes, []);
      assert.deepEqual(artifact.superseded_by, []);
    }
  });

  it("binds complete review summaries to the canonical evidence", () => {
    batch.review_packages.forEach((review, index) => {
      const artifact = batch.artifacts[index]!;
      assert.deepEqual(review.source_hashes, artifact.source_hashes);
      assert.equal(review.official_source_summary.length, 2);
      assert.equal(review.cross_source_comparison_result.status, "matched");
      assert.deepEqual(
        review.cross_source_comparison_result.discrepancy_classifications,
        [],
      );
      assert.equal(review.annex_completeness.complete, true);
      assert.equal(
        review.annex_completeness.acquired_count,
        artifact.annexes.length,
      );
      assert.deepEqual(review.unresolved_discrepancies, []);
      assert.ok(
        Object.values(review.reviewer_checklist).every(
          (completed) => completed === false,
        ),
      );
    });
  });

  it("renders the three real pending items with sources, hashes, and annexes", async () => {
    const model = await loadRepositoryOperatorReadModel({
      repository_root: root,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    const html = renderOperatorConsole(model, "/operator/arca-review");
    for (const number of ARCA_REGULATORY_TARGET_NUMBERS) {
      assert.match(
        html,
        new RegExp(`Resolución General ARCA N° ${number}/2026`),
      );
      assert.match(html, new RegExp(artifactByNumber(number).canonical_hash));
    }
    assert.match(html, /Biblioteca ARCA/);
    assert.match(html, /Boletín Oficial/);
    assert.match(html, /Anexo III/);
    assert.match(html, /Verificación de fuentes/);
    assert.match(html, /Anexos completos/);
  });

  it("packages only the exact three artifacts and three review packages", () => {
    assert.equal(ARCA_REGULATORY_BATCH_ASSET_PATHS.length, 6);
    assert.equal(
      ARCA_REGULATORY_BATCH_ASSET_PATHS.filter((path) =>
        path.endsWith(".artifact.json"),
      ).length,
      3,
    );
    assert.equal(
      ARCA_REGULATORY_BATCH_ASSET_PATHS.filter((path) =>
        path.endsWith(".review.json"),
      ).length,
      3,
    );
    for (const path of ARCA_REGULATORY_BATCH_ASSET_PATHS)
      assert.doesNotMatch(path, /\*|raw|temp|fixture/i);
  });

  it("keeps the previous synthetic tariff fixture explicitly test-only", async () => {
    const model = await loadRepositoryOperatorReadModel({
      repository_root: root,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    assert.equal(
      model.arca_candidate_review.source_context.synthetic_candidate,
      true,
    );
    assert.equal(
      model.arca_candidate_review.source_context.fixture_kind,
      "repository_pending_example",
    );
    assert.ok(
      model.arca_regulatory_batch?.artifacts.every(
        (artifact) => !artifact.artifact_id.includes("fixture"),
      ),
    );
    assert.match(
      renderOperatorConsole(model, "/operator/arca-review"),
      /fixture arancelario: solo pruebas/i,
    );
  });

  it("keeps the governed ARCA scheduler inactive", () => {
    const scheduler = JSON.parse(
      readFileSync(
        resolve(root, "config/ai-133-governed-arca-scheduler.json"),
        "utf8",
      ),
    ) as { active: boolean };
    assert.equal(scheduler.active, false);
    assert.equal(batch.scheduler_active, false);
  });

  it("keeps all three ARCA kill switches active", () => {
    for (const path of [
      "config/ai-131-controlled-live-arca-kill-switch.json",
      "config/ai-132-governed-arca-export-kill-switch.json",
      "config/ai-133-governed-arca-scheduler-kill-switch.json",
    ]) {
      const value = JSON.parse(readFileSync(resolve(root, path), "utf8")) as {
        state: string;
      };
      assert.equal(value.state, "active", path);
    }
  });

  it("adds no runtime ARCA execution capability", () => {
    assert.equal(batch.runtime_arca_execution_available, false);
    const source = readFileSync(
      resolve(root, "src/regulatory/arca-regulatory-batch.ts"),
      "utf8",
    );
    assert.doesNotMatch(source, /\bfetch\s*\(|https\.request|undici|axios/);
  });

  it("grants no publication or database-write authority", () => {
    assert.equal(batch.publication_authorized, false);
    assert.equal(batch.database_write_authorized, false);
    for (const artifact of batch.artifacts)
      assert.equal(artifact.review_status, "pending_human_review");
  });

  it("performs no legal interpretation and displays the Spanish disclaimer", () => {
    assert.equal(batch.legal_interpretation_performed, false);
    for (const artifact of batch.artifacts) {
      assert.equal(artifact.interpretation_status, "not_interpreted");
      assert.match(
        artifact.disclaimer,
        /no constituye asesoramiento legal o aduanero vinculante/i,
      );
    }
  });
});
