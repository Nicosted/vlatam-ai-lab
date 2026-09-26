/**
 * AI-141 — pure, fail-closed validators for Gold Decision artifacts.
 *
 * Rules (same discipline as AI-140 `src/decision/validation.ts`):
 *  - Validators are pure. They never throw, log, coerce, normalize,
 *    reorder, de-duplicate or repair a value, and never read the clock,
 *    the environment, the filesystem or the network.
 *  - Every object is closed: unknown properties fail.
 *  - Issues use a closed vocabulary of stable machine codes.
 *  - A valid Gold Decision artifact grants no downstream authority.
 */

import { findForbiddenFieldPaths } from "../capabilities/validation.js";
import { canonicalizeTypedDecisionJson } from "../decision/canonical.js";
import { computeTypedDecisionSemanticRequestHash } from "../decision/canonical.js";
import {
  PROBABILITY_MICROS_SCALE,
  TYPED_DECISION_ABSTENTION_REASONS,
  TYPED_DECISION_HASH_PATTERN,
  TYPED_DECISION_TYPES,
  type TypedDecisionRequest,
} from "../decision/contracts.js";
import {
  PRIVATE_REASONING_FIELD_NAMES,
  TYPED_DECISION_ISSUE_CODES,
  validateTypedDecisionRequest,
} from "../decision/validation.js";
import {
  computeGoldDecisionCaseHash,
  computeGoldDecisionEvaluationHash,
  computeGoldDecisionSetHash,
} from "./canonical.js";
import {
  GOLD_DECISION_ABSTENTION_OUTCOMES,
  GOLD_DECISION_ABSTENTION_POLICIES,
  GOLD_DECISION_AUTHORING_METHODS,
  GOLD_DECISION_CAPABILITY_PREFIX,
  GOLD_DECISION_CORRECTNESS,
  GOLD_DECISION_EVALUATION_ERROR_CODES,
  GOLD_DECISION_ID_PATTERN,
  GOLD_DECISION_JURISDICTIONS,
  GOLD_DECISION_LANGUAGES,
  GOLD_DECISION_LIMITS,
  GOLD_DECISION_OUTCOMES,
  GOLD_DECISION_SCORING_POLICIES,
  GOLD_DECISION_SET_REVIEW_STATES,
  GOLD_DECISION_SOURCE_KINDS,
  GOLD_DECISION_SPLITS,
  GOLD_DECISION_SPLIT_POLICY_ID,
  GOLD_DECISION_SYNTHETIC_REGULATORY_TAG,
  GOLD_DECISION_VERSION_PATTERN,
  SUPPORTED_GOLD_DECISION_CONTRACT_MAJORS,
  type GoldDecisionAbstentionOutcome,
  type GoldDecisionCase,
  type GoldDecisionCaseEvaluation,
  type GoldDecisionCorrectness,
  type GoldDecisionOutcome,
  type GoldDecisionSet,
} from "./contracts.js";

export const GOLD_DECISION_ISSUE_CODES = [
  "contract_invalid",
  "unknown_property",
  "missing_property",
  "forbidden_field",
  "private_reasoning_forbidden",
  "schema_version_invalid",
  "schema_version_unsupported",
  "identifier_invalid",
  "hash_invalid",
  "dataset_identity_invalid",
  "split_invalid",
  "request_invalid",
  "capability_not_synthetic",
  "abstention_policy_invalid",
  "abstention_expectation_mismatch",
  "expected_invalid",
  "expected_decision_type_mismatch",
  "expected_candidate_unknown",
  "score_scale_mismatch",
  "score_expectation_out_of_scale",
  "ranking_expectation_not_permutation",
  "provenance_invalid",
  "evidence_basis_invalid",
  "language_invalid",
  "jurisdiction_invalid",
  "regulatory_scenario_tag_missing",
  "tags_invalid",
  "permutation_group_invalid",
  "case_hash_mismatch",
  // set manifest
  "scoring_policy_invalid",
  "split_policy_invalid",
  "review_invalid",
  "created_from_invalid",
  "supersedes_invalid",
  "labeling_rule_invalid",
  "duplicate_labeling_rule_id",
  "labeling_rule_order_invalid",
  "set_empty",
  "case_entry_invalid",
  "case_entry_order_invalid",
  "duplicate_case_id",
  "duplicate_case_hash",
  "distribution_invalid",
  "distribution_mismatch",
  "dataset_hash_mismatch",
  // set with cases
  "case_invalid",
  "case_missing",
  "case_not_in_manifest",
  "case_hash_binding_mismatch",
  "case_dataset_mismatch",
  "case_split_mismatch",
  "duplicate_request_id",
  "labeling_rule_unknown",
  "labeling_rule_capability_mismatch",
  "permutation_group_singleton",
  "permutation_group_split_mismatch",
  "permutation_group_semantic_mismatch",
  "permutation_group_not_permuted",
  "permutation_group_truth_mismatch",
  // succession
  "succession_dataset_mismatch",
  "succession_supersedes_mismatch",
  "succession_version_not_increased",
  "test_case_removed",
  "test_case_mutated",
  "case_split_changed",
  // evaluation record
  "evaluation_invalid",
  "evaluation_consistency_invalid",
  "evaluation_hash_mismatch",
] as const;
export type GoldDecisionIssueCode = (typeof GOLD_DECISION_ISSUE_CODES)[number];

export interface GoldDecisionIssue {
  readonly code: GoldDecisionIssueCode;
  readonly path: string;
}

