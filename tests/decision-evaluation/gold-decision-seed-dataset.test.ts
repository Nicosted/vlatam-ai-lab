import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

import {
  computeTypedDecisionRequestHash,
  computeTypedDecisionSemanticRequestHash,
} from "../../src/decision/index.js";
import {
  GOLD_DECISION_JURISDICTIONS,
  validateGoldDecisionCase,
  validateGoldDecisionSet,
  type GoldDecisionCase,
  type GoldDecisionExpectation,
} from "../../src/decision-evaluation/index.js";
import { SEED_ROOT, seed } from "./helpers.js";

const { manifest, cases } = seed();

type Facts = Record<string, string | number | boolean>;
const factsOf = (c: GoldDecisionCase): Facts =>
  Object.fromEntries(
    c.request.bounded_state.facts.map((f) => [f.fact_id, f.value]),
  );
const candidates = (c: GoldDecisionCase): string[] => {
  const domain = c.request.output_domain;
  return domain.kind === "choice" || domain.kind === "ranking"
    ? domain.candidates.map((x) => x.candidate_id)
    : [];
};
const choice = (id: string): GoldDecisionExpectation => ({
  kind: "choice",
  expected_candidate_id: id,
});
const ABSTAIN: GoldDecisionExpectation = { kind: "abstention" };

/**
 * Independent re-derivations of every declared labeling rule. They prove
 * each answer key follows from its bounded facts; they are test oracles,
 * not candidates, and are never shipped in `src/`.
 */
const ORACLES: Record<
  string,
  (c: GoldDecisionCase, f: Facts) => GoldDecisionExpectation
> = {
  "rule.document_type.v1": (_c, f) => {
    const markers = [
      f["document.has_unit_prices"] === true && "doc.invoice",
      f["document.has_package_weights"] === true && "doc.packing_list",
      f["document.has_certifying_body_declaration"] === true &&
        "doc.certificate",
      f["document.numbered_safety_sections"] === 16 && "doc.msds",
      f["document.has_carrier_and_ports"] === true && "doc.transport_document",
    ].filter((x): x is string => typeof x === "string");
    if (markers.length > 1) return ABSTAIN;
    return choice(markers[0] ?? "doc.unknown");
  },
  "rule.evidence_sufficiency.v1": (_c, f) => {
    const statuses = Object.entries(f)
      .filter(([k]) => k.startsWith("evidence.item."))
      .map(([, v]) => v);
    if (statuses.length !== f["evidence.required_items"]) return ABSTAIN;
    if (statuses.includes("missing")) return choice("evidence.insufficient");
    if (statuses.includes("present_unverified"))
      return choice("evidence.uncertain");
    return choice("evidence.sufficient");
  },
  "rule.human_review_routing.v1": (_c, f) => ({
    kind: "boolean",
    expected_value:
      f["item.declares_hazardous_goods"] === true ||
      (f["item.declared_value_usd"] as number) >= 10000 ||
      f["item.has_unverified_evidence"] === true ||
      f["item.contains_regulatory_claim"] === true,
  }),
  "rule.citation_completeness.v1": (_c, f) => ({
    kind: "boolean",
    expected_value:
      (f["packet.claims_count"] as number) >= 1 &&
      f["packet.claims_count"] === f["packet.claims_with_citation_count"],
  }),
  "rule.workflow_next_step.v1": (c, f) => {
    const step = f["operation.on_hold"]
      ? "step.hold"
      : (f["operation.missing_required_documents"] as number) > 0
        ? "step.request_information"
        : (f["operation.unextracted_documents"] as number) > 0
          ? "step.document_extraction"
          : (f["operation.open_regulatory_questions"] as number) > 0
            ? "step.regulatory_research"
            : f["operation.route_defined"] === false
              ? "step.logistics_analysis"
              : "step.human_review";
    return candidates(c).includes(step) ? choice(step) : ABSTAIN;
  },
  "rule.regulatory_relevance.v1": (_c, f) => {
    if (f["notice.jurisdiction"] === "undeclared") return ABSTAIN;
    if (f["notice.jurisdiction"] !== f["operation.destination_jurisdiction"])
      return choice("relevance.not_relevant");
    if (f["operation.product_category"] === "undeclared")
      return choice("relevance.uncertain");
    return choice(
      f["operation.product_category"] === f["notice.product_category"]
        ? "relevance.relevant"
        : "relevance.not_relevant",
    );
  },
  "rule.document_completeness_0_4.v1": (_c, f) => {
    const required = f["document.required_fields"] as number;
    const present = f["document.present_fields"] as number;
    const illegible = f["document.illegible_fields"] as number;
    if (required === 0) return ABSTAIN;
    const low = Math.floor((4 * present) / required);
    const high = Math.floor((4 * (present + illegible)) / required);
    return low === high
      ? {
          kind: "score",
          scale_id: "synthetic.completeness.0_4",
          match: "exact",
          expected_value: low,
        }
      : {
          kind: "score",
          scale_id: "synthetic.completeness.0_4",
          match: "acceptable_range",
          acceptable_minimum: low,
          acceptable_maximum: high,
        };
  },
  "rule.workflow_priority.v1": (c, f) => ({
    kind: "ranking",
    expected_order: [...candidates(c)].sort((a, b) => {
      const byDeadline =
        (f[`${a}.deadline_days`] as number) -
        (f[`${b}.deadline_days`] as number);
      return byDeadline !== 0
        ? byDeadline
        : (f[`${b}.blocked_operations`] as number) -
            (f[`${a}.blocked_operations`] as number);
    }),
  }),
  "rule.document_queue_order.v1": (c, f) => ({
    kind: "ranking",
    expected_order: [...candidates(c)].sort(
      (a, b) =>
        (f[`${a}.expires_in_days`] as number) -
        (f[`${b}.expires_in_days`] as number),
    ),
  }),
};

