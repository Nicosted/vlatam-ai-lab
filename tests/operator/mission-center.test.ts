import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildMissionBoard,
  missionStateChips,
  MISSION_COLUMNS,
} from "../../src/operator/mission-center.js";
import { renderOperatorConsole } from "../../src/operator/operator-console.js";
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

describe("mission center projection", () => {
  it("keeps one card per required human action in read-model order", async () => {
    const model = await load();
    const board = buildMissionBoard(model);
    const actionCards = board.items.slice(
      0,
      model.required_human_actions.length,
    );
    assert.equal(actionCards.length, model.required_human_actions.length);
    for (const item of board.items)
      assert.ok(MISSION_COLUMNS.includes(item.column), item.column);
    for (const [index, action] of model.required_human_actions.entries())
      assert.ok(
        actionCards[index]!.technical.includes(action.action_code),
        action.action_code,
      );
  });

  it("places blocked work in Necesita atención and completed work in Listo", async () => {
    const model = await load();
    const board = buildMissionBoard(model);
    const byId = new Map(board.items.map((item) => [item.id, item]));
    assert.equal(byId.get("bloqueos-gobernados")?.column, "necesita_atencion");
    assert.equal(
      byId
        .get("bloqueos-gobernados")
        ?.facts.find(([key]) => key === "Bloqueos activos")?.[1],
      String(model.system_summary.active_blockers),
    );
    assert.equal(
      byId.get("cola-de-revision")?.column,
      model.system_summary.pending_approvals === 0 ? "listo" : "en_curso",
    );
    assert.equal(
      byId.get("artefacto-aprobado-arca")?.column,
      model.arca_approved_artifact.present ? "listo" : "en_curso",
    );
    assert.equal(
      board.selected_id,
      board.items.find((item) => item.column === "necesita_atencion")?.id,
    );
  });

  it("reports the governed boundary as state, never as a task", async () => {
    const model = await load();
    const chips = missionStateChips(model);
    assert.deepEqual(
      chips.map((chip) => chip.label),
      [
        "Estado general",
        "Ejecución de modelos",
        "Interruptores de seguridad",
        "Planificador",
        "Actividad en producción",
      ],
    );
    assert.equal(
      chips.find((chip) => chip.label === "Ejecución de modelos")?.value,
      "No permitida",
    );
    for (const item of buildMissionBoard(model).items)
      assert.doesNotMatch(item.title, /interruptor de seguridad/i);
  });

  it("renders an accessible read-only board with a single selected panel", async () => {
    const model = await load();
    const html = renderOperatorConsole(model, "/operator");
    const board = buildMissionBoard(model);
    assert.match(html, /<div class="board-layout">/);
    assert.match(
      html,
      /class="context-panel" aria-label="Detalle del elemento seleccionado"/,
    );
    assert.equal(
      [...html.matchAll(/data-mission-card/g)].length,
      board.items.length,
    );
    assert.equal([...html.matchAll(/aria-pressed="true"/g)].length, 1);
    assert.equal(
      [...html.matchAll(/data-mission-panel="[^"]*"(?! hidden)/g)].length,
      1,
    );
    assert.match(html, /Ningún elemento seleccionado/);
    assert.match(html, /Todavía nada completado/);
    assert.doesNotMatch(
      html,
      /<form\b|<textarea\b|<input\b(?![^>]*type="search")/i,
    );
    assert.doesNotMatch(html, /Aprobar|Ejecutar|Activar ahora|Lanzar/);
  });
});
