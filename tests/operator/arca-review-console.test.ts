import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildArcaReviewConsoleViewModel } from "../../src/operator/arca-review-console-view-model.js";
import {
  OPERATOR_CONSOLE_PATHS,
  renderOperatorConsole,
} from "../../src/operator/operator-console.js";
import type { OperatorReadModel } from "../../src/operator/operator-read-model.js";
import {
  loadRepositoryOperatorReadModel,
  REPOSITORY_OPERATOR_EVALUATED_AT,
} from "../../src/operator/repository-operator-read-model.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const load = () =>
  loadRepositoryOperatorReadModel({
    repository_root: root,
    evaluated_at: REPOSITORY_OPERATOR_EVALUATED_AT,
  });

const mutateReview = (
  model: OperatorReadModel,
  values: Readonly<Record<string, unknown>>,
): OperatorReadModel => {
  const next = structuredClone(model);
  Object.assign(
    next.arca_candidate_review as unknown as Record<string, unknown>,
    values,
  );
  return next;
};

describe("AI-129 read-only ARCA Operator Review Console", () => {
  it("renders the dedicated route with Spanish sections and repository-current pending labels", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/arca-review");
    assert.ok(OPERATOR_CONSOLE_PATHS.has("/operator/arca-review"));
    assert.match(html, /<title>Revisión ARCA — Consola del operador<\/title>/);
    for (const heading of [
      "Resumen del candidato",
      "Revisión humana",
      "Evaluación",
      "Approved Artifact",
      "Qué significa este estado",
    ])
      assert.match(html, new RegExp(`<h3>${heading}</h3>`));
    for (const label of [
      "repository-current",
      "synthetic fixture",
      "real human decision absent",
      "Approved Artifact absent",
      "Pendiente de revisión humana",
      "Ausente — no existe una decisión humana real",
      "Ausente — no existe un Approved Artifact",
      "No exportado",
      "No publicado",
      "Uso en producción no autorizado",
    ])
      assert.match(html, new RegExp(label));
  });

  it("projects canonical lifecycle and evaluator states without inferring decisions", async () => {
    const base = await load();
    const cases = [
      ["rejected", "rejected", "Rechazado"],
      ["expired", "expired", "Vencido"],
      ["superseded", "superseded", "Sustituido"],
      ["approved", "invalid_review", "Revisión inválida"],
      [
        "approved",
        "candidate_binding_mismatch",
        "Vinculación del candidato no coincide",
      ],
      [
        "approved",
        "eligible_for_approved_artifact_building",
        "Elegible únicamente para construir el artefacto aprobado",
      ],
    ] as const;
    for (const [lifecycle, outcome, expected] of cases) {
      const model = mutateReview(base, {
        review_lifecycle: lifecycle,
        evaluation_outcome: outcome,
        eligible_for_approved_artifact_building:
          outcome === "eligible_for_approved_artifact_building",
      });
      const view = buildArcaReviewConsoleViewModel(model);
      const html = renderOperatorConsole(model, "/operator/arca-review");
      assert.equal(view.review.lifecycle, lifecycle);
      assert.equal(view.evaluation.outcome, outcome);
      assert.match(html, new RegExp(expected));
      assert.match(html, new RegExp(outcome));
    }
  });

  it("shows an Approved Artifact as local only and preserves all non-authorities", async () => {
    const model = structuredClone(await load());
    Object.assign(
      model.arca_approved_artifact as unknown as Record<string, unknown>,
      {
        present: true,
        approved_artifact_id: `approved-arca-artifact--${"d".repeat(64)}`,
        approved_artifact_sha256: "d".repeat(64),
        builder_identity: "human:synthetic-builder",
        build_timestamp: "2026-07-22T16:00:00.000Z",
      },
    );
    const html = renderOperatorConsole(model, "/operator/arca-review");
    assert.match(html, /Approved Artifact present/);
    assert.match(html, /Artefacto aprobado local — Presente/);
    assert.match(html, /human:synthetic-builder/);
    assert.match(html, /No exportado/);
    assert.match(html, /No publicado/);
    assert.match(html, /Uso en producción no autorizado/);
    assert.match(html, /Consumo por vlatam-global<\/dt><dd>No autorizado/);
  });

  it("shortens hashes, discloses full canonical values, and escapes bounded human text", async () => {
    const base = await load();
    const candidateHash = base.arca_candidate_review.candidate_sha256!;
    const model = mutateReview(base, {
      reviewer_present: true,
      reviewer_identity: "human:<script>alert(1)</script>",
      review_statement: `<img src=x onerror=alert(1)>${"z".repeat(2_100)}`,
      findings: [
        {
          severity: "high",
          category: "other_controlled",
          finding_code: "unsafe-<script>",
          description: "<script>alert(2)</script>",
          resolution_status: "open",
        },
      ],
      unresolved_findings_count: 1,
    });
    const view = buildArcaReviewConsoleViewModel(model);
    const html = renderOperatorConsole(model, "/operator/arca-review");
    assert.equal(view.candidate.hash.short, `${candidateHash.slice(0, 12)}…`);
    assert.match(html, new RegExp(candidateHash));
    assert.match(html, /<details class="tech">/);
    assert.doesNotMatch(html, /<script>alert|<img src/);
    assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
    assert.ok((view.review.review_statement?.length ?? 0) <= 2_001);
  });

  it("contains no mutation controls or forbidden execution dependencies", async () => {
    const html = renderOperatorConsole(await load(), "/operator/arca-review");
    for (const forbidden of [
      /<(form|textarea)\b/i,
      /type=["'](?:submit|password)["']/i,
      /\bfetch\s*\(/,
      /method=["']post["']/i,
      />\s*(?:Aprobar|Rechazar|Construir|Exportar|Publicar|Activar)\s*</i,
    ])
      assert.doesNotMatch(html, forbidden);

    const source = [
      "src/operator/arca-review-console-view-model.ts",
      "src/operator/operator-console.ts",
      "src/operator/operator-console-handler.ts",
    ]
      .map((path) => readFileSync(resolve(root, path), "utf8"))
      .join("\n");
    assert.doesNotMatch(
      source,
      /from\s+["'][^"']*(?:provider|transport|secret|scheduler|database|publisher|export|vlatam-global|approved-arca-artifact-builder)[^"']*["']/i,
    );
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|buildApprovedArca/);
  });

  it("preserves the existing sandbox review route", async () => {
    const html = renderOperatorConsole(await load(), "/operator/review");
    assert.match(html, /Estado de la revisión de activación/);
    assert.match(html, /one_synthetic_gold_case_sandbox_activation/);
    assert.doesNotMatch(html, /<h2>Revisión ARCA<\/h2>/);
  });
});