describe("AI-141 seed Gold Decision Set quality", () => {
  it("validates as a whole and every case validates on its own", () => {
    assert.equal(validateGoldDecisionSet(manifest, cases).ok, true);
    for (const c of cases)
      assert.equal(validateGoldDecisionCase(c).ok, true, c.case_id);
  });

  it("is a bounded, reviewable seed rather than a bulk synthetic dump", () => {
    assert.ok(cases.length >= 48 && cases.length <= 80, String(cases.length));
    assert.equal(manifest.dataset_id, "ai-lab-gold-decisions");
    assert.equal(manifest.dataset_version, "1.0.0");
  });

  it("lists every case file exactly once, and nothing else lives in the set directory", () => {
    const files = readdirSync(`${SEED_ROOT}/cases`).sort();
    assert.deepEqual(
      files,
      manifest.cases.map((entry) => `${entry.case_id}.json`),
    );
    assert.equal(
      new Set(manifest.cases.map((e) => e.case_id)).size,
      cases.length,
    );
    assert.deepEqual(readdirSync(SEED_ROOT).sort(), ["cases", "manifest.json"]);
  });

  it("is pending human review and never claims published authority by itself", () => {
    assert.equal(manifest.review.state, "in_review");
    assert.equal(manifest.review.approval_ref, null);
    assert.equal(manifest.created_from.candidate_generated_labels, false);
    assert.equal(manifest.created_from.customer_data, false);
    assert.equal(manifest.created_from.production_data, false);
  });

  it("every answer key is reproduced by an independent oracle of its declared labeling rule", () => {
    const declared = new Set(manifest.labeling_rules.map((r) => r.rule_id));
    assert.deepEqual([...declared].sort(), Object.keys(ORACLES).sort());
    for (const c of cases) {
      const oracle = ORACLES[c.provenance.labeling_rule_id];
      assert.ok(oracle, `${c.case_id}: no oracle`);
      assert.deepEqual(oracle(c, factsOf(c)), c.expected, c.case_id);
      assert.equal(
        c.abstention_policy === "required",
        c.expected.kind === "abstention",
        c.case_id,
      );
    }
  });

  it("presents options in an order that never trivially equals the ranking answer", () => {
    for (const c of cases)
      if (c.expected.kind === "ranking")
        assert.notDeepEqual(
          candidates(c),
          c.expected.expected_order,
          c.case_id,
        );
  });

  it("represents every decision type, the three core languages and a non-empty test split", () => {
    const types = new Set(cases.map((c) => c.request.decision_type));
    for (const type of ["choice", "boolean", "score", "ranking"])
      assert.ok(types.has(type as never), type);
    const languages = new Set(cases.map((c) => c.language));
    for (const language of ["es-AR", "en", "pt-BR"])
      assert.ok(languages.has(language as never), language);
    assert.ok(cases.some((c) => c.split === "test"));
    assert.ok(cases.some((c) => c.split === "validation"));
    assert.ok(cases.some((c) => c.split === "development"));
    assert.ok(
      cases.some(
        (c) =>
          c.expected.kind === "score" &&
          c.expected.match === "acceptable_range",
      ),
    );
  });

  it("contains abstention-required, abstention-allowed and abstention-forbidden cases", () => {
    for (const policy of ["required", "allowed", "not_allowed"])
      assert.ok(
        cases.some((c) => c.abstention_policy === policy),
        policy,
      );
    const required = cases.filter((c) => c.abstention_policy === "required");
    for (const c of required)
      assert.ok(
        c.tags.some((tag) => tag.startsWith("adversarial.")),
        `${c.case_id} must declare why abstention is required`,
      );
    const kinds = new Set(
      required.flatMap((c) =>
        c.tags.filter((t) => t.startsWith("adversarial.")),
      ),
    );
    for (const kind of [
      "adversarial.ambiguous_description",
      "adversarial.contradictory_facts",
      "adversarial.missing_evidence",
      "adversarial.unsupported_output_domain",
    ])
      assert.ok(kinds.has(kind), kind);
  });

  it("permutation pairs share semantic truth and split, and differ only in presented order", () => {
    const groups = new Map<string, GoldDecisionCase[]>();
    for (const c of cases)
      if (c.permutation_group_id !== null)
        groups.set(c.permutation_group_id, [
          ...(groups.get(c.permutation_group_id) ?? []),
          c,
        ]);
    assert.ok(groups.size >= 1);
    for (const [group, members] of groups) {
      assert.equal(members.length, 2, group);
      const [a, b] = members as [GoldDecisionCase, GoldDecisionCase];
      assert.deepEqual(a.expected, b.expected, group);
      assert.equal(a.split, b.split, group);
      assert.equal(
        computeTypedDecisionSemanticRequestHash(a.request),
        computeTypedDecisionSemanticRequestHash(b.request),
        group,
      );
      assert.notEqual(
        computeTypedDecisionRequestHash(a.request),
        computeTypedDecisionRequestHash(b.request),
        group,
      );
      assert.notDeepEqual(candidates(a), candidates(b), group);
      assert.deepEqual(
        [...candidates(a)].sort(),
        [...candidates(b)].sort(),
        group,
      );
      assert.notEqual(a.case_hash, b.case_hash, group);
      for (const m of members)
        assert.ok(m.tags.includes("permutation_pair"), m.case_id);
    }
  });

  it("uses jurisdictions only for tagged synthetic regulatory scenarios", () => {
    for (const c of cases) {
      assert.ok(
        (GOLD_DECISION_JURISDICTIONS as readonly string[]).includes(
          c.jurisdiction,
        ),
      );
      const regulatory =
        c.request.capability_id ===
        "synthetic.decision.regulatory_relevance_triage";
      assert.equal(c.jurisdiction !== "NONE", regulatory, c.case_id);
      if (regulatory) {
        assert.ok(c.tags.includes("synthetic_regulatory_scenario"), c.case_id);
        assert.match(
          c.request.question.text,
          /sint[eé]tic|synthetic/i,
          c.case_id,
        );
      }
    }
  });

  it("every case capability is a non-catalog synthetic capability", () => {
    const catalog = readFileSync("config/ai-capabilities.json", "utf8");
    for (const c of cases) {
      assert.match(c.request.capability_id, /^synthetic\.decision\./);
      assert.equal(
        catalog.includes(c.request.capability_id),
        false,
        c.request.capability_id,
      );
    }
  });
});

