import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { ApplicationIdentity } from "../../src/application/application-access.js";
import {
  APPLICATION_ROUTES,
  APPLICATION_SHELL_CSS,
} from "../../src/application/application-shell.js";
import {
  handleOperatorConsoleRequest,
  type OperatorConsoleOptions,
} from "../../src/operator/operator-console-handler.js";
import {
  OPERATOR_CONSOLE_PATHS,
  renderOperatorConsole,
} from "../../src/operator/operator-console.js";
import {
  GOVERNANCE_GROUPS,
  topBlockersBySeverity,
} from "../../src/operator/operator-presentation.js";
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

const NAV_LABELS = [
  "Overview",
  "ARCA",
  "Acquisitions",
  "Exports",
  "Recovery",
  "Human Review",
  "Approved Artifacts",
  "Providers",
  "Registry",
  "Tournaments",
  "AI LAB",
  "OpenRouter",
  "Vercel Eve",
  "Cloudflare",
  "Regulations",
  "Sources",
  "News",
  "Evidence",
  "Settings",
] as const;

const ADMIN_IDENTITY: ApplicationIdentity = {
  authenticated: true,
  display_name: "Admin local",
  subject: "local:admin",
  role: "admin",
  source: "local-development",
};

function response(): {
  res: ServerResponse;
  result: () => {
    status: number;
    body: string;
    headers: Record<string, string>;
  };
} {
  let status = 0;
  let body = "";
  let headers: Record<string, string> = {};
  const res = {
    writeHead: (nextStatus: number, nextHeaders?: Record<string, string>) => {
      status = nextStatus;
      headers = nextHeaders ?? {};
    },
    end: (chunk?: string) => {
      body += chunk ?? "";
    },
  } as unknown as ServerResponse;
  return { res, result: () => ({ status, body, headers }) };
}

async function request(
  path: string,
  method = "GET",
  options?: Partial<OperatorConsoleOptions>,
) {
  const capture = response();
  const handled = await handleOperatorConsoleRequest(
    { method, url: path } as IncomingMessage,
    capture.res,
    { repository_root: root, ...options },
  );
  return { handled, ...capture.result() };
}

