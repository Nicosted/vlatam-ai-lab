import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { Ajv2020 as AjvClass } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import {
  APPLICATION_ROUTES,
  APPLICATION_SECTIONS,
  APPLICATION_SHELL_JS,
} from "../../src/application/application-shell.js";
import { renderOperatorConsole } from "../../src/operator/operator-console.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";
import {
  ARCA_HUMAN_DECISION_ASSET_PATHS,
  ARCA_HUMAN_REVIEWER_NAME,
  ARCA_PUBLICATION_RECORD_ASSET_PATHS,
  ARCA_READ_ONLY_LIBRARY_ASSET_PATHS,
  ARCA_READ_ONLY_LIBRARY_DISCLAIMER,
  arcaLibraryItemMatchesQuery,
  computeArcaHumanDecisionHash,
  computeArcaPublicationRecordHash,
  loadArcaReadOnlyLibrary,
  validateArcaHumanReviewDecision,
  validateArcaReadOnlyPublicationRecord,
} from "../../src/regulatory/arca-read-only-library.js";
import { loadArcaRegulatoryBatch } from "../../src/regulatory/arca-regulatory-batch.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceBatch = loadArcaRegulatoryBatch(root);
const library = loadArcaReadOnlyLibrary(root, sourceBatch);
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

const itemAt = (index: number) => library.items[index]!;
const mutableRecord = (value: unknown): Record<string, unknown> =>
  structuredClone(value) as Record<string, unknown>;