describe("AI-141 seed Gold Decision Set content safety", () => {
  const files = [
    `${SEED_ROOT}/manifest.json`,
    ...readdirSync(`${SEED_ROOT}/cases`).map((f) => `${SEED_ROOT}/cases/${f}`),
  ];
  const texts = files.map(
    (file) => [file, readFileSync(file, "utf8")] as const,
  );

  it("names no provider, model, runtime or candidate project", () => {
    const forbidden =
      /\b(?:laya|kev|von|semif|rizzo|nanojev|nimble|qwen|openai|anthropic|claude|gemini|deepseek|openrouter|minimax|glm|mistral|llama|gpt|fireworks|huggingface)\b/i;
    for (const [file, text] of texts)
      assert.doesNotMatch(text, forbidden, file);
  });

  it("contains no credential-like material", () => {
    const secret =
      /(sk-[a-z0-9]{8,}|bearer\s+[a-z0-9._-]{8,}|api[_-]?key|password|secret|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|ghp_[a-z0-9]{8,}|AKIA[0-9A-Z]{12,})/i;
    for (const [file, text] of texts) assert.doesNotMatch(text, secret, file);
  });

  it("contains no private reasoning, model-output provenance or personal data markers", () => {
    const reasoning =
      /"(?:reasoning|chain_of_thought|thoughts|thinking|scratchpad|hidden_reasoning|rationale|explanation|model_output|raw_output)"\s*:/i;
    const personal =
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(?:cuit|cuil|cpf|cnpj|dni)\b/i;
    for (const [file, text] of texts) {
      assert.doesNotMatch(text, reasoning, file);
      assert.doesNotMatch(text, personal, file);
      assert.doesNotMatch(
        text,
        /the model said|el modelo dijo|o modelo disse/i,
        file,
      );
    }
  });

  it("is synthetic internal-classification data only", () => {
    for (const c of cases) {
      assert.equal(c.provenance.source_kind, "synthetic_construction");
      assert.equal(c.provenance.candidate_generated, false);
      assert.ok(
        ["public", "internal"].includes(c.request.policy.data_classification),
      );
      assert.equal(c.request.policy.downstream_use, "none");
    }
  });
});