describe("read-only AI LAB Operator Console (Spanish UX)", () => {
  it("renders every console route inside the persistent protected shell", async () => {
    for (const path of OPERATOR_CONSOLE_PATHS) {
      const result = await request(path, "GET", {
        resolve_identity: () => ADMIN_IDENTITY,
      });
      assert.equal(result.handled, true);
      assert.equal(result.status, 200, path);
      assert.match(result.headers["Cache-Control"] ?? "", /no-store/);
      assert.match(result.body, /<html lang="es">/);
      assert.match(result.body, /<main id="main"/);
      assert.match(result.body, /aria-label="AI LAB"/);
      assert.match(result.body, /Saltar al contenido principal/);
      assert.match(result.body, /data-sidebar-toggle/);
      assert.match(result.body, /data-mobile-toggle/);
      assert.match(result.body, /data-command-search/);
      assert.doesNotMatch(result.body, /<form\b/i);
      assert.doesNotMatch(result.body, /<textarea\b/i);
      for (const label of NAV_LABELS)
        assert.match(result.body, new RegExp(label));
    }
    assert.equal(APPLICATION_ROUTES.length, NAV_LABELS.length);
    assert.match(APPLICATION_SHELL_CSS, /focus-visible/);
  });

  it("renders the exact repository OpenRouter blocked state in Spanish", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/providers/openrouter");
    assert.equal(model.blockers.length, 46);
    assert.equal(model.required_human_actions.length, 6);
    for (const expected of [
      "minimax/minimax-m2.7",
      "Ejecución permitida",
      "Bloqueado",
      "Deshabilitado",
      "Activo",
      "No configurado",
      "Ausente",
      "Sin política emitida",
      "No intentado",
      model.models[0]!.hash,
      model.routes[0]!.hash,
      model.execution_profiles[0]!.hash!,
    ])
      assert.match(html, new RegExp(expected.replaceAll("/", "\\/")));
  });

  it("keeps canonical machine values unchanged while translating labels", async () => {
    const model = await load();
    const all = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    for (const blocker of model.blockers)
      assert.match(
        all,
        new RegExp(blocker.blocker_code.replaceAll(".", "\\.")),
      );
    for (const canonical of [
      model.system_summary.read_model_hash,
      model.validation_evidence_metadata.dossier_id!,
      model.validation_evidence_metadata.evidence_pack_hash!,
      model.validation_evidence_metadata.proposal_hash!,
      model.validation_evidence_metadata.runtime_config_hash!,
      "openrouter.transport.chat-completions",
      "minimax/minimax-m2.7",
      "no_policy_issued",
      "not_attempted",
    ])
      assert.match(all, new RegExp(canonical.replaceAll(/[./]/g, "\\$&")));
  });

  it("Overview communicates blocked execution, top blockers, counts, and next steps", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator");
    assert.match(
      html,
      /Bloqueado es un estado gobernado y seguro, no una falla de la aplicación\./,
    );
    assert.match(html, /No permitida/);
    assert.match(html, /Situación actual/);
    assert.match(html, /No se ha realizado ninguna llamada al proveedor\./);
    assert.match(
      html,
      /No se ha consumido ninguna autorización de ejecución\./,
    );
    assert.match(html, /kill switch permanece activo/);
    assert.match(html, /Bloqueos activos<\/span><strong>46/);
    assert.match(html, /Acciones requeridas<\/span><strong>6/);
    assert.match(html, /Revisiones pendientes<\/span><strong>8/);
    assert.match(html, /Próximos pasos/);
    assert.match(html, /Próximo hito gobernado/);
    const top = topBlockersBySeverity(model.blockers, 5);
    assert.equal(top.length, 5);
    let position = -1;
    for (const blocker of top) {
      const next = html.indexOf(blocker.blocker_code);
      assert.ok(next > position, blocker.blocker_code);
      position = next;
    }
    const section = html
      .split("Bloqueos principales")[1]!
      .split("Próximos pasos")[0]!;
    assert.doesNotMatch(
      section,
      /external_evidence_pack:provider_routing_variability_explicit/,
    );
  });

  it("provider card shows a Spanish explanation, grouped state, and detail link", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/providers");
    assert.match(
      html,
      /La ejecución permanece deshabilitada mientras existan 46 bloqueos gobernados sin resolver\./,
    );
    for (const group of [
      "Evidencia y preparación",
      "Configuración de sandbox",
      "Seguridad",
      "Ejecución",
    ])
      assert.match(html, new RegExp(`<h4>${group}</h4>`));
    assert.match(html, /Ver detalle gobernado/);
    assert.match(html, /Modelo candidato/);
  });

  it("OpenRouter detail groups content into the required Spanish sections", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/providers/openrouter");
    for (const section of [
      "Estado actual",
      "Identidad del candidato",
      "Evidencia y preparación",
      "Seguridad y privacidad",
      "Configuración de ejecución",
      "Presupuesto sandbox",
      "Artefactos y hashes",
      "Próximas acciones",
    ])
      assert.match(html, new RegExp(`<h3>${section}</h3>`));
    assert.match(html, /No existe una política exacta de ejecución\./);
    assert.match(html, /adaptador de transporte está deshabilitado/);
    assert.match(html, /<details class="tech">/);
  });

  it("Human-review view shows the bounded scope, decisions, ceilings, and gold case", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/review");
    for (const section of [
      "Estado de la revisión de activación",
      "Identidad del candidato",
      "Decisiones humanas",
      "Límites de la primera ejecución",
      "Caso de referencia sintético",
      "Artefactos vinculados",
      "Bloqueos de la revisión",
      "Próxima acción gobernada",
    ])
      assert.match(html, new RegExp(`<h3>${section}</h3>`));
    assert.match(html, /one_synthetic_gold_case_sandbox_activation/);
    assert.match(html, /Preparado, no ejecutado/);
    assert.match(html, /Sin asignar/);
    assert.match(
      html,
      new RegExp(model.activation_review.source_artifact_hash!),
    );
    assert.match(html, new RegExp(model.gold_case_state.source_artifact_hash!));
    for (const pending of model.activation_review.pending_human_decisions)
      assert.match(html, new RegExp(pending));
    // The view is informational only: no approval, upload, or execution UI.
    assert.doesNotMatch(html, /<(form|textarea)\b/i);
    assert.doesNotMatch(html, /type=["']submit["']/i);
    assert.doesNotMatch(
      html,
      /Aprobar ahora|Registrar decisión|Ejecutar|Subir|Configurar secreto/,
    );
    // Audit-safe: no reviewer identities are invented, no secret values shown.
    assert.doesNotMatch(html, /OPENROUTER_API_KEY|sk-or-|Bearer\s/);
  });

  it("Governance uses at most two columns and explains every group", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/governance");
    assert.doesNotMatch(APPLICATION_SHELL_CSS, /repeat\(6,/);
    assert.match(
      APPLICATION_SHELL_CSS,
      /\.grid2\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    );
    assert.match(
      APPLICATION_SHELL_CSS,
      /@media\(max-width:820px\)[\s\S]*\.grid2,.grid3\{grid-template-columns:1fr\}/,
    );
    for (const group of GOVERNANCE_GROUPS) {
      assert.match(html, new RegExp(group.title.replaceAll(",", ",")));
      assert.match(html, new RegExp(group.description.slice(0, 40)));
    }
    assert.match(html, /Por qué importa/);
    assert.match(html, /La ejecución permanece bloqueada\./);
    assert.doesNotMatch(html, /revisión completada|revisión aprobada/i);
  });

  it("never lets canonical codes wrap character by character", async () => {
    const model = await load();
    const all = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    assert.match(APPLICATION_SHELL_CSS, /\.code-block\{[^}]*overflow-x:auto/);
    assert.match(APPLICATION_SHELL_CSS, /\.code-block\{[^}]*white-space:pre/);
    assert.doesNotMatch(APPLICATION_SHELL_CSS, /break-all/);
    assert.doesNotMatch(APPLICATION_SHELL_CSS, /overflow-wrap:anywhere/);
    for (const blocker of model.blockers)
      assert.match(
        all,
        new RegExp(
          `blocker_code: ${blocker.blocker_code.replaceAll(/[./]/g, "\\$&")}`,
        ),
      );
  });

  it("renders blockers as Spanish operator records preserving order", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/blockers");
    assert.match(
      html,
      /Las fuentes de precios del proveedor son contradictorias\./,
    );
    assert.match(html, /ZDR \(Zero Data Retention\) sin verificar\./);
    assert.match(html, /Severidad: Alta/);
    assert.match(html, /Severidad: Media/);
    assert.doesNotMatch(
      html,
      /<span class="badge status-unknown"><code>(high|medium)/,
    );
    assert.match(html, /Severidad|Categoría|Clase de resolución/);
    assert.match(html, /Mostrando 46 de 46 bloqueos/);
    assert.match(html, /aria-live="polite"/);
    let position = -1;
    for (const blocker of model.blockers) {
      const next = html.indexOf(`blocker_code: ${blocker.blocker_code}`);
      assert.ok(next > position, blocker.blocker_code);
      position = next;
    }
  });

  it("renders required actions as an ordered Spanish plan preserving order", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/actions");
    assert.match(html, /Resolver bloqueos de revisión de evidencia/);
    assert.match(html, /Por qué es requerida/);
    assert.match(
      html,
      /La ejecución permanece bloqueada hasta que evidencia revisada confirme la resolución\./,
    );
    const rendered = [...html.matchAll(/action_code: (resolve:[a-z_]+)/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(
      rendered,
      model.required_human_actions.map((action) => action.action_code),
    );
    assert.doesNotMatch(html, /<form\b|type=["']submit["']/i);
  });

  it("renders the execution chain with Spanish labels and honest distinctions", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/execution");
    for (const stage of [
      "Registro",
      "Resolución",
      "Autorización",
      "Política exacta",
      "Consumo atómico",
      "Gateway",
      "Adaptador",
    ])
      assert.match(html, new RegExp(`<strong>${stage}</strong>`));
    for (const canonical of [
      "registry",
      "resolution",
      "authorization",
      "exact_policy",
      "atomic_consumption",
      "gateway",
      "adapter",
    ])
      assert.match(
        html,
        new RegExp(`<code>${canonical.replaceAll("_", "_(?:<wbr>)?")}</code>`),
      );
    for (const fact of [
      "No existe una política exacta\\.",
      "No se ha emitido ninguna autorización de ejecución\\.",
      "No se ha intentado ningún consumo de autorización\\.",
      "No se ha realizado ninguna llamada al proveedor\\.",
      "No existe ninguna salida de modelo\\.",
      "No existe uso facturado\\.",
    ])
      assert.match(html, new RegExp(fact));
    assert.match(
      html,
      /Ausente<\/strong> significa que el artefacto no existe/,
    );
  });

  it("Audit uses friendly artifact names with full identities disclosed", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator/audit");
    for (const name of [
      "Dossier de preparación",
      "Paquete de evidencia externa",
      "Propuesta de sandbox",
      "Configuración de runtime",
      "Registro del modelo",
      "Registro de ruta",
      "Perfil de ejecución",
    ])
      assert.match(html, new RegExp(`<h4>${name}</h4>`));
    for (const section of [
      "Identidad de la evaluación",
      "Artefactos gobernados",
      "Evidencia y documentación",
      "Metadatos técnicos",
    ])
      assert.match(html, new RegExp(section));
    for (const reference of model.audit_references)
      assert.match(html, new RegExp(reference.replaceAll(/[./]/g, "\\$&")));
    assert.match(
      html,
      new RegExp(model.validation_evidence_metadata.dossier_hash!),
    );
  });

  it("renders only audit-safe metadata and no mutation or execution controls", async () => {
    const model = await load();
    const all = [...OPERATOR_CONSOLE_PATHS]
      .map((path) => renderOperatorConsole(model, path))
      .join("\n");
    for (const forbidden of [
      /<form\b/i,
      /type=["'](?:submit|password)["']/i,
      /authorization_token/i,
      /raw_document/i,
      /raw_model_output/i,
      /prompt_payload/i,
      /Bearer\s/i,
      /sk-or-/i,
      />\s*(?:Ejecutar|Habilitar ahora|Aprobar|Reintentar|Desactivar kill switch|Configurar secreto|Run|Execute|Approve|Retry)\s*</,
      /navigator\.clipboard/,
      /fetch\(/,
    ])
      assert.doesNotMatch(all, forbidden);
  });

  it("fails closed with a safe Spanish page for invalid state or loader failure", async () => {
    const valid = await load();
    const invalid = structuredClone(valid) as OperatorReadModel;
    (invalid.system_summary as { overall_status: string }).overall_status =
      "invalid_state";
    for (const loader of [
      async () => invalid,
      async () => {
        throw new Error(root);
      },
    ]) {
      const result = await request("/operator", "GET", {
        load_read_model: loader,
      });
      assert.equal(result.status, 500);
      assert.match(result.body, /Estado del repositorio inválido/);
      assert.doesNotMatch(result.body, new RegExp(root));
      assert.doesNotMatch(result.body, /Error:/);
    }
  });

  it("exposes GET-only routes and leaves no provider execution endpoint", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      assert.equal((await request("/operator", method)).status, 405);
    }
    assert.equal((await request("/operator/execute")).status, 404);
  });

  it("keeps the presentation dependency limited to the read-model contract", () => {
    for (const file of [
      "src/operator/operator-console.ts",
      "src/operator/operator-presentation.ts",
    ]) {
      const source = readFileSync(resolve(root, file), "utf8");
      const imports = source
        .split("\n")
        .filter((line) => line.startsWith("import "))
        .join("\n");
      assert.doesNotMatch(
        imports,
        /providers\/|gateway|harness|authorization-store|readiness|proposal|preflight|resolver/,
      );
      assert.doesNotMatch(source, /process\.env|node:fs|node:http|node:net/);
    }
    const domainFiles = [
      "src/providers/openrouter-adapter.ts",
      "src/execution/multi-provider-gateway.ts",
    ];
    for (const file of domainFiles)
      assert.doesNotMatch(
        readFileSync(resolve(root, file), "utf8"),
        /operator-console|operator-presentation/,
      );
  });

  it("preserves semantic landmarks, headings, and text-based status meaning", async () => {
    const model = await load();
    for (const path of OPERATOR_CONSOLE_PATHS) {
      const html = renderOperatorConsole(model, path);
      assert.match(html, /<header\b/);
      assert.match(html, /<nav\b[^>]*aria-label=/);
      assert.match(html, /<main id="main"/);
      assert.match(html, /<h2>/);
      assert.match(html, /class="skip-link"/);
      assert.match(html, /Sistema bloqueado/);
    }
  });
});