describe("AI-139 ARCA read-only regulatory library", () => {
  it("loads exactly three immutable human decisions with the declared identity and scope", () => {
    assert.equal(library.human_decisions.length, 3);
    for (const decision of library.human_decisions) {
      assert.equal(decision.reviewer_type, "human");
      assert.equal(decision.reviewer_name, ARCA_HUMAN_REVIEWER_NAME);
      assert.equal(
        decision.reviewer_identity_source,
        "explicit_user_declaration",
      );
      assert.equal(decision.decision_date, "2026-07-28");
      assert.deepEqual(decision.reviewed_scope, [
        "official_text",
        "official_source_references",
        "annex_completeness",
      ]);
      assert.equal(
        decision.reviewer_statement,
        "The reviewer manually checked the three regulations and confirmed that their official texts, source references and annexes are correct.",
      );
      assert.equal(
        computeArcaHumanDecisionHash(decision),
        decision.decision_record_hash,
      );
    }
  });

  it("binds every decision to the exact canonical artifact and review-package hashes", () => {
    library.items.forEach((item, index) => {
      assert.equal(
        item.human_decision.canonical_artifact_hash,
        sourceBatch.artifacts[index]?.canonical_hash,
      );
      assert.equal(
        item.human_decision.review_package_hash,
        sourceBatch.review_packages[index]?.review_package_hash,
      );
    });
    assert.deepEqual(
      library.human_decisions.map((decision) => decision.decision_record_hash),
      [
        "cc5fe0a4cbc8f0040faab77e7b3cd8d0d3bd0090b01b33b2958d9b46faee1be4",
        "f61d126cd5d62c7e7aeb918e969bea051a3d9cc87fc78624e83e837ca6006bb3",
        "8e933b9f31c540150cd9a3e1a7f1acd9b5c4f705377e8924ec27aa27d2f6f3d7",
      ],
    );
  });

  it("fails closed on changed artifact or review-package hashes", () => {
    const { artifact, review_package: review, human_decision } = itemAt(0);
    const artifactMismatch = mutableRecord(human_decision);
    artifactMismatch["canonical_artifact_hash"] = "f".repeat(64);
    artifactMismatch["decision_record_hash"] =
      computeArcaHumanDecisionHash(artifactMismatch);
    assert.throws(
      () => validateArcaHumanReviewDecision(artifactMismatch, artifact, review),
      /binding_mismatch/,
    );

    const reviewMismatch = mutableRecord(human_decision);
    reviewMismatch["review_package_hash"] = "f".repeat(64);
    reviewMismatch["decision_record_hash"] =
      computeArcaHumanDecisionHash(reviewMismatch);
    assert.throws(
      () => validateArcaHumanReviewDecision(reviewMismatch, artifact, review),
      /binding_mismatch/,
    );
  });

  it("fails closed on automated, missing, or unknown reviewer identities", () => {
    const { artifact, review_package: review, human_decision } = itemAt(0);
    const automated = mutableRecord(human_decision);
    automated["reviewer_type"] = "automated";
    automated["decision_record_hash"] = computeArcaHumanDecisionHash(automated);
    assert.throws(
      () => validateArcaHumanReviewDecision(automated, artifact, review),
      /reviewer_invalid/,
    );

    const missing = mutableRecord(human_decision);
    delete missing["reviewer_name"];
    missing["decision_record_hash"] = computeArcaHumanDecisionHash(missing);
    assert.throws(
      () => validateArcaHumanReviewDecision(missing, artifact, review),
      /unknown_fields/,
    );

    const unknown = mutableRecord(human_decision);
    unknown["professional_licence"] = "invented";
    unknown["decision_record_hash"] = computeArcaHumanDecisionHash(unknown);
    assert.throws(
      () => validateArcaHumanReviewDecision(unknown, artifact, review),
      /unknown_fields/,
    );
  });

  it("fails closed on rejected, expired, invalid, or superseded decisions", () => {
    const { artifact, review_package: review, human_decision } = itemAt(0);
    for (const [field, value] of [
      ["decision", "rejected"],
      ["expiration_status", "expired"],
      ["decision_validity", "invalid"],
      ["supersession_status", "superseded"],
    ] as const) {
      const changed = mutableRecord(human_decision);
      changed[field] = value;
      changed["decision_record_hash"] = computeArcaHumanDecisionHash(changed);
      assert.throws(
        () => validateArcaHumanReviewDecision(changed, artifact, review),
        /not_current_approval/,
        field,
      );
    }
  });

  it("loads exactly three immutable publication records with exact decision bindings", () => {
    assert.equal(library.publication_records.length, 3);
    library.items.forEach((item) => {
      assert.equal(
        item.publication_record.human_decision_hash,
        item.human_decision.decision_record_hash,
      );
      assert.equal(
        computeArcaPublicationRecordHash(item.publication_record),
        item.publication_record.publication_record_hash,
      );
      assert.equal(
        item.publication_record.disclaimer,
        ARCA_READ_ONLY_LIBRARY_DISCLAIMER,
      );
    });
    assert.deepEqual(
      library.publication_records.map(
        (publication) => publication.publication_record_hash,
      ),
      [
        "98aacb0ca9817a88d1210a861938fbb2e0a2a5642c82ddab60799b02dd520e65",
        "e6a8114f6689455b2e6109c2517a82f1b9d57df1bd969ac750a2e8bd9d27d6c0",
        "bf5f7bee951346ab8fb7e89afe4217a4bff912a4416500c57800c416704c8ce2",
      ],
    );
  });

  it("rejects changed decision bindings, revocation, and unknown publication values", () => {
    const {
      artifact,
      human_decision: decision,
      publication_record,
    } = itemAt(0);
    const changedBinding = mutableRecord(publication_record);
    changedBinding["human_decision_hash"] = "f".repeat(64);
    changedBinding["publication_record_hash"] =
      computeArcaPublicationRecordHash(changedBinding);
    assert.throws(
      () =>
        validateArcaReadOnlyPublicationRecord(
          changedBinding,
          artifact,
          decision,
        ),
      /binding_mismatch/,
    );

    const revoked = mutableRecord(publication_record);
    revoked["revocation_status"] = "revoked";
    revoked["publication_record_hash"] =
      computeArcaPublicationRecordHash(revoked);
    assert.throws(
      () => validateArcaReadOnlyPublicationRecord(revoked, artifact, decision),
      /not_eligible/,
    );
  });

  it("validates the decision and publication assets against closed registered schemas", () => {
    const validateDecision = compileSchema(
      "schemas/arca-human-review-decision.schema.json",
    );
    const validatePublication = compileSchema(
      "schemas/arca-read-only-publication-record.schema.json",
    );
    for (const decision of library.human_decisions)
      assert.equal(
        validateDecision(decision),
        true,
        JSON.stringify(validateDecision.errors),
      );
    for (const publication of library.publication_records)
      assert.equal(
        validatePublication(publication),
        true,
        JSON.stringify(validatePublication.errors),
      );
    const registry = JSON.parse(
      readFileSync(resolve(root, "schemas/schema-registry.json"), "utf8"),
    ) as { contracts: readonly { contract_name: string }[] };
    for (const name of [
      "arca_human_review_decision",
      "arca_read_only_publication_record",
    ])
      assert.ok(
        registry.contracts.some((contract) => contract.contract_name === name),
      );
  });

  it("contains exactly the three real regulations and excludes the synthetic fixture", () => {
    assert.deepEqual(
      library.items.map((item) => item.artifact.instrument_number),
      [5859, 5845, 5838],
    );
    assert.equal(library.items.length, 3);
    assert.equal(
      library.items.some((item) =>
        item.artifact.artifact_id.includes("fixture"),
      ),
      false,
    );
    assert.deepEqual(
      library.items.map((item) => item.artifact.annexes.length),
      [1, 0, 3],
    );
    assert.ok(
      library.items.every(
        (item) => item.artifact.official_source_urls.length === 2,
      ),
    );
  });

  it("searches by regulation number, title, and topic without external requests", () => {
    assert.deepEqual(
      library.items
        .filter((item) => arcaLibraryItemMatchesQuery(item, "5859"))
        .map((item) => item.artifact.instrument_number),
      [5859],
    );
    assert.deepEqual(
      library.items
        .filter((item) => arcaLibraryItemMatchesQuery(item, "Depósitos"))
        .map((item) => item.artifact.instrument_number),
      [5845],
    );
    assert.deepEqual(
      library.items
        .filter((item) => arcaLibraryItemMatchesQuery(item, "importación"))
        .map((item) => item.artifact.instrument_number),
      [5859],
    );
    assert.match(APPLICATION_SHELL_JS, /data-arca-library-search/);
    assert.doesNotMatch(
      APPLICATION_SHELL_JS,
      /\bfetch\s*\(|XMLHttpRequest|WebSocket/,
    );
  });

  it("renders the complete Spanish library with sources, dates, relationships, and technical hashes", async () => {
    const model = await loadRepositoryOperatorReadModel({
      repository_root: root,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    const html = renderOperatorConsole(model, "/operator/arca-library");
    assert.match(html, /Biblioteca normativa ARCA/);
    assert.equal([...html.matchAll(/data-arca-library-item/g)].length, 3);
    for (const item of library.items) {
      assert.match(
        html,
        new RegExp(`RG ${item.artifact.instrument_number}/2026`),
      );
      assert.match(html, new RegExp(item.artifact.canonical_hash));
      assert.match(html, new RegExp(item.human_decision.decision_record_hash));
    }
    for (const label of [
      "Fecha de publicación",
      "Fecha de emisión",
      "Vigencia",
      "Estado oficial actual",
      "Materia",
      "Anexos",
      "Fuentes oficiales",
      "Estado de revisión",
      "Revisor",
      "Fecha de revisión",
      "Relaciones y sustituciones",
      "Divulgación técnica",
    ])
      assert.match(html, new RegExp(label));
    assert.match(html, /Biblioteca ARCA oficial/);
    assert.match(html, /Boletín Oficial/);
    assert.match(html, new RegExp(ARCA_READ_ONLY_LIBRARY_DISCLAIMER));
  });

  it("keeps pending, approved, and published surfaces separate with no mutation controls", async () => {
    const model = await loadRepositoryOperatorReadModel({
      repository_root: root,
      evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
    });
    assert.equal(model.arca_regulatory_batch?.pending_count, 0);
    assert.equal(model.arca_regulatory_batch?.approved_count, 3);
    assert.equal(model.arca_regulatory_batch?.published_count, 3);
    const review = renderOperatorConsole(model, "/operator/arca-review");
    const approved = renderOperatorConsole(
      model,
      "/operator/approved-artifacts",
    );
    const published = renderOperatorConsole(model, "/operator/arca-library");
    assert.match(review, /0<\/strong>/);
    assert.match(approved, /Normas ARCA aprobadas/);
    assert.match(published, /Publicada · solo lectura/);
    for (const html of [review, approved, published]) {
      assert.doesNotMatch(html, /<form\b/i);
      assert.doesNotMatch(
        html,
        /<button[^>]*>\s*(?:Aprobar|Publicar|Rechazar)/i,
      );
    }
  });

  it("keeps six primary sections and exposes Biblioteca ARCA to read-only viewer roles", () => {
    assert.equal(APPLICATION_SECTIONS.length, 6);
    const route = APPLICATION_ROUTES.find(
      (candidate) => candidate.path === "/operator/arca-library",
    );
    assert.equal(route?.label, "Biblioteca ARCA");
    assert.equal(route?.section, "evidencia");
    assert.ok(route?.allowed_roles.includes("viewer"));
  });

  it("packages exactly three decisions, three publications, and their two schemas", () => {
    assert.equal(ARCA_HUMAN_DECISION_ASSET_PATHS.length, 3);
    assert.equal(ARCA_PUBLICATION_RECORD_ASSET_PATHS.length, 3);
    assert.equal(ARCA_READ_ONLY_LIBRARY_ASSET_PATHS.length, 8);
    for (const path of ARCA_READ_ONLY_LIBRARY_ASSET_PATHS) {
      assert.equal(readFileSync(resolve(root, path), "utf8").length > 0, true);
      assert.doesNotMatch(
        path,
        /\*|raw|temp|fixture|credential|reports?\/|(?:^|\/)\.\.(?:\/|$)/i,
      );
    }
  });

  it("keeps all operational authority disabled and performs no network or database write", () => {
    assert.equal(library.pending_real_regulations, 0);
    assert.equal(library.approved_real_regulations, 3);
    assert.equal(library.published_read_only_regulations, 3);
    assert.equal(library.model_execution_permitted, false);
    assert.equal(library.runtime_arca_execution_available, false);
    assert.equal(library.scheduler_active, false);
    assert.equal(library.database_write_authorized, false);
    assert.equal(library.external_side_effects_performed, false);
    assert.equal(library.legal_interpretation_performed, false);
    const source = readFileSync(
      resolve(root, "src/regulatory/arca-read-only-library.ts"),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|https\.request|undici|axios|writeFile|appendFile|createClient|supabase|postgres|prisma/,
    );
    for (const path of [
      "config/ai-131-controlled-live-arca-kill-switch.json",
      "config/ai-132-governed-arca-export-kill-switch.json",
      "config/ai-133-governed-arca-scheduler-kill-switch.json",
    ]) {
      const value = JSON.parse(readFileSync(resolve(root, path), "utf8")) as {
        state: string;
      };
      assert.equal(value.state, "active");
    }
  });
});
