import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  APPLICATION_ROUTES,
  APPLICATION_SECTIONS,
} from "../../src/application/application-shell.js";
import { REPOSITORY_CURRENT_BLOCKED_STATUS } from "../../src/application/repository-current-status.js";
import {
  OPERATOR_CONSOLE_PATHS,
  renderOperatorConsole,
} from "../../src/operator/operator-console.js";
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

const adminIdentity = {
  authenticated: true,
  display_name: "Operadora de prueba",
  subject: "test:admin",
  role: "admin",
  source: "trusted-upstream",
} as const;

const primaryText = (html: string): string =>
  html
    .replace(
      /<details\b[^>]*>\s*<summary>([\s\S]*?)<\/summary>[\s\S]*?<\/details>/gi,
      " $1 ",
    )
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const routePermissions = APPLICATION_ROUTES.map(
  (route) => [route.path, route.allowed_roles.join(",")] as const,
);

describe("AI LAB operator interface Spanish normalization", () => {
  it("keeps the six primary navigation labels in Spanish", () => {
    assert.deepEqual(
      APPLICATION_SECTIONS.map((section) => section.label),
      [
        "Inicio",
        "Centro de misiones",
        "Revisiones",
        "Evidencia",
        "Modelos e integraciones",
        "Configuración",
      ],
    );
  });

  it("uses reviewed Spanish labels on every operator route", async () => {
    const model = await load();
    const primary = [...OPERATOR_CONSOLE_PATHS]
      .map((path) =>
        primaryText(
          renderOperatorConsole(model, path, {
            identity: adminIdentity,
            deployment_environment: "production",
          }),
        ),
      )
      .join("\n");

    for (const unintended of [
      /\bKill switches?\b/i,
      /\bUI CONTEXT\b/i,
      /\bPRODUCTION\b/,
      /\bPREVIEW\b/,
      /\bOperator Read Model\b/i,
      /\bApproved Artifact\b/i,
      /\bWrite actions available\b/i,
      /\bControl plane\b/i,
      /\bCandidate\b/,
      /\bFreshness\b/i,
      /\bGaps\b/,
      /\bRuntime\b/i,
      /\bParser\b/i,
      /\bBuilder\b/i,
      /\bGateway\b/i,
      /\bSandbox\b/i,
      /\brepository-current\b/i,
    ])
      assert.doesNotMatch(primary, unintended);

    for (const expected of [
      "ADMIN · CONTEXTO DE INTERFAZ",
      "PRODUCCIÓN",
      "Interruptores de seguridad",
      "Estado gobernado",
      "Bloqueado",
      "Ejecución no permitida",
      "Sin autoridad operativa",
      "Interfaz de lectura",
      "Valores técnicos",
      "Procedencia de los datos",
      "En curso",
      "Necesita atención",
      "Listo",
      "Pendiente",
      "Requiere revisión",
    ])
      assert.match(primary, new RegExp(expected));
  });

  it("preserves proper product and provider names", async () => {
    const model = await load();
    const html = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    for (const name of [
      "OpenRouter",
      "Cloudflare",
      "Vercel Eve",
      "MiniMax",
      "ARCA",
    ])
      assert.match(html, new RegExp(name));
  });

  it("keeps canonical codes available only through technical disclosures", async () => {
    const model = await load();
    const html = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    const disclosures = [...html.matchAll(/<details\b[\s\S]*?<\/details>/gi)]
      .map((match) => match[0])
      .join("\n");
    for (const canonical of [
      "one_synthetic_gold_case_sandbox_activation",
      "projection_source: repository-current",
      "review_lifecycle: pending",
      "gateway",
      "not_exported",
      "runtime_configuration_review_artifact",
    ])
      assert.match(disclosures, new RegExp(canonical));
  });

  it("keeps route paths and route permissions unchanged", () => {
    assert.deepEqual(routePermissions, [
      ["/operator", "viewer,operator,reviewer,admin"],
      ["/operator/estado", "viewer,operator,reviewer,admin"],
      ["/operator/blockers", "viewer,operator,reviewer,admin"],
      ["/operator/actions", "viewer,operator,reviewer,admin"],
      ["/operator/misiones", "operator,reviewer,admin"],
      ["/operator/operations/arca", "operator,reviewer,admin"],
      ["/operator/operations/acquisitions", "operator,reviewer,admin"],
      ["/operator/operations/exports", "operator,reviewer,admin"],
      ["/operator/operations/recovery", "operator,reviewer,admin"],
      ["/operator/revisiones", "operator,reviewer,admin"],
      ["/operator/review", "operator,reviewer,admin"],
      ["/operator/arca-review", "operator,reviewer,admin"],
      ["/operator/approved-artifacts", "operator,reviewer,admin"],
      ["/operator/governance", "operator,reviewer,admin"],
      ["/operator/evidence", "viewer,operator,reviewer,admin"],
      ["/operator/audit", "viewer,operator,reviewer,admin"],
      ["/operator/execution", "viewer,operator,reviewer,admin"],
      ["/operator/knowledge/regulations", "viewer,operator,reviewer,admin"],
      ["/operator/knowledge/sources", "viewer,operator,reviewer,admin"],
      ["/operator/knowledge/news", "viewer,operator,reviewer,admin"],
      ["/operator/modelos", "viewer,operator,reviewer,admin"],
      ["/operator/providers", "viewer,operator,reviewer,admin"],
      ["/operator/models/registry", "viewer,operator,reviewer,admin"],
      ["/operator/models/tournaments", "viewer,operator,reviewer,admin"],
      ["/operator/runtimes/ai-lab", "viewer,operator,reviewer,admin"],
      ["/operator/providers/openrouter", "viewer,operator,reviewer,admin"],
      ["/operator/runtimes/vercel-eve", "viewer,operator,reviewer,admin"],
      ["/operator/runtimes/cloudflare", "viewer,operator,reviewer,admin"],
      ["/operator/settings", "admin"],
    ]);
  });

  it("keeps all 46 blockers and their classifications unchanged", async () => {
    const model = await load();
    const counts = (values: readonly string[]) =>
      Object.fromEntries(
        [...new Set(values)]
          .sort()
          .map((value) => [
            value,
            values.filter((candidate) => candidate === value).length,
          ]),
      );
    assert.equal(model.system_summary.active_blockers, 46);
    assert.equal(model.blockers.length, 46);
    assert.deepEqual(counts(model.blockers.map((item) => item.severity)), {
      high: 33,
      medium: 13,
    });
    assert.deepEqual(counts(model.blockers.map((item) => item.category)), {
      approval: 7,
      evidence: 16,
      legal: 2,
      runtime: 13,
      security_privacy: 8,
    });
    assert.deepEqual(
      counts(model.required_human_actions.map((item) => item.status)),
      {
        pending: 6,
      },
    );
  });

  it("keeps safety switches active and every execution boundary closed", async () => {
    const model = await load();
    assert.equal(
      REPOSITORY_CURRENT_BLOCKED_STATUS.ai_131_kill_switch,
      "active",
    );
    assert.equal(
      REPOSITORY_CURRENT_BLOCKED_STATUS.ai_132_kill_switch,
      "active",
    );
    assert.equal(
      REPOSITORY_CURRENT_BLOCKED_STATUS.ai_133_kill_switch,
      "active",
    );
    assert.equal(REPOSITORY_CURRENT_BLOCKED_STATUS.scheduler, "inactive");
    assert.equal(model.kill_switch_state.status, "active");
    assert.ok(
      model.providers.every(
        (provider) => provider["execution_allowed"] === false,
      ),
    );
    assert.ok(model.models.every((entry) => entry.enabled === false));
    assert.ok(model.routes.every((entry) => entry.enabled === false));
    assert.ok(
      model.execution_profiles.every((entry) => entry.enabled === false),
    );
    assert.equal(model.gateway_adapter_state.adapter_status, "disabled");
    assert.equal(model.gateway_adapter_state.gateway_invoked, false);
    assert.equal(model.gateway_adapter_state.transport_invoked, false);
    assert.equal(model.authorization.status, "no_policy_issued");
    assert.equal(model.consumption.status, "not_attempted");
    assert.equal(model.tournament.write_actions_available, false);
  });

  it("keeps ARCA operational authority blocked", async () => {
    const model = await load();
    assert.equal(model.arca_candidate_review.review_lifecycle, "pending");
    assert.equal(model.arca_approved_artifact.export_status, "not_exported");
    assert.equal(
      model.arca_approved_artifact.publication_status,
      "not_published",
    );
    assert.equal(
      model.arca_approved_artifact.production_reliance,
      "not_authorized",
    );
    assert.equal(
      model.arca_approved_artifact.vlatam_global_consumption,
      "not_authorized",
    );
  });

  it("adds no form, mutation, or execution control", async () => {
    const model = await load();
    const html = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    assert.doesNotMatch(html, /<(form|textarea)\b/i);
    assert.doesNotMatch(html, /type=["'](?:submit|password)["']/i);
    assert.doesNotMatch(html, /method=["'](?:post|put|patch|delete)["']/i);
    assert.doesNotMatch(
      html,
      />\s*(?:Ejecutar|Aprobar|Activar|Desactivar|Exportar|Publicar|Reintentar)\s*</i,
    );
    for (const button of html.match(/<button\b[^>]*>/gi) ?? [])
      assert.match(button, /type="button"/);
  });
});
