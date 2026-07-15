import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  GOVERNANCE_GROUPS,
  UNTRANSLATED_MARKER,
  blockerReason,
  groupBlockersForGovernance,
  presentBlockerSummary,
  presentOwnerRole,
  presentReasonCode,
  presentRequiredActionTitle,
  presentStatus,
  shortHash,
  topBlockersBySeverity,
} from "../../src/operator/operator-presentation.js";
import type {
  OperatorBlocker,
  OperatorRequiredAction,
} from "../../src/operator/operator-read-model.js";

const blocker = (
  code: string,
  severity: OperatorBlocker["severity"] = "high",
): OperatorBlocker => ({
  blocker_code: code,
  severity,
  category: "evidence",
  provider_id: "openrouter",
  candidate_id: "minimax/minimax-m2.7",
  summary: code,
  source_evaluator: code.split(":")[0]!,
  source_artifact_id: null,
  source_artifact_hash: null,
  resolvable_by: ["evidence_review"],
  blocking_execution: true,
});

describe("operator console Spanish presentation layer", () => {
  it("translates known statuses and marks unknown values untranslated", () => {
    assert.deepEqual(presentStatus("blocked"), {
      canonical: "blocked",
      label: "Bloqueado",
      known: true,
    });
    assert.deepEqual(presentStatus("healthy"), {
      canonical: "healthy",
      label: "Operativo",
      known: true,
    });
    const unknown = presentStatus("mystery_future_state");
    assert.equal(unknown.known, false);
    assert.equal(unknown.canonical, "mystery_future_state");
    assert.equal(unknown.label, "mystery_future_state");
    assert.equal(typeof UNTRANSLATED_MARKER, "string");
  });

  it("summarizes known reason codes in Spanish and never paraphrases unknown ones", () => {
    const known = presentReasonCode("pricing:conflicting");
    assert.equal(known.known, true);
    assert.match(known.label, /contradictorias/);
    const prefixed = presentReasonCode("missing_or_malformed_artifact:models");
    assert.equal(prefixed.known, true);
    assert.match(prefixed.label, /ausente o malformado/);
    const unknown = presentReasonCode("entirely:new:reason");
    assert.equal(unknown.known, false);
    assert.equal(unknown.label, "entirely:new:reason");
  });

  it("derives blocker summaries from the reason portion of the canonical code", () => {
    assert.equal(
      blockerReason("readiness_dossier:pricing:conflicting"),
      "pricing:conflicting",
    );
    const summary = presentBlockerSummary(
      blocker("readiness_dossier:pricing:conflicting"),
    );
    assert.equal(summary.known, true);
    assert.match(summary.label, /precios/);
  });

  it("translates deterministic action titles and owner roles", () => {
    const action: OperatorRequiredAction = {
      action_code: "resolve:legal_review",
      title: "Resolve legal review blockers",
      owner_role: "legal_reviewer",
      source_blocker_codes: ["sandbox_proposal:legal_review_pending"],
      prerequisite_actions: [],
      status: "pending",
      execution_impact:
        "Execution remains blocked until reviewed evidence confirms resolution.",
      required_artifact: "legal_review_review_artifact",
    };
    const title = presentRequiredActionTitle(action);
    assert.equal(title.known, true);
    assert.equal(title.label, "Resolver bloqueos de revisión legal");
    assert.equal(title.canonical, "Resolve legal review blockers");
    assert.equal(
      presentOwnerRole("legal_reviewer").label,
      "Revisión legal (rol revisor)",
    );
    const unknownAction = presentRequiredActionTitle({
      ...action,
      action_code: "resolve:brand_new_kind",
      title: "Resolve brand new kind blockers",
    });
    assert.equal(unknownAction.known, false);
    assert.equal(unknownAction.label, "Resolve brand new kind blockers");
  });

  it("abbreviates hashes without losing the canonical prefix", () => {
    assert.equal(shortHash(null), "ausente");
    assert.equal(shortHash("abc"), "abc");
    assert.equal(
      shortHash("668b76fa8e7136d124764fc2cfe61e88"),
      "668b76fa8e71…",
    );
  });

  it("selects top blockers by severity with stable read-model order", () => {
    const items = [
      blocker("a:one", "medium"),
      blocker("b:two", "high"),
      blocker("c:three", "critical"),
      blocker("d:four", "high"),
      blocker("e:five", "low"),
    ];
    const top = topBlockersBySeverity(items, 3);
    assert.deepEqual(
      top.map((item) => item.blocker_code),
      ["c:three", "b:two", "d:four"],
    );
    assert.deepEqual(
      items.map((item) => item.blocker_code),
      ["a:one", "b:two", "c:three", "d:four", "e:five"],
    );
  });

  it("partitions every blocker into exactly one governance display group", () => {
    const codes = [
      "external_evidence_pack:openrouter.external.pricing.v1:conflicting",
      "external_evidence_pack:provider_routing_variability_explicit",
      "readiness_dossier:unresolved_mandatory_risk:zdr-unverified",
      "sandbox_proposal:structured_output_unverified",
      "sandbox_proposal:benchmark_or_gold_case_missing",
      "sandbox_proposal:legal_review_pending",
      "sandbox_proposal:human_approval_missing",
      "sandbox_proposal:evidence_unverified",
      "repository_loader:missing_or_malformed_artifact:runtime",
    ];
    const grouped = groupBlockersForGovernance(
      codes.map((code) => blocker(code)),
    );
    const total = [...grouped.values()].reduce(
      (sum, group) => sum + group.length,
      0,
    );
    assert.equal(total, codes.length);
    const byTitle = (title: string) =>
      (grouped.get(title) ?? []).map((item) => item.blocker_code);
    assert.deepEqual(byTitle("Precios y presupuesto"), [codes[0]]);
    assert.deepEqual(byTitle("Enrutamiento del proveedor"), [codes[1]]);
    assert.deepEqual(
      byTitle("Privacidad, retención, entrenamiento, geografía y ZDR"),
      [codes[2]],
    );
    assert.deepEqual(byTitle("Salida estructurada"), [codes[3]]);
    assert.deepEqual(byTitle("Benchmarks y casos de referencia"), [codes[4]]);
    assert.deepEqual(byTitle("Revisión legal y de seguridad"), [codes[5]]);
    assert.deepEqual(byTitle("Aprobación humana"), [codes[6]]);
    assert.deepEqual(byTitle("Evidencia y preparación"), [codes[7]]);
    assert.deepEqual(byTitle("Configuración de ejecución"), [codes[8]]);
    assert.equal(GOVERNANCE_GROUPS.length, 9);
  });
});
