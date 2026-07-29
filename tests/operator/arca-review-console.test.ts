import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { APPLICATION_ROUTES } from "../../src/application/application-shell.js";
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
      "Artefacto aprobado",
      "Qué significa este estado",
    ])
      assert.match(html, new RegExp(`<h3>${heading}</h3>`));
    for (const label of [
      "Origen de la proyección: estado actual del repositorio",
      "Caso sintético: Sí",
      "Decisión humana real: Ausente",
      "Artefacto aprobado: Ausente",
      "Pendiente de revisión humana",
      "Ausente — no existe una decisión humana real",
      "Ausente — no existe un artefacto aprobado",
      "No exportado",
      "No publicado",
      "Uso en producción",
      "No autorizado",
    ])
      assert.match(html, new RegExp(label));
  });

  it("renders exactly three human-first real regulation cards with aligned status headers", async () => {
    const model = await load();
    const batch = model.arca_regulatory_batch;
    assert.ok(batch);
    const html = renderOperatorConsole(model, "/operator/arca-review");
    const cards = [
      ...html.matchAll(
        /<article class="card arca-regulation-card"[\s\S]*?<\/article>/g,
      ),
    ].map((match) => match[0]);

    assert.equal(cards.length, 3);
    assert.match(html, /<strong>3 normas reales<\/strong>/);
    assert.match(html, /<strong>3 pendientes de revisión<\/strong>/);
    assert.match(html, /<strong>0 aprobadas<\/strong>/);
    assert.match(html, /<strong>Publicación deshabilitada<\/strong>/);
    assert.match(
      html,
      /Planificador inactivo · Ejecución ARCA no disponible · Sin interpretación legal · Interfaz de solo lectura\./,
    );

    const expected = [
      [
        "RG 5859/2026",
        "Resolución anticipada de origen en VUCEA",
        "1 anexo completo",
      ],
      [
        "RG 5845/2026",
        "Depósitos fiscales y cargas de exportación en planta",
        "Sin anexos separados",
      ],
      [
        "RG 5838/2026",
        "Registro de artefactos navales para recursos naturales",
        "3 anexos completos",
      ],
    ] as const;

    expected.forEach(([identifier, title, annexSummary], index) => {
      const artifact = batch.artifacts[index]!;
      const card = cards[index]!;
      const header =
        /<header class="arca-regulation-card__header">[\s\S]*?<\/header>/.exec(
          card,
        )?.[0] ?? "";
      const technicalStart = card.indexOf(
        '<details class="tech"><summary>Datos técnicos y trazabilidad</summary>',
      );
      assert.ok(technicalStart > 0);
      const primaryContent = card.slice(0, technicalStart);

      assert.match(
        header,
        new RegExp(
          `<h3 class="arca-regulation-card__identifier">${identifier.replace("/", "\\/")}<\\/h3>`,
        ),
      );
      assert.match(header, new RegExp(title));
      assert.match(
        header,
        /<span class="badge tone-pending arca-regulation-card__status" data-status="pending_human_review">Pendiente de revisión humana<\/span>/,
      );
      assert.doesNotMatch(primaryContent, new RegExp(artifact.artifact_id));
      assert.doesNotMatch(primaryContent, new RegExp(artifact.canonical_hash));
      assert.match(
        card,
        /<details class="tech"><summary>Datos técnicos y trazabilidad<\/summary>/,
      );
      assert.doesNotMatch(card, /<details class="tech"[^>]*\sopen(?:\s|>)/);
      assert.match(card, new RegExp(`artifact_id: ${artifact.artifact_id}`));
      assert.match(
        card,
        new RegExp(`canonical_hash: ${artifact.canonical_hash}`),
      );
      assert.match(card, /review_status: pending_human_review/);
      assert.match(card, /publication_status: not_published/);
      assert.match(card, /No definido en el artefacto actual/);
      assert.match(card, /2 fuentes oficiales coincidentes/);
      assert.match(card, new RegExp(annexSummary));
      assert.match(card, />Ver en Biblioteca ARCA<\/a>/);
      assert.match(card, />Ver en Boletín Oficial<\/a>/);
    });
  });

  it("preserves statuses, security boundaries, and route authorization", async () => {
    const model = await load();
    const batch = model.arca_regulatory_batch;
    assert.ok(batch);
    assert.equal(batch.artifacts.length, 3);
    assert.equal(batch.review_packages.length, 3);
    assert.equal(batch.pending_count, 3);
    assert.equal(batch.approved_count, 0);
    assert.equal(batch.scheduler_active, false);
    assert.equal(batch.runtime_arca_execution_available, false);
    assert.equal(batch.database_write_authorized, false);
    assert.equal(batch.publication_authorized, false);
    assert.equal(batch.legal_interpretation_performed, false);
    for (const artifact of batch.artifacts) {
      assert.equal(artifact.review_status, "pending_human_review");
      assert.equal(artifact.publication_status, "not_published");
    }
    for (const reviewPackage of batch.review_packages) {
      assert.equal(reviewPackage.lifecycle, "pending_human_review");
      assert.equal(reviewPackage.review_status, "pending_human_review");
      assert.equal(reviewPackage.publication_status, "not_published");
    }
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
    assert.deepEqual(
      APPLICATION_ROUTES.find((route) => route.path === "/operator/arca-review")
        ?.allowed_roles,
      ["operator", "reviewer", "admin"],
    );
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
    assert.match(html, /Artefacto aprobado: Presente/);
    assert.match(html, /Artefacto aprobado local — Presente/);
    assert.match(html, /human:synthetic-builder/);
    assert.match(html, /No exportado/);
    assert.match(html, /No publicado/);
    assert.match(html, /Uso en producción/);
    assert.match(html, /No autorizado/);
    assert.match(
      html,
      /Consumo por vlatam-global<\/dt><dd>[\s\S]*No autorizado/,
    );
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