export type GoldDecisionValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly GoldDecisionIssue[] };

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class GoldDecisionIssueCollector {
  readonly issues: GoldDecisionIssue[] = [];
  add(code: GoldDecisionIssueCode, path: string): void {
    this.issues.push({ code, path });
  }
  addAll(issues: readonly GoldDecisionIssue[], prefix: string): void {
    for (const issue of issues)
      this.add(issue.code, `${prefix}${issue.path.replace(/^[a-z_]+/, "")}`);
  }
  result<T>(value: T): GoldDecisionValidation<T> {
    if (this.issues.length === 0) return { ok: true, value };
    const seen = new Set<string>();
    const unique = this.issues.filter((issue) => {
      const key = `${issue.code}@${issue.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    unique.sort((a, b) =>
      a.path === b.path
        ? a.code < b.code
          ? -1
          : a.code > b.code
            ? 1
            : 0
        : a.path < b.path
          ? -1
          : 1,
    );
    return { ok: false, issues: unique };
  }
}

type Collector = GoldDecisionIssueCollector;

function closed(
  value: Record_,
  keys: readonly string[],
  path: string,
  c: Collector,
): void {
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) c.add("unknown_property", `${path}.${key}`);
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(value, key))
      c.add("missing_property", `${path}.${key}`);
  }
}

export function isGoldDecisionId(value: unknown): value is string {
  return typeof value === "string" && GOLD_DECISION_ID_PATTERN.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && TYPED_DECISION_HASH_PATTERN.test(value);
}

function isVersion(value: unknown): value is string {
  return typeof value === "string" && GOLD_DECISION_VERSION_PATTERN.test(value);
}

function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function includes<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/** Strictly ascending unique identifiers; never re-sorted. */
function strictlyAscendingIds(
  value: unknown,
  min: number,
  max: number,
): value is string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    return false;
  for (let i = 0; i < value.length; i += 1) {
    if (!isGoldDecisionId(value[i])) return false;
    if (i > 0 && !((value[i - 1] as string) < (value[i] as string)))
      return false;
  }
  return true;
}

function checkSchemaVersion(value: unknown, path: string, c: Collector): void {
  if (!isVersion(value)) {
    c.add("schema_version_invalid", path);
    return;
  }
  const major = Number(value.split(".")[0]);
  if (
    !(SUPPORTED_GOLD_DECISION_CONTRACT_MAJORS as readonly number[]).includes(
      major,
    )
  )
    c.add("schema_version_unsupported", path);
}

function checkGlobalForbidden(
  value: unknown,
  root: string,
  c: Collector,
): void {
  for (const path of findForbiddenFieldPaths(value, 16))
    c.add("forbidden_field", `${root}.${path}`);
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 16 || node === null || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      if (PRIVATE_REASONING_FIELD_NAMES.has(key.toLowerCase()))
        c.add("private_reasoning_forbidden", childPath);
      walk(child, childPath, depth + 1);
    }
  };
  walk(value, root, 0);
}

function checkedHash(compute: () => string): string | null {
  try {
    return compute();
  } catch {
    return null;
  }
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  try {
    return (
      canonicalizeTypedDecisionJson(left) ===
      canonicalizeTypedDecisionJson(right)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------

const CASE_KEYS = [
  "contract",
  "schema_version",
  "case_id",
  "dataset_id",
  "dataset_version",
  "split",
  "request",
  "expected",
  "abstention_policy",
  "permutation_group_id",
  "provenance",
  "language",
  "jurisdiction",
  "tags",
  "case_hash",
] as const;

const PROVENANCE_KEYS = [
  "source_kind",
  "authoring_method",
  "labeling_rule_id",
  "evidence_basis",
  "candidate_generated",
] as const;

function checkExpected(
  expected: unknown,
  policy: unknown,
  request: TypedDecisionRequest | null,
  c: Collector,
): void {
  const at = "case.expected";
  if (!isRecord(expected) || typeof expected["kind"] !== "string") {
    c.add("expected_invalid", at);
    return;
  }
  const kind = expected["kind"];
  if (kind === "abstention") {
    closed(expected, ["kind"], at, c);
    if (policy !== "required")
      c.add("abstention_expectation_mismatch", `${at}.kind`);
    return;
  }
  if (policy === "required")
    c.add("abstention_expectation_mismatch", `${at}.kind`);
  if (!includes(TYPED_DECISION_TYPES, kind)) {
    c.add("expected_invalid", `${at}.kind`);
    return;
  }
  if (request !== null && request.decision_type !== kind)
    c.add("expected_decision_type_mismatch", `${at}.kind`);
  const domain = request?.output_domain ?? null;
  switch (kind) {
    case "choice": {
      closed(expected, ["kind", "expected_candidate_id"], at, c);
      const id = expected["expected_candidate_id"];
      if (!isGoldDecisionId(id)) {
        c.add("expected_invalid", `${at}.expected_candidate_id`);
      } else if (
        domain?.kind === "choice" &&
        !domain.candidates.some((cand) => cand.candidate_id === id)
      ) {
        c.add("expected_candidate_unknown", `${at}.expected_candidate_id`);
      }
      break;
    }
    case "boolean":
      closed(expected, ["kind", "expected_value"], at, c);
      if (typeof expected["expected_value"] !== "boolean")
        c.add("expected_invalid", `${at}.expected_value`);
      break;
    case "score": {
      const match = expected["match"];
      if (match === "exact") {
        closed(
          expected,
          ["kind", "scale_id", "match", "expected_value"],
          at,
          c,
        );
      } else if (match === "acceptable_range") {
        closed(
          expected,
          [
            "kind",
            "scale_id",
            "match",
            "acceptable_minimum",
            "acceptable_maximum",
          ],
          at,
          c,
        );
      } else {
        c.add("expected_invalid", `${at}.match`);
        break;
      }
      if (!isGoldDecisionId(expected["scale_id"]))
        c.add("expected_invalid", `${at}.scale_id`);
      else if (
        domain?.kind === "score" &&
        domain.scale_id !== expected["scale_id"]
      )
        c.add("score_scale_mismatch", `${at}.scale_id`);
      const values =
        match === "exact"
          ? [["expected_value", expected["expected_value"]] as const]
          : [
              ["acceptable_minimum", expected["acceptable_minimum"]] as const,
              ["acceptable_maximum", expected["acceptable_maximum"]] as const,
            ];
      let numeric = true;
      for (const [key, v] of values) {
        if (!isSafeInt(v)) {
          c.add("expected_invalid", `${at}.${key}`);
          numeric = false;
        } else if (
          domain?.kind === "score" &&
          (v < domain.minimum || v > domain.maximum)
        ) {
          c.add("score_expectation_out_of_scale", `${at}.${key}`);
        }
      }
      if (numeric && match === "acceptable_range") {
        const min = expected["acceptable_minimum"] as number;
        const max = expected["acceptable_maximum"] as number;
        if (min >= max) c.add("expected_invalid", at);
        // A band covering the whole scale would make every answer
        // correct; it is rejected rather than silently accepted.
        else if (
          domain?.kind === "score" &&
          min <= domain.minimum &&
          max >= domain.maximum
        )
          c.add("expected_invalid", at);
      }
      break;
    }
    case "ranking": {
      closed(expected, ["kind", "expected_order"], at, c);
      const order = expected["expected_order"];
      if (!Array.isArray(order) || !order.every(isGoldDecisionId)) {
        c.add("expected_invalid", `${at}.expected_order`);
        break;
      }
      if (domain?.kind === "ranking") {
        const want = domain.candidates.map((cand) => cand.candidate_id).sort();
        const got = [...(order as string[])].sort();
        if (
          want.length !== got.length ||
          want.some((id, index) => id !== got[index])
        )
          c.add("ranking_expectation_not_permutation", `${at}.expected_order`);
      }
      break;
    }
  }
}

/**
 * Validates one Gold Decision Case on its own: closed shape, embedded
 * AI-140 request, answer key inside the declared output domain,
 * abstention policy, provenance bound to declared facts, slicing
 * metadata and self-hash. Cross-case rules (duplicates, labeling rule
 * existence, permutation groups, manifest binding) are enforced by
 * `validateGoldDecisionSet`.
 */
export function validateGoldDecisionCase(
  value: unknown,
): GoldDecisionValidation<GoldDecisionCase> {
  const c = new GoldDecisionIssueCollector();
  if (!isRecord(value) || value["contract"] !== "gold_decision_case") {
    c.add("contract_invalid", "case");
    return c.result(value as GoldDecisionCase);
  }
  closed(value, CASE_KEYS, "case", c);
  checkGlobalForbidden(value, "case", c);
  checkSchemaVersion(value["schema_version"], "case.schema_version", c);
  if (!isGoldDecisionId(value["case_id"]))
    c.add("identifier_invalid", "case.case_id");
  if (!isGoldDecisionId(value["dataset_id"]))
    c.add("dataset_identity_invalid", "case.dataset_id");
  if (!isVersion(value["dataset_version"]))
    c.add("dataset_identity_invalid", "case.dataset_version");
  if (!includes(GOLD_DECISION_SPLITS, value["split"]))
    c.add("split_invalid", "case.split");

  const requestCheck = validateTypedDecisionRequest(value["request"]);
  let request: TypedDecisionRequest | null = null;
  if (!requestCheck.ok) {
    for (const issue of requestCheck.issues)
      c.add("request_invalid", `case.${issue.path}`);
  } else {
    request = requestCheck.value;
    if (!request.capability_id.startsWith(GOLD_DECISION_CAPABILITY_PREFIX))
      c.add("capability_not_synthetic", "case.request.capability_id");
  }

  const policy = value["abstention_policy"];
  if (!includes(GOLD_DECISION_ABSTENTION_POLICIES, policy))
    c.add("abstention_policy_invalid", "case.abstention_policy");
  checkExpected(value["expected"], policy, request, c);

  const group = value["permutation_group_id"];
  if (group !== null && !isGoldDecisionId(group))
    c.add("permutation_group_invalid", "case.permutation_group_id");

  const provenance = value["provenance"];
  if (!isRecord(provenance)) {
    c.add("provenance_invalid", "case.provenance");
  } else {
    const at = "case.provenance";
    closed(provenance, PROVENANCE_KEYS, at, c);
    if (!includes(GOLD_DECISION_SOURCE_KINDS, provenance["source_kind"]))
      c.add("provenance_invalid", `${at}.source_kind`);
    if (
      !includes(GOLD_DECISION_AUTHORING_METHODS, provenance["authoring_method"])
    )
      c.add("provenance_invalid", `${at}.authoring_method`);
    if (!isGoldDecisionId(provenance["labeling_rule_id"]))
      c.add("provenance_invalid", `${at}.labeling_rule_id`);
    if (provenance["candidate_generated"] !== false)
      c.add("provenance_invalid", `${at}.candidate_generated`);
    const basis = provenance["evidence_basis"];
    if (
      !strictlyAscendingIds(basis, 1, GOLD_DECISION_LIMITS.max_evidence_basis)
    ) {
      c.add("evidence_basis_invalid", `${at}.evidence_basis`);
    } else if (request !== null) {
      const facts = new Set(
        request.bounded_state.facts.map((fact) => fact.fact_id),
      );
      basis.forEach((id, index) => {
        if (!facts.has(id))
          c.add("evidence_basis_invalid", `${at}.evidence_basis[${index}]`);
      });
    }
  }

  if (!includes(GOLD_DECISION_LANGUAGES, value["language"]))
    c.add("language_invalid", "case.language");
  const jurisdiction = value["jurisdiction"];
  if (!includes(GOLD_DECISION_JURISDICTIONS, jurisdiction))
    c.add("jurisdiction_invalid", "case.jurisdiction");
  const tags = value["tags"];
  if (!strictlyAscendingIds(tags, 0, GOLD_DECISION_LIMITS.max_tags)) {
    c.add("tags_invalid", "case.tags");
  } else if (
    includes(GOLD_DECISION_JURISDICTIONS, jurisdiction) &&
    jurisdiction !== "NONE" &&
    !tags.includes(GOLD_DECISION_SYNTHETIC_REGULATORY_TAG)
  ) {
    c.add("regulatory_scenario_tag_missing", "case.tags");
  }

  if (!isHash(value["case_hash"])) {
    c.add("case_hash_mismatch", "case.case_hash");
  } else if (c.issues.length === 0) {
    const computed = checkedHash(() =>
      computeGoldDecisionCaseHash(value as unknown as GoldDecisionCase),
    );
    if (computed !== value["case_hash"])
      c.add("case_hash_mismatch", "case.case_hash");
  }
  return c.result(value as unknown as GoldDecisionCase);
}

// ---------------------------------------------------------------------
// Set manifest
// ---------------------------------------------------------------------

const SET_KEYS = [
  "contract",
  "schema_version",
  "dataset_id",
  "dataset_version",
  "scoring_policy",
  "split_policy",
  "review",
  "created_from",
  "supersedes",
  "labeling_rules",
  "cases",
  "split_distribution",
  "decision_type_distribution",
  "language_distribution",
  "jurisdiction_distribution",
  "capability_distribution",
  "dataset_hash",
] as const;

const DISTRIBUTION_KEYS = [
  "split_distribution",
  "decision_type_distribution",
  "language_distribution",
  "jurisdiction_distribution",
  "capability_distribution",
] as const;

function checkConstObject(
  value: unknown,
  expected: Record_,
  code: GoldDecisionIssueCode,
  path: string,
  c: Collector,
): void {
  if (!isRecord(value)) {
    c.add(code, path);
    return;
  }
  closed(value, Object.keys(expected), path, c);
  for (const [key, want] of Object.entries(expected)) {
    if (!canonicalEqual(value[key], want)) c.add(code, `${path}.${key}`);
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

/**
 * Semantic-version ordering (`MAJOR.MINOR.PATCH`), numeric per part.
 * Returns a negative, zero or positive number.
 */
export function compareGoldDecisionVersions(
  left: string,
  right: string,
): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return (a[i] ?? 0) - (b[i] ?? 0);
  }
  return 0;
}

/**
 * Validates a Gold Decision Set manifest on its own: closed shape,
 * constant split policy and provenance, review state, labeling rules,
 * strictly ordered unique case entries, split distribution and
 * self-hash. Distributions that depend on case content are checked by
 * `validateGoldDecisionSet`.
 */
export function validateGoldDecisionSetManifest(
  value: unknown,
): GoldDecisionValidation<GoldDecisionSet> {
  const c = new GoldDecisionIssueCollector();
  if (!isRecord(value) || value["contract"] !== "gold_decision_set") {
    c.add("contract_invalid", "set");
    return c.result(value as GoldDecisionSet);
  }
  closed(value, SET_KEYS, "set", c);
  checkGlobalForbidden(value, "set", c);
  checkSchemaVersion(value["schema_version"], "set.schema_version", c);
  if (!isGoldDecisionId(value["dataset_id"]))
    c.add("dataset_identity_invalid", "set.dataset_id");
  if (!isVersion(value["dataset_version"]))
    c.add("dataset_identity_invalid", "set.dataset_version");
  if (!includes(GOLD_DECISION_SCORING_POLICIES, value["scoring_policy"]))
    c.add("scoring_policy_invalid", "set.scoring_policy");

  checkConstObject(
    value["split_policy"],
    {
      policy_id: GOLD_DECISION_SPLIT_POLICY_ID,
      assignment: "explicit_per_case",
      splits: [...GOLD_DECISION_SPLITS],
      test_split_training_use: "forbidden",
      candidate_case_selection: "forbidden",
      permutation_groups_share_split: true,
    },
    "split_policy_invalid",
    "set.split_policy",
    c,
  );
  checkConstObject(
    value["created_from"],
    {
      source_kind: GOLD_DECISION_SOURCE_KINDS[0],
      authoring_method: GOLD_DECISION_AUTHORING_METHODS[0],
      customer_data: false,
      production_data: false,
      candidate_generated_labels: false,
    },
    "created_from_invalid",
    "set.created_from",
    c,
  );

  const review = value["review"];
  if (!isRecord(review)) {
    c.add("review_invalid", "set.review");
  } else {
    closed(
      review,
      ["state", "human_review_required", "approval_ref"],
      "set.review",
      c,
    );
    const state = review["state"];
    if (!includes(GOLD_DECISION_SET_REVIEW_STATES, state))
      c.add("review_invalid", "set.review.state");
    if (review["human_review_required"] !== true)
      c.add("review_invalid", "set.review.human_review_required");
    const ref = review["approval_ref"];
    if (state === "approved") {
      if (!isRecord(ref)) {
        c.add("review_invalid", "set.review.approval_ref");
      } else {
        closed(
          ref,
          ["approval_id", "content_hash"],
          "set.review.approval_ref",
          c,
        );
        if (!isGoldDecisionId(ref["approval_id"]))
          c.add("review_invalid", "set.review.approval_ref.approval_id");
        if (!isHash(ref["content_hash"]))
          c.add("review_invalid", "set.review.approval_ref.content_hash");
      }
    } else if (ref !== null) {
      // A draft or in-review set can never carry an approval.
      c.add("review_invalid", "set.review.approval_ref");
    }
  }

  const supersedes = value["supersedes"];
  if (supersedes !== null) {
    if (!isRecord(supersedes)) {
      c.add("supersedes_invalid", "set.supersedes");
    } else {
      closed(
        supersedes,
        ["dataset_version", "dataset_hash"],
        "set.supersedes",
        c,
      );
      if (
        !isVersion(supersedes["dataset_version"]) ||
        supersedes["dataset_version"] === value["dataset_version"]
      )
        c.add("supersedes_invalid", "set.supersedes.dataset_version");
      if (!isHash(supersedes["dataset_hash"]))
        c.add("supersedes_invalid", "set.supersedes.dataset_hash");
    }
  }

  const rules = value["labeling_rules"];
  if (
    !Array.isArray(rules) ||
    rules.length === 0 ||
    rules.length > GOLD_DECISION_LIMITS.max_labeling_rules
  ) {
    c.add("labeling_rule_invalid", "set.labeling_rules");
  } else {
    const seen = new Set<string>();
    let previous: string | null = null;
    rules.forEach((rule: unknown, index) => {
      const at = `set.labeling_rules[${index}]`;
      if (!isRecord(rule)) {
        c.add("labeling_rule_invalid", at);
        return;
      }
      closed(rule, ["rule_id", "capability_id", "statement"], at, c);
      const id = rule["rule_id"];
      if (!isGoldDecisionId(id)) {
        c.add("labeling_rule_invalid", `${at}.rule_id`);
      } else if (seen.has(id)) {
        c.add("duplicate_labeling_rule_id", `${at}.rule_id`);
      } else {
        seen.add(id);
        if (previous !== null && !(previous < id))
          c.add("labeling_rule_order_invalid", `${at}.rule_id`);
        previous = id;
      }
      const capability = rule["capability_id"];
      if (
        typeof capability !== "string" ||
        !capability.startsWith(GOLD_DECISION_CAPABILITY_PREFIX)
      )
        c.add("capability_not_synthetic", `${at}.capability_id`);
      if (
        !boundedString(
          rule["statement"],
          GOLD_DECISION_LIMITS.max_rule_statement_length,
        )
      )
        c.add("labeling_rule_invalid", `${at}.statement`);
    });
  }

  const entries = value["cases"];
  const splitsForDistribution: string[] = [];
  if (!Array.isArray(entries) || entries.length === 0) {
    c.add("set_empty", "set.cases");
  } else if (entries.length > GOLD_DECISION_LIMITS.max_cases) {
    c.add("case_entry_invalid", "set.cases");
  } else {
    const ids = new Set<string>();
    const hashes = new Set<string>();
    let previous: string | null = null;
    entries.forEach((entry: unknown, index) => {
      const at = `set.cases[${index}]`;
      if (!isRecord(entry)) {
        c.add("case_entry_invalid", at);
        return;
      }
      closed(entry, ["case_id", "case_hash", "split"], at, c);
      const id = entry["case_id"];
      if (!isGoldDecisionId(id)) {
        c.add("case_entry_invalid", `${at}.case_id`);
      } else if (ids.has(id)) {
        c.add("duplicate_case_id", `${at}.case_id`);
      } else {
        ids.add(id);
        if (previous !== null && !(previous < id))
          c.add("case_entry_order_invalid", `${at}.case_id`);
        previous = id;
      }
      const hash = entry["case_hash"];
      if (!isHash(hash)) c.add("case_entry_invalid", `${at}.case_hash`);
      else if (hashes.has(hash))
        c.add("duplicate_case_hash", `${at}.case_hash`);
      else hashes.add(hash);
      if (!includes(GOLD_DECISION_SPLITS, entry["split"]))
        c.add("split_invalid", `${at}.split`);
      else splitsForDistribution.push(entry["split"]);
    });
  }

  for (const key of DISTRIBUTION_KEYS) {
    const dist = value[key];
    if (
      !isRecord(dist) ||
      Object.values(dist).some((n) => !isSafeInt(n) || n < 1)
    )
      c.add("distribution_invalid", `set.${key}`);
  }
  if (
    isRecord(value["split_distribution"]) &&
    Array.isArray(entries) &&
    splitsForDistribution.length === entries.length &&
    !canonicalEqual(value["split_distribution"], countBy(splitsForDistribution))
  )
    c.add("distribution_mismatch", "set.split_distribution");

  if (!isHash(value["dataset_hash"])) {
    c.add("dataset_hash_mismatch", "set.dataset_hash");
  } else if (c.issues.length === 0) {
    const computed = checkedHash(() =>
      computeGoldDecisionSetHash(value as unknown as GoldDecisionSet),
    );
    if (computed !== value["dataset_hash"])
      c.add("dataset_hash_mismatch", "set.dataset_hash");
  }
  return c.result(value as unknown as GoldDecisionSet);
}

export interface ValidatedGoldDecisionSet {
  readonly set: GoldDecisionSet;
  /** Cases in manifest order. */
  readonly cases: readonly GoldDecisionCase[];
}

/**
 * Validates a manifest together with the exact cases it binds: every
 * manifest entry has exactly one case with the same hash, split and
 * dataset identity; no extra case is present; request identities are
 * unique; labeling rules exist and match the case capability;
 * permutation groups are genuine permutations with identical truth in
 * one split; declared distributions equal recomputed counts.
 */
export function validateGoldDecisionSet(
  manifestValue: unknown,
  caseValues: readonly unknown[],
): GoldDecisionValidation<ValidatedGoldDecisionSet> {
  const c = new GoldDecisionIssueCollector();
  const manifestCheck = validateGoldDecisionSetManifest(manifestValue);
  if (!manifestCheck.ok) c.addAll(manifestCheck.issues, "set");
  if (!Array.isArray(caseValues)) {
    c.add("case_invalid", "cases");
    return c.result(null as unknown as ValidatedGoldDecisionSet);
  }
  const byId = new Map<string, GoldDecisionCase>();
  caseValues.forEach((value, index) => {
    const check = validateGoldDecisionCase(value);
    if (!check.ok) {
      c.addAll(check.issues, `cases[${index}]`);
      c.add("case_invalid", `cases[${index}]`);
      return;
    }
    if (byId.has(check.value.case_id)) {
      c.add("duplicate_case_id", `cases[${index}].case_id`);
      return;
    }
    byId.set(check.value.case_id, check.value);
  });
  if (!manifestCheck.ok || c.issues.length > 0)
    return c.result(null as unknown as ValidatedGoldDecisionSet);

  const set = manifestCheck.value;
  const ordered: GoldDecisionCase[] = [];
  const listed = new Set<string>();
  set.cases.forEach((entry, index) => {
    listed.add(entry.case_id);
    const goldCase = byId.get(entry.case_id);
    if (goldCase === undefined) {
      c.add("case_missing", `set.cases[${index}]`);
      return;
    }
    if (goldCase.case_hash !== entry.case_hash)
      c.add("case_hash_binding_mismatch", `set.cases[${index}].case_hash`);
    if (goldCase.split !== entry.split)
      c.add("case_split_mismatch", `set.cases[${index}].split`);
    if (
      goldCase.dataset_id !== set.dataset_id ||
      goldCase.dataset_version !== set.dataset_version
    )
      c.add("case_dataset_mismatch", `set.cases[${index}]`);
    ordered.push(goldCase);
  });
  for (const id of byId.keys()) {
    if (!listed.has(id)) c.add("case_not_in_manifest", `cases.${id}`);
  }

  const rules = new Map(set.labeling_rules.map((rule) => [rule.rule_id, rule]));
  const requestIds = new Set<string>();
  const groups = new Map<string, GoldDecisionCase[]>();
  for (const goldCase of ordered) {
    const at = `cases.${goldCase.case_id}`;
    if (requestIds.has(goldCase.request.request_id))
      c.add("duplicate_request_id", `${at}.request.request_id`);
    requestIds.add(goldCase.request.request_id);
    const rule = rules.get(goldCase.provenance.labeling_rule_id);
    if (rule === undefined)
      c.add("labeling_rule_unknown", `${at}.provenance.labeling_rule_id`);
    else if (rule.capability_id !== goldCase.request.capability_id)
      c.add(
        "labeling_rule_capability_mismatch",
        `${at}.provenance.labeling_rule_id`,
      );
    if (goldCase.permutation_group_id !== null) {
      const members = groups.get(goldCase.permutation_group_id) ?? [];
      members.push(goldCase);
      groups.set(goldCase.permutation_group_id, members);
    }
  }

  for (const [groupId, members] of [...groups.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const at = `permutation_groups.${groupId}`;
    if (members.length < 2) {
      c.add("permutation_group_singleton", at);
      continue;
    }
    const first = members[0]!;
    const firstSemantic = computeTypedDecisionSemanticRequestHash(
      first.request,
    );
    const presentations = new Set<string>();
    for (const member of members) {
      if (member.split !== first.split)
        c.add("permutation_group_split_mismatch", at);
      if (
        computeTypedDecisionSemanticRequestHash(member.request) !==
        firstSemantic
      )
        c.add("permutation_group_semantic_mismatch", at);
      // Presentation identity: the exact request minus its invocation id.
      // Two members presenting options and facts in the same order are
      // not a permutation pair.
      const presented = canonicalizeTypedDecisionJson({
        ...member.request,
        request_id: null,
      });
      if (presentations.has(presented))
        c.add("permutation_group_not_permuted", at);
      presentations.add(presented);
      if (
        !canonicalEqual(member.expected, first.expected) ||
        member.abstention_policy !== first.abstention_policy ||
        member.language !== first.language ||
        member.jurisdiction !== first.jurisdiction
      )
        c.add("permutation_group_truth_mismatch", at);
    }
  }

  const recomputed: Record<(typeof DISTRIBUTION_KEYS)[number], Record_> = {
    split_distribution: countBy(ordered.map((x) => x.split)),
    decision_type_distribution: countBy(
      ordered.map((x) => x.request.decision_type),
    ),
    language_distribution: countBy(ordered.map((x) => x.language)),
    jurisdiction_distribution: countBy(ordered.map((x) => x.jurisdiction)),
    capability_distribution: countBy(
      ordered.map((x) => x.request.capability_id),
    ),
  };
  for (const key of DISTRIBUTION_KEYS) {
    if (!canonicalEqual(set[key], recomputed[key]))
      c.add("distribution_mismatch", `set.${key}`);
  }
  return c.result({ set, cases: ordered });
}

/**
 * Validates that `next` is a legitimate successor of `previous`. Once a
 * set is `approved` (published), its test cases are immutable: every
 * previous test case must remain in `next` with the same hash and in
 * the test split, and no previously published case may change split.
 * New cases may be added in a new version; nothing is rewritten in
 * place.
 */
export function validateGoldDecisionSetSuccession(
  previousValue: unknown,
  nextValue: unknown,
): GoldDecisionValidation<GoldDecisionSet> {
  const c = new GoldDecisionIssueCollector();
  const previousCheck = validateGoldDecisionSetManifest(previousValue);
  const nextCheck = validateGoldDecisionSetManifest(nextValue);
  if (!previousCheck.ok) c.addAll(previousCheck.issues, "previous");
  if (!nextCheck.ok) c.addAll(nextCheck.issues, "next");
  if (!previousCheck.ok || !nextCheck.ok)
    return c.result(null as unknown as GoldDecisionSet);
  const previous = previousCheck.value;
  const next = nextCheck.value;
  if (next.dataset_id !== previous.dataset_id)
    c.add("succession_dataset_mismatch", "next.dataset_id");
  if (
    next.supersedes === null ||
    next.supersedes.dataset_version !== previous.dataset_version ||
    next.supersedes.dataset_hash !== previous.dataset_hash
  )
    c.add("succession_supersedes_mismatch", "next.supersedes");
  if (
    compareGoldDecisionVersions(
      next.dataset_version,
      previous.dataset_version,
    ) <= 0
  )
    c.add("succession_version_not_increased", "next.dataset_version");
  if (previous.review.state === "approved") {
    const nextById = new Map(next.cases.map((entry) => [entry.case_id, entry]));
    for (const entry of previous.cases) {
      const successor = nextById.get(entry.case_id);
      const at = `next.cases.${entry.case_id}`;
      if (entry.split === "test") {
        if (successor === undefined) c.add("test_case_removed", at);
        else if (successor.case_hash !== entry.case_hash)
          c.add("test_case_mutated", at);
      }
      if (successor !== undefined && successor.split !== entry.split)
        c.add("case_split_changed", at);
    }
  }
  return c.result(next);
}

// ---------------------------------------------------------------------
// Case evaluation record
// ---------------------------------------------------------------------

const EVALUATION_KEYS = [
  "contract",
  "schema_version",
  "scoring_policy",
  "case_id",
  "case_hash",
  "dataset_id",
  "dataset_version",
  "split",
  "decision_type",
  "capability_id",
  "language",
  "jurisdiction",
  "abstention_policy",
  "candidate_result_hash",
  "outcome",
  "correctness",
  "abstention_outcome",
  "abstention_reason_code",
  "score_error",
  "probability_evidence",
  "error_codes",
  "result_issue_codes",
  "evaluation_hash",
] as const;

/** The only consistent `(correctness, abstention_outcome)` per outcome. */
export const GOLD_DECISION_OUTCOME_SEMANTICS: Readonly<
  Record<
    GoldDecisionOutcome,
    {
      readonly correctness: GoldDecisionCorrectness;
      readonly abstention_outcome: GoldDecisionAbstentionOutcome;
    }
  >
> = Object.freeze({
  correct_decision: {
    correctness: "correct",
    abstention_outcome: "not_abstained",
  },
  incorrect_decision: {
    correctness: "incorrect",
    abstention_outcome: "not_abstained",
  },
  correct_abstention: { correctness: "correct", abstention_outcome: "correct" },
  permitted_abstention: {
    correctness: "not_applicable",
    abstention_outcome: "permitted",
  },
  incorrect_abstention: {
    correctness: "incorrect",
    abstention_outcome: "incorrect",
  },
  no_decision: {
    correctness: "not_applicable",
    abstention_outcome: "not_abstained",
  },
  invalid_result: {
    correctness: "not_applicable",
    abstention_outcome: "not_abstained",
  },
});

const ABSTENTION_POLICY_FOR_OUTCOME: Partial<
  Record<GoldDecisionOutcome, string>
> = {
  correct_abstention: "required",
  permitted_abstention: "allowed",
  incorrect_abstention: "not_allowed",
};

function strictlyAscendingCodes(
  value: unknown,
  vocabulary: readonly string[],
): value is string[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (code, index) =>
      includes(vocabulary, code) &&
      (index === 0 || (value[index - 1] as string) < code),
  );
}

/**
 * Validates a case evaluation record on its own: closed shape, closed
 * vocabularies, outcome/correctness/abstention consistency, per-type
 * error evidence and self-hash. Binding to a specific case and dataset
 * is checked by the aggregator.
 */
export function validateGoldDecisionCaseEvaluation(
  value: unknown,
): GoldDecisionValidation<GoldDecisionCaseEvaluation> {
  const c = new GoldDecisionIssueCollector();
  const at = "evaluation";
  if (
    !isRecord(value) ||
    value["contract"] !== "gold_decision_case_evaluation"
  ) {
    c.add("contract_invalid", at);
    return c.result(value as GoldDecisionCaseEvaluation);
  }
  closed(value, EVALUATION_KEYS, at, c);
  checkGlobalForbidden(value, at, c);
  checkSchemaVersion(value["schema_version"], `${at}.schema_version`, c);
  if (!includes(GOLD_DECISION_SCORING_POLICIES, value["scoring_policy"]))
    c.add("scoring_policy_invalid", `${at}.scoring_policy`);
  if (!isGoldDecisionId(value["case_id"]))
    c.add("identifier_invalid", `${at}.case_id`);
  if (!isHash(value["case_hash"])) c.add("hash_invalid", `${at}.case_hash`);
  if (!isGoldDecisionId(value["dataset_id"]))
    c.add("dataset_identity_invalid", `${at}.dataset_id`);
  if (!isVersion(value["dataset_version"]))
    c.add("dataset_identity_invalid", `${at}.dataset_version`);
  if (!includes(GOLD_DECISION_SPLITS, value["split"]))
    c.add("split_invalid", `${at}.split`);
  const decisionType = value["decision_type"];
  if (!includes(TYPED_DECISION_TYPES, decisionType))
    c.add("evaluation_invalid", `${at}.decision_type`);
  const capability = value["capability_id"];
  if (
    typeof capability !== "string" ||
    !capability.startsWith(GOLD_DECISION_CAPABILITY_PREFIX)
  )
    c.add("capability_not_synthetic", `${at}.capability_id`);
  if (!includes(GOLD_DECISION_LANGUAGES, value["language"]))
    c.add("language_invalid", `${at}.language`);
  if (!includes(GOLD_DECISION_JURISDICTIONS, value["jurisdiction"]))
    c.add("jurisdiction_invalid", `${at}.jurisdiction`);
  const policy = value["abstention_policy"];
  if (!includes(GOLD_DECISION_ABSTENTION_POLICIES, policy))
    c.add("abstention_policy_invalid", `${at}.abstention_policy`);
  const resultHash = value["candidate_result_hash"];
  if (resultHash !== null && !isHash(resultHash))
    c.add("hash_invalid", `${at}.candidate_result_hash`);

  const outcome = value["outcome"];
  if (!includes(GOLD_DECISION_OUTCOMES, outcome)) {
    c.add("evaluation_invalid", `${at}.outcome`);
  } else {
    const semantics = GOLD_DECISION_OUTCOME_SEMANTICS[outcome];
    if (!includes(GOLD_DECISION_CORRECTNESS, value["correctness"]))
      c.add("evaluation_invalid", `${at}.correctness`);
    else if (value["correctness"] !== semantics.correctness)
      c.add("evaluation_consistency_invalid", `${at}.correctness`);
    if (
      !includes(GOLD_DECISION_ABSTENTION_OUTCOMES, value["abstention_outcome"])
    )
      c.add("evaluation_invalid", `${at}.abstention_outcome`);
    else if (value["abstention_outcome"] !== semantics.abstention_outcome)
      c.add("evaluation_consistency_invalid", `${at}.abstention_outcome`);

    const requiredPolicy = ABSTENTION_POLICY_FOR_OUTCOME[outcome];
    if (requiredPolicy !== undefined && policy !== requiredPolicy)
      c.add("evaluation_consistency_invalid", `${at}.abstention_policy`);
    if (outcome === "correct_decision" && policy === "required")
      c.add("evaluation_consistency_invalid", `${at}.abstention_policy`);

    const reason = value["abstention_reason_code"];
    const abstained = semantics.abstention_outcome !== "not_abstained";
    if (abstained && !includes(TYPED_DECISION_ABSTENTION_REASONS, reason))
      c.add("evaluation_consistency_invalid", `${at}.abstention_reason_code`);
    if (!abstained && reason !== null)
      c.add("evaluation_consistency_invalid", `${at}.abstention_reason_code`);

    if (resultHash === null && outcome !== "invalid_result")
      c.add("evaluation_consistency_invalid", `${at}.candidate_result_hash`);

    const scored =
      (outcome === "correct_decision" || outcome === "incorrect_decision") &&
      policy !== "required";
    const scoreError = value["score_error"];
    if (scoreError !== null) {
      if (!isRecord(scoreError)) {
        c.add("evaluation_invalid", `${at}.score_error`);
      } else {
        closed(
          scoreError,
          ["scale_id", "absolute_error"],
          `${at}.score_error`,
          c,
        );
        const err = scoreError["absolute_error"];
        if (!isGoldDecisionId(scoreError["scale_id"]))
          c.add("evaluation_invalid", `${at}.score_error.scale_id`);
        if (!isSafeInt(err) || err < 0)
          c.add("evaluation_invalid", `${at}.score_error.absolute_error`);
        else if ((outcome === "correct_decision") !== (err === 0))
          c.add(
            "evaluation_consistency_invalid",
            `${at}.score_error.absolute_error`,
          );
      }
    }
    if ((scoreError !== null) !== (scored && decisionType === "score"))
      c.add("evaluation_consistency_invalid", `${at}.score_error`);

    const evidence = value["probability_evidence"];
    if (evidence !== null) {
      const ep = `${at}.probability_evidence`;
      if (!isRecord(evidence)) {
        c.add("evaluation_invalid", ep);
      } else {
        closed(evidence, ["kind", "squared_error_micros2"], ep, c);
        const kind = evidence["kind"];
        const sq = evidence["squared_error_micros2"];
        const max = PROBABILITY_MICROS_SCALE * PROBABILITY_MICROS_SCALE;
        if (
          !(kind === "choice_multiclass" && decisionType === "choice") &&
          !(kind === "boolean_binary" && decisionType === "boolean")
        )
          c.add("evaluation_consistency_invalid", `${ep}.kind`);
        if (
          !isSafeInt(sq) ||
          sq < 0 ||
          sq > (kind === "choice_multiclass" ? 2 * max : max)
        )
          c.add("evaluation_invalid", `${ep}.squared_error_micros2`);
        if (!scored) c.add("evaluation_consistency_invalid", ep);
      }
    }

    const errors = value["error_codes"];
    if (!strictlyAscendingCodes(errors, GOLD_DECISION_EVALUATION_ERROR_CODES)) {
      c.add("evaluation_invalid", `${at}.error_codes`);
    } else {
      const expectErrors =
        semantics.correctness === "incorrect" ||
        outcome === "no_decision" ||
        outcome === "invalid_result";
      if (expectErrors !== errors.length > 0)
        c.add("evaluation_consistency_invalid", `${at}.error_codes`);
    }
    const issues = value["result_issue_codes"];
    if (!strictlyAscendingCodes(issues, TYPED_DECISION_ISSUE_CODES)) {
      c.add("evaluation_invalid", `${at}.result_issue_codes`);
    } else if ((outcome === "invalid_result") !== issues.length > 0) {
      c.add("evaluation_consistency_invalid", `${at}.result_issue_codes`);
    }
  }

  if (!isHash(value["evaluation_hash"])) {
    c.add("evaluation_hash_mismatch", `${at}.evaluation_hash`);
  } else if (c.issues.length === 0) {
    const computed = checkedHash(() =>
      computeGoldDecisionEvaluationHash(
        value as unknown as GoldDecisionCaseEvaluation,
      ),
    );
    if (computed !== value["evaluation_hash"])
      c.add("evaluation_hash_mismatch", `${at}.evaluation_hash`);
  }
  return c.result(value as unknown as GoldDecisionCaseEvaluation);
}
