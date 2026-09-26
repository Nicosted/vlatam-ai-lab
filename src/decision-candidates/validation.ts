/**
 * AI-142 — pure, fail-closed validators for typed decision candidate
 * registry artifacts.
 *
 * Rules (same discipline as AI-140 and AI-141):
 *  - Validators are pure. They never throw, log, coerce, normalize,
 *    reorder, de-duplicate or repair a value, and never read the clock,
 *    the environment, the filesystem or the network.
 *  - Every object is closed: unknown properties fail.
 *  - Issues use a closed vocabulary of stable machine codes.
 *  - A valid candidate entry or registry grants no authority of any kind:
 *    not execution, benchmark execution, promotion, production use,
 *    routing or traffic.
 */

import { findForbiddenFieldPaths } from "../capabilities/validation.js";
import { canonicalizeTypedDecisionJson } from "../decision/canonical.js";
import { PRIVATE_REASONING_FIELD_NAMES } from "../decision/validation.js";
import {
  computeDecisionCandidateHash,
  computeDecisionCandidateRegistryHash,
} from "./canonical.js";
import {
  DECISION_CANDIDATE_ARCHIVE_STATES,
  DECISION_CANDIDATE_CLAIM_KINDS,
  DECISION_CANDIDATE_CLAIM_VERIFICATIONS,
  DECISION_CANDIDATE_DECLARED_IDENTIFIER_PATTERN,
  DECISION_CANDIDATE_EVIDENCE_COMPLETENESS,
  DECISION_CANDIDATE_EVIDENCE_GAPS,
  DECISION_CANDIDATE_EVIDENCE_KINDS,
  DECISION_CANDIDATE_GIT_SHA_PATTERN,
  DECISION_CANDIDATE_ID_PATTERN,
  DECISION_CANDIDATE_LICENSE_EVIDENCE_KINDS,
  DECISION_CANDIDATE_LICENSE_STATUSES,
  DECISION_CANDIDATE_LIMITS,
  DECISION_CANDIDATE_LOCAL_ID_PATTERN,
  DECISION_CANDIDATE_PROVENANCE_STATUSES,
  DECISION_CANDIDATE_REGISTRY_ID_PATTERN,
  DECISION_CANDIDATE_REGISTRY_REVIEW_STATES,
  DECISION_CANDIDATE_REGISTRY_STATES,
  DECISION_CANDIDATE_REPOSITORY_PATTERN,
  DECISION_CANDIDATE_ROLES,
  DECISION_CANDIDATE_SHA256_PATTERN,
  DECISION_CANDIDATE_TIMESTAMP_PATTERN,
  DECISION_CANDIDATE_UPSTREAM_HOSTS,
  DECISION_CANDIDATE_VERSION_PATTERN,
  DECISION_CANDIDATE_WEIGHTS_INVOLVEMENT,
  DECISION_CANDIDATE_WEIGHTS_LOCATIONS,
  SUPPORTED_DECISION_CANDIDATE_CONTRACT_MAJORS,
  type DecisionCandidateEntry,
  type DecisionCandidateEvidenceGap,
  type DecisionCandidateEvidenceKind,
  type DecisionCandidateRegistry,
} from "./contracts.js";

export const DECISION_CANDIDATE_ISSUE_CODES = [
  "contract_invalid",
  "unknown_property",
  "missing_property",
  "forbidden_field",
  "private_reasoning_forbidden",
  "authority_field_forbidden",
  "credential_value_forbidden",
  "legal_conclusion_forbidden",
  "schema_version_invalid",
  "schema_version_unsupported",
  "candidate_id_invalid",
  "evidence_revision_invalid",
  "supersedes_invalid",
  "display_name_invalid",
  // roles
  "roles_invalid",
  "role_unknown",
  "duplicate_role",
  "role_order_invalid",
  // upstream
  "upstream_invalid",
  "upstream_host_invalid",
  "repository_invalid",
  "repository_url_mismatch",
  "upstream_revision_unpinned",
  "commit_sha_invalid",
  "default_branch_invalid",
  "archive_state_invalid",
  "timestamp_invalid",
  // evidence
  "evidence_empty",
  "evidence_invalid",
  "evidence_kind_invalid",
  "duplicate_evidence_id",
  "evidence_order_invalid",
  "evidence_repository_mismatch",
  "evidence_commit_mismatch",
  "evidence_locator_invalid",
  "mutable_evidence_reference",
  "evidence_hash_invalid",
  "evidence_ref_invalid",
  "evidence_ref_unknown",
  "evidence_ref_missing",
  // licensing and provenance
  "licensing_invalid",
  "license_status_invalid",
  "license_identifier_inconsistent",
  "license_evidence_insufficient",
  "license_layer_inferred",
  "weights_inconsistent",
  "base_model_inconsistent",
  "training_data_invalid",
  // claims
  "claims_invalid",
  "claim_invalid",
  "claim_kind_invalid",
  "duplicate_claim_id",
  "claim_order_invalid",
  "claim_statement_invalid",
  "claim_verification_invalid",
  // derived state
  "evidence_gaps_mismatch",
  "evidence_completeness_mismatch",
  "lifecycle_invalid",
  "candidate_hash_mismatch",
  // registry manifest
  "registry_identity_invalid",
  "review_invalid",
  "authority_invalid",
  "registry_empty",
  "candidate_binding_invalid",
  "candidate_order_invalid",
  "duplicate_candidate_id",
  "duplicate_candidate_hash",
  "distribution_invalid",
  "distribution_mismatch",
  "registry_hash_mismatch",
  // registry with entries
  "candidate_invalid",
  "candidate_missing",
  "candidate_not_in_registry",
  "candidate_binding_mismatch",
  // succession
  "succession_identity_mismatch",
  "succession_revision_invalid",
  "succession_supersedes_mismatch",
  "succession_version_not_increased",
  "candidate_removed",
  "candidate_rewritten_without_revision",
] as const;
export type DecisionCandidateIssueCode =
  (typeof DECISION_CANDIDATE_ISSUE_CODES)[number];

export interface DecisionCandidateIssue {
  readonly code: DecisionCandidateIssueCode;
  readonly path: string;
}

export type DecisionCandidateValidation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly DecisionCandidateIssue[] };

/**
 * Field names that would let a registry document grant itself authority:
 * approval, activation, promotion, traffic, routing, ranking or an
 * execution command. The contract carries none of them; any occurrence at
 * any depth fails closed with a dedicated code.
 */
export const DECISION_CANDIDATE_AUTHORITY_FIELD_NAMES = new Set<string>([
  "activate",
  "activated",
  "activation",
  "activation_ref",
  "approval",
  "approval_id",
  "approval_ref",
  "approval_state",
  "approved",
  "approved_at",
  "approved_by",
  "command",
  "enabled",
  "entrypoint",
  "execute",
  "install",
  "install_command",
  "invoke",
  "kill_switch",
  "leaderboard",
  "lifecycle_status",
  "preferred",
  "promoted",
  "promotion",
  "promotion_authority",
  "promotion_ref",
  "rank",
  "ranking",
  "route",
  "routing",
  "run_command",
  "score",
  "self_approval",
  "tier",
  "traffic",
  "traffic_stage",
  "winner",
]);

/** Credential-shaped string values (tokens, keys, userinfo URLs). */
const CREDENTIAL_VALUE_PATTERN =
  /\b(?:ghp|gho|ghs|ghu|ghr|github_pat)_[A-Za-z0-9_]{16,}|\bhf_[A-Za-z0-9]{16,}|\bsk-[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|:\/\/[^/\s:@]+:[^/\s@]+@/;

/**
 * Legal or commercial conclusions. AI-142 records license evidence; it
 * never states that anything is legally or commercially cleared.
 */
const LEGAL_CONCLUSION_PATTERN =
  /commercial(?:ly)?[\s_-]+(?:safe|approved|cleared|use[\s_-]+(?:approved|cleared|allowed|safe))|legal(?:ly)?[\s_-]+(?:approved|cleared|safe)|license[\s_-]+(?:approved|cleared)|safe[\s_-]+for[\s_-]+commercial/i;

type Record_ = Record<string, unknown>;

function isRecord(value: unknown): value is Record_ {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class Collector {
  readonly issues: DecisionCandidateIssue[] = [];
  add(code: DecisionCandidateIssueCode, path: string): void {
    this.issues.push({ code, path });
  }
  addAll(issues: readonly DecisionCandidateIssue[], prefix: string): void {
    for (const issue of issues)
      this.add(issue.code, `${prefix}${issue.path.replace(/^[a-z_]+/, "")}`);
  }
  result<T>(value: T): DecisionCandidateValidation<T> {
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

function includes<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return (
    typeof value === "string" && (list as readonly string[]).includes(value)
  );
}

function matches(pattern: RegExp, value: unknown): value is string {
  return typeof value === "string" && pattern.test(value);
}

function isSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isLocalId(value: unknown): value is string {
  return matches(DECISION_CANDIDATE_LOCAL_ID_PATTERN, value);
}

function isGitSha(value: unknown): value is string {
  return matches(DECISION_CANDIDATE_GIT_SHA_PATTERN, value);
}

function isSha256(value: unknown): value is string {
  return matches(DECISION_CANDIDATE_SHA256_PATTERN, value);
}

export function isDecisionCandidateId(value: unknown): value is string {
  return matches(DECISION_CANDIDATE_ID_PATTERN, value);
}

/** Printable, trimmed, bounded text with no control characters. */
function boundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= max &&
    value.trim() === value &&
    // eslint-disable-next-line no-control-regex
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** UTC second-precision timestamp with a real calendar date. */
function isTimestamp(value: unknown): value is string {
  if (!matches(DECISION_CANDIDATE_TIMESTAMP_PATTERN, value)) return false;
  const [y, mo, d, h, mi, s] = value.match(/\d+/g)!.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return false;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const max = mo === 2 && !leap ? 28 : DAYS_IN_MONTH[mo - 1]!;
  return d <= max;
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

function checkedHash(compute: () => string): string | null {
  try {
    return compute();
  } catch {
    return null;
  }
}

function checkSchemaVersion(value: unknown, path: string, c: Collector): void {
  if (!matches(DECISION_CANDIDATE_VERSION_PATTERN, value)) {
    c.add("schema_version_invalid", path);
    return;
  }
  const major = Number(value.split(".")[0]);
  if (
    !(
      SUPPORTED_DECISION_CANDIDATE_CONTRACT_MAJORS as readonly number[]
    ).includes(major)
  )
    c.add("schema_version_unsupported", path);
}

/**
 * Walks every key and string value: provider/model/credential field
 * names, private reasoning, authority-granting fields, credential-shaped
 * values and legal or commercial conclusions all fail closed.
 */
function checkGlobalForbidden(
  value: unknown,
  root: string,
  c: Collector,
): void {
  for (const path of findForbiddenFieldPaths(value, 16))
    c.add("forbidden_field", `${root}.${path}`);
  const seen = new Set<unknown>();
  const walk = (node: unknown, path: string, depth: number): void => {
    if (depth > 16) return;
    if (typeof node === "string") {
      if (CREDENTIAL_VALUE_PATTERN.test(node))
        c.add("credential_value_forbidden", path);
      if (LEGAL_CONCLUSION_PATTERN.test(node))
        c.add("legal_conclusion_forbidden", path);
      return;
    }
    if (node === null || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      const childPath = `${path}.${key}`;
      const lower = key.toLowerCase();
      if (PRIVATE_REASONING_FIELD_NAMES.has(lower))
        c.add("private_reasoning_forbidden", childPath);
      if (DECISION_CANDIDATE_AUTHORITY_FIELD_NAMES.has(lower))
        c.add("authority_field_forbidden", childPath);
      if (LEGAL_CONCLUSION_PATTERN.test(key))
        c.add("legal_conclusion_forbidden", childPath);
      walk(child, childPath, depth + 1);
    }
  };
  walk(value, root, 0);
}

function checkConstObject(
  value: unknown,
  expected: Record_,
  code: DecisionCandidateIssueCode,
  path: string,
  c: Collector,
): void {
  if (!isRecord(value)) {
    c.add(code, path);
    return;
  }
  closed(value, Object.keys(expected), path, c);
  for (const [key, want] of Object.entries(expected)) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      !canonicalEqual(value[key], want)
    )
      c.add(code, `${path}.${key}`);
  }
}

/**
 * A 40-hex lowercase commit is pinned. Anything hex-looking but malformed
 * (abbreviated, upper-case, too long) is an invalid SHA; anything else is
 * a mutable reference such as a branch or tag name.
 */
function checkCommit(value: unknown, path: string, c: Collector): boolean {
  if (isGitSha(value)) return true;
  if (typeof value === "string" && /^[A-Fa-f0-9]{4,64}$/.test(value))
    c.add("commit_sha_invalid", path);
  else c.add("upstream_revision_unpinned", path);
  return false;
}

/**
 * Evidence id references: strictly ascending, unique, each naming an
 * evidence record of this entry. Never re-sorted.
 */
function checkRefs(
  value: unknown,
  path: string,
  known: ReadonlyMap<string, DecisionCandidateEvidenceKind>,
  min: number,
  c: Collector,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > DECISION_CANDIDATE_LIMITS.max_refs
  ) {
    c.add("evidence_ref_invalid", path);
    return [];
  }
  if (value.length < min) c.add("evidence_ref_missing", path);
  const refs: string[] = [];
  value.forEach((ref: unknown, index) => {
    const at = `${path}[${index}]`;
    if (!isLocalId(ref)) {
      c.add("evidence_ref_invalid", at);
      return;
    }
    if (index > 0 && !((value[index - 1] as string) < ref))
      c.add("evidence_ref_invalid", at);
    if (!known.has(ref)) c.add("evidence_ref_unknown", at);
    refs.push(ref);
  });
  return refs;
}

// ---------------------------------------------------------------------
// Evidence gaps
// ---------------------------------------------------------------------

/**
 * Derives the evidence gaps of an entry from its upstream and licensing
 * fields, in vocabulary order. Pure; no field is inferred from another.
 */
export function deriveDecisionCandidateEvidenceGaps(entry: {
  readonly upstream: Pick<DecisionCandidateEntry["upstream"], "archive_state">;
  readonly licensing: DecisionCandidateEntry["licensing"];
}): readonly DecisionCandidateEvidenceGap[] {
  const { upstream, licensing } = entry;
  const gaps = new Set<DecisionCandidateEvidenceGap>();
  if (upstream.archive_state === "unresolved")
    gaps.add("archive_state_unresolved");
  if (licensing.base_model.status === "unresolved")
    gaps.add("base_model_license_unresolved");
  if (licensing.code.status === "unresolved")
    gaps.add("code_license_unresolved");
  if (
    licensing.training_data.status === "unresolved" ||
    licensing.training_data.status === "partially_evidenced"
  )
    gaps.add("training_data_provenance_incomplete");
  if (licensing.weights.involvement === "unresolved")
    gaps.add("weights_involvement_unresolved");
  if (licensing.weights.status === "unresolved")
    gaps.add("weights_license_unresolved");
  if (licensing.weights.location === "unresolved")
    gaps.add("weights_location_unresolved");
  return DECISION_CANDIDATE_EVIDENCE_GAPS.filter((gap) => gaps.has(gap));
}

// ---------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------

const ENTRY_KEYS = [
  "contract",
  "schema_version",
  "candidate_id",
  "evidence_revision",
  "supersedes",
  "display_name",
  "roles",
  "upstream",
  "evidence",
  "licensing",
  "upstream_claims",
  "evidence_gaps",
  "evidence_completeness",
  "lifecycle",
  "candidate_hash",
] as const;

const UPSTREAM_KEYS = [
  "host",
  "requested_repository",
  "repository",
  "repository_url",
  "pinned_commit_sha",
  "default_branch_at_observation",
  "archive_state",
  "observed_at",
] as const;

const EVIDENCE_KEYS = [
  "evidence_id",
  "evidence_kind",
  "locator",
  "content_sha256",
  "observed_at",
] as const;

const LOCATOR_KEYS = [
  "repository",
  "commit_sha",
  "path",
  "blob_sha",
  "source_url",
] as const;

const CLAIM_KEYS = [
  "claim_id",
  "claim_kind",
  "statement",
  "evidence_refs",
  "verification",
] as const;

/** Constant lifecycle: registration grants nothing. */
export const DECISION_CANDIDATE_LIFECYCLE = {
  registry_state: DECISION_CANDIDATE_REGISTRY_STATES[0],
  ai_lab_executed: false,
  execution_enabled: false,
  benchmark_execution_enabled: false,
  promotion_eligible: false,
  production_eligible: false,
  routing_enabled: false,
  authority: "evidence_only",
} as const;

/** Repository-relative file path without traversal or URL-special characters. */
const EVIDENCE_PATH_PATTERN =
  /^(?!\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

function expectedSourceUrl(
  repository: string,
  commit: string,
  path: string | null,
): string {
  return path === null
    ? `https://github.com/${repository}/tree/${commit}`
    : `https://github.com/${repository}/blob/${commit}/${path}`;
}

function checkUpstream(
  value: unknown,
  c: Collector,
): { repository: string; commit: string } | null {
  const at = "candidate.upstream";
  if (!isRecord(value)) {
    c.add("upstream_invalid", at);
    return null;
  }
  closed(value, UPSTREAM_KEYS, at, c);
  if (!includes(DECISION_CANDIDATE_UPSTREAM_HOSTS, value["host"]))
    c.add("upstream_host_invalid", `${at}.host`);
  const requested = value["requested_repository"];
  const repository = value["repository"];
  if (!matches(DECISION_CANDIDATE_REPOSITORY_PATTERN, requested))
    c.add("repository_invalid", `${at}.requested_repository`);
  const repositoryOk = matches(
    DECISION_CANDIDATE_REPOSITORY_PATTERN,
    repository,
  );
  if (!repositoryOk) c.add("repository_invalid", `${at}.repository`);
  else if (value["repository_url"] !== `https://github.com/${repository}`)
    c.add("repository_url_mismatch", `${at}.repository_url`);
  const commitOk = checkCommit(
    value["pinned_commit_sha"],
    `${at}.pinned_commit_sha`,
    c,
  );
  const branch = value["default_branch_at_observation"];
  if (
    !matches(/^[A-Za-z0-9._/-]{1,100}$/, branch) ||
    DECISION_CANDIDATE_GIT_SHA_PATTERN.test(branch)
  )
    c.add("default_branch_invalid", `${at}.default_branch_at_observation`);
  if (!includes(DECISION_CANDIDATE_ARCHIVE_STATES, value["archive_state"]))
    c.add("archive_state_invalid", `${at}.archive_state`);
  if (!isTimestamp(value["observed_at"]))
    c.add("timestamp_invalid", `${at}.observed_at`);
  return repositoryOk && commitOk
    ? {
        repository: repository as string,
        commit: value["pinned_commit_sha"] as string,
      }
    : null;
}

function checkEvidence(
  value: unknown,
  upstream: { repository: string; commit: string } | null,
  c: Collector,
): Map<string, DecisionCandidateEvidenceKind> {
  const known = new Map<string, DecisionCandidateEvidenceKind>();
  const at = "candidate.evidence";
  if (!Array.isArray(value) || value.length === 0) {
    c.add("evidence_empty", at);
    return known;
  }
  if (value.length > DECISION_CANDIDATE_LIMITS.max_evidence) {
    c.add("evidence_invalid", at);
    return known;
  }
  let previous: string | null = null;
  value.forEach((record: unknown, index) => {
    const rat = `${at}[${index}]`;
    if (!isRecord(record)) {
      c.add("evidence_invalid", rat);
      return;
    }
    closed(record, EVIDENCE_KEYS, rat, c);
    const id = record["evidence_id"];
    const kind = record["evidence_kind"];
    const kindOk = includes(DECISION_CANDIDATE_EVIDENCE_KINDS, kind);
    if (!kindOk) c.add("evidence_kind_invalid", `${rat}.evidence_kind`);
    if (!isLocalId(id)) {
      c.add("evidence_invalid", `${rat}.evidence_id`);
    } else if (known.has(id)) {
      c.add("duplicate_evidence_id", `${rat}.evidence_id`);
    } else {
      if (previous !== null && !(previous < id))
        c.add("evidence_order_invalid", `${rat}.evidence_id`);
      previous = id;
      if (kindOk) known.set(id, kind);
    }
    if (!isSha256(record["content_sha256"]))
      c.add("evidence_hash_invalid", `${rat}.content_sha256`);
    if (!isTimestamp(record["observed_at"]))
      c.add("timestamp_invalid", `${rat}.observed_at`);

    const locator = record["locator"];
    const lat = `${rat}.locator`;
    if (!isRecord(locator)) {
      c.add("evidence_locator_invalid", lat);
      return;
    }
    closed(locator, LOCATOR_KEYS, lat, c);
    const repository = locator["repository"];
    if (!matches(DECISION_CANDIDATE_REPOSITORY_PATTERN, repository))
      c.add("repository_invalid", `${lat}.repository`);
    else if (upstream !== null && repository !== upstream.repository)
      c.add("evidence_repository_mismatch", `${lat}.repository`);
    const commit = locator["commit_sha"];
    const commitOk = checkCommit(commit, `${lat}.commit_sha`, c);
    if (commitOk && upstream !== null && commit !== upstream.commit)
      c.add("evidence_commit_mismatch", `${lat}.commit_sha`);

    const path = locator["path"];
    const blob = locator["blob_sha"];
    const isMetadata = kind === "repository_metadata";
    let pathOk = false;
    if (isMetadata) {
      if (path !== null) c.add("evidence_locator_invalid", `${lat}.path`);
      if (blob !== null) c.add("evidence_locator_invalid", `${lat}.blob_sha`);
      pathOk = path === null;
    } else {
      pathOk =
        matches(EVIDENCE_PATH_PATTERN, path) &&
        path.length <= DECISION_CANDIDATE_LIMITS.max_path_length;
      if (!pathOk) c.add("evidence_locator_invalid", `${lat}.path`);
      if (!isGitSha(blob)) c.add("evidence_hash_invalid", `${lat}.blob_sha`);
    }

    // The source locator must be exactly the immutable commit URL. A URL
    // not pinned to the commit (a branch, tag or bare repository) is a
    // mutable-only reference.
    const url = locator["source_url"];
    if (typeof url !== "string") {
      c.add("evidence_locator_invalid", `${lat}.source_url`);
    } else if (
      commitOk &&
      matches(DECISION_CANDIDATE_REPOSITORY_PATTERN, repository) &&
      pathOk
    ) {
      const want = expectedSourceUrl(
        repository,
        commit as string,
        path as string | null,
      );
      if (url !== want)
        c.add(
          url.split(/[/?#]/).includes(commit as string)
            ? "evidence_locator_invalid"
            : "mutable_evidence_reference",
          `${lat}.source_url`,
        );
    } else if (!/\/[a-f0-9]{40}(?:\/|$)/.test(url)) {
      c.add("mutable_evidence_reference", `${lat}.source_url`);
    }
  });
  return known;
}

function checkRoles(
  value: unknown,
  known: ReadonlyMap<string, DecisionCandidateEvidenceKind>,
  c: Collector,
): void {
  const at = "candidate.roles";
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > DECISION_CANDIDATE_ROLES.length
  ) {
    c.add("roles_invalid", at);
    return;
  }
  const seen = new Set<string>();
  let previous: string | null = null;
  value.forEach((claim: unknown, index) => {
    const rat = `${at}[${index}]`;
    if (!isRecord(claim)) {
      c.add("roles_invalid", rat);
      return;
    }
    closed(claim, ["role", "evidence_refs"], rat, c);
    const role = claim["role"];
    if (!includes(DECISION_CANDIDATE_ROLES, role)) {
      c.add("role_unknown", `${rat}.role`);
    } else if (seen.has(role)) {
      c.add("duplicate_role", `${rat}.role`);
    } else {
      seen.add(role);
      if (previous !== null && !(previous < role))
        c.add("role_order_invalid", `${rat}.role`);
      previous = role;
    }
    // A role is admitted only when upstream evidence supports it.
    checkRefs(claim["evidence_refs"], `${rat}.evidence_refs`, known, 1, c);
  });
}

/**
 * Shared rule for every license-like layer:
 *  - `evidenced` needs a declared identifier and at least one reference
 *    to a license or model-card document; a README, package manifest or
 *    repository metadata alone never establishes a license.
 *  - `unresolved` carries no identifier.
 *  - `not_applicable` carries no identifier and must cite evidence.
 */
function checkLicenseStatus(
  layer: Record_,
  at: string,
  known: ReadonlyMap<string, DecisionCandidateEvidenceKind>,
  c: Collector,
): void {
  const status = layer["status"];
  const identifier = layer["declared_identifier"];
  if (!includes(DECISION_CANDIDATE_LICENSE_STATUSES, status)) {
    c.add("license_status_invalid", `${at}.status`);
    checkRefs(layer["evidence_refs"], `${at}.evidence_refs`, known, 0, c);
    return;
  }
  const refs = checkRefs(
    layer["evidence_refs"],
    `${at}.evidence_refs`,
    known,
    status === "unresolved" ? 0 : 1,
    c,
  );
  if (status === "evidenced") {
    if (!matches(DECISION_CANDIDATE_DECLARED_IDENTIFIER_PATTERN, identifier))
      c.add("license_identifier_inconsistent", `${at}.declared_identifier`);
    if (
      refs.length > 0 &&
      !refs.some((ref) =>
        includes(DECISION_CANDIDATE_LICENSE_EVIDENCE_KINDS, known.get(ref)),
      )
    )
      c.add("license_evidence_insufficient", `${at}.evidence_refs`);
  } else if (identifier !== null) {
    c.add("license_identifier_inconsistent", `${at}.declared_identifier`);
  }
}

function nullableText(value: unknown): boolean {
  return (
    value === null ||
    boundedText(value, DECISION_CANDIDATE_LIMITS.max_declared_text_length)
  );
}

function checkLicensing(
  value: unknown,
  known: ReadonlyMap<string, DecisionCandidateEvidenceKind>,
  c: Collector,
): void {
  const at = "candidate.licensing";
  if (!isRecord(value)) {
    c.add("licensing_invalid", at);
    return;
  }
  closed(value, ["code", "weights", "base_model", "training_data"], at, c);

  const code = value["code"];
  if (!isRecord(code)) {
    c.add("licensing_invalid", `${at}.code`);
  } else {
    closed(
      code,
      ["status", "declared_identifier", "evidence_refs"],
      `${at}.code`,
      c,
    );
    checkLicenseStatus(code, `${at}.code`, known, c);
  }

  const weights = value["weights"];
  const wat = `${at}.weights`;
  if (!isRecord(weights)) {
    c.add("licensing_invalid", wat);
  } else {
    closed(
      weights,
      [
        "involvement",
        "location",
        "declared_reference",
        "status",
        "declared_identifier",
        "evidence_refs",
      ],
      wat,
      c,
    );
    checkLicenseStatus(weights, wat, known, c);
    const involvement = weights["involvement"];
    const location = weights["location"];
    const reference = weights["declared_reference"];
    const status = weights["status"];
    if (!includes(DECISION_CANDIDATE_WEIGHTS_INVOLVEMENT, involvement))
      c.add("weights_inconsistent", `${wat}.involvement`);
    if (!includes(DECISION_CANDIDATE_WEIGHTS_LOCATIONS, location))
      c.add("weights_inconsistent", `${wat}.location`);
    if (!nullableText(reference))
      c.add("weights_inconsistent", `${wat}.declared_reference`);
    if (involvement === "not_involved") {
      // No weights: nothing to license or locate.
      if (location !== "not_applicable")
        c.add("weights_inconsistent", `${wat}.location`);
      if (status !== "not_applicable")
        c.add("weights_inconsistent", `${wat}.status`);
    } else if (involvement === "unresolved") {
      if (location !== "unresolved")
        c.add("weights_inconsistent", `${wat}.location`);
      if (status !== "unresolved")
        c.add("weights_inconsistent", `${wat}.status`);
    } else if (involvement === "involved") {
      // Weights exist: the weight license is its own layer and is never
      // inferred from the code license.
      if (location === "not_applicable")
        c.add("weights_inconsistent", `${wat}.location`);
      if (status === "not_applicable")
        c.add("weights_inconsistent", `${wat}.status`);
      if (
        Array.isArray(weights["evidence_refs"]) &&
        weights["evidence_refs"].length === 0
      )
        c.add("evidence_ref_missing", `${wat}.evidence_refs`);
    }
    if ((location === "external_reference") !== (reference !== null))
      c.add("weights_inconsistent", `${wat}.declared_reference`);
  }

  const base = value["base_model"];
  const bat = `${at}.base_model`;
  if (!isRecord(base)) {
    c.add("licensing_invalid", bat);
  } else {
    closed(
      base,
      ["status", "declared_name", "declared_identifier", "evidence_refs"],
      bat,
      c,
    );
    checkLicenseStatus(base, bat, known, c);
    const name = base["declared_name"];
    if (!nullableText(name))
      c.add("base_model_inconsistent", `${bat}.declared_name`);
    if (base["status"] === "evidenced" && name === null)
      c.add("base_model_inconsistent", `${bat}.declared_name`);
    if (base["status"] === "not_applicable" && name !== null)
      c.add("base_model_inconsistent", `${bat}.declared_name`);
  }

  // A weight or base-model license is never inferred from the code
  // license: an evidenced layer must cite license or model-card evidence
  // that the code layer does not already cite.
  const codeRefs = new Set(
    isRecord(code) && Array.isArray(code["evidence_refs"])
      ? (code["evidence_refs"] as unknown[])
      : [],
  );
  for (const [layer, lat] of [
    [weights, wat],
    [base, bat],
  ] as const) {
    if (
      isRecord(layer) &&
      layer["status"] === "evidenced" &&
      Array.isArray(layer["evidence_refs"]) &&
      layer["evidence_refs"].length > 0 &&
      !(layer["evidence_refs"] as unknown[]).some(
        (ref) =>
          !codeRefs.has(ref) &&
          typeof ref === "string" &&
          includes(DECISION_CANDIDATE_LICENSE_EVIDENCE_KINDS, known.get(ref)),
      ) &&
      (layer["evidence_refs"] as unknown[]).some((ref) => codeRefs.has(ref))
    )
      c.add("license_layer_inferred", `${lat}.evidence_refs`);
  }

  const training = value["training_data"];
  const tat = `${at}.training_data`;
  if (!isRecord(training)) {
    c.add("licensing_invalid", tat);
  } else {
    closed(training, ["status", "evidence_refs"], tat, c);
    const status = training["status"];
    if (!includes(DECISION_CANDIDATE_PROVENANCE_STATUSES, status))
      c.add("training_data_invalid", `${tat}.status`);
    checkRefs(
      training["evidence_refs"],
      `${tat}.evidence_refs`,
      known,
      status === "unresolved" ? 0 : 1,
      c,
    );
  }
}

function checkClaims(
  value: unknown,
  known: ReadonlyMap<string, DecisionCandidateEvidenceKind>,
  c: Collector,
): void {
  const at = "candidate.upstream_claims";
  if (
    !Array.isArray(value) ||
    value.length > DECISION_CANDIDATE_LIMITS.max_claims
  ) {
    c.add("claims_invalid", at);
    return;
  }
  const seen = new Set<string>();
  let previous: string | null = null;
  value.forEach((claim: unknown, index) => {
    const cat = `${at}[${index}]`;
    if (!isRecord(claim)) {
      c.add("claim_invalid", cat);
      return;
    }
    closed(claim, CLAIM_KEYS, cat, c);
    const id = claim["claim_id"];
    if (!isLocalId(id)) {
      c.add("claim_invalid", `${cat}.claim_id`);
    } else if (seen.has(id)) {
      c.add("duplicate_claim_id", `${cat}.claim_id`);
    } else {
      seen.add(id);
      if (previous !== null && !(previous < id))
        c.add("claim_order_invalid", `${cat}.claim_id`);
      previous = id;
    }
    if (!includes(DECISION_CANDIDATE_CLAIM_KINDS, claim["claim_kind"]))
      c.add("claim_kind_invalid", `${cat}.claim_kind`);
    if (
      !boundedText(
        claim["statement"],
        DECISION_CANDIDATE_LIMITS.max_statement_length,
      )
    )
      c.add("claim_statement_invalid", `${cat}.statement`);
    // An upstream claim without evidence is not admitted.
    checkRefs(claim["evidence_refs"], `${cat}.evidence_refs`, known, 1, c);
    // A README saying something is never AI LAB verification.
    if (
      !includes(DECISION_CANDIDATE_CLAIM_VERIFICATIONS, claim["verification"])
    )
      c.add("claim_verification_invalid", `${cat}.verification`);
  });
}

/**
 * Validates one candidate entry: closed shape, stable identity and
 * revision, evidence-backed roles, pinned upstream revision, immutable
 * evidence bindings, layered licensing, evidence-backed upstream claims,
 * derived gaps, the constant fail-closed lifecycle and the self-hash.
 */
export function validateDecisionCandidateEntry(
  value: unknown,
): DecisionCandidateValidation<DecisionCandidateEntry> {
  const c = new Collector();
  if (
    !isRecord(value) ||
    value["contract"] !== "typed_decision_candidate_entry"
  ) {
    c.add("contract_invalid", "candidate");
    return c.result(value as DecisionCandidateEntry);
  }
  closed(value, ENTRY_KEYS, "candidate", c);
  checkGlobalForbidden(value, "candidate", c);
  checkSchemaVersion(value["schema_version"], "candidate.schema_version", c);
  if (!isDecisionCandidateId(value["candidate_id"]))
    c.add("candidate_id_invalid", "candidate.candidate_id");

  const revision = value["evidence_revision"];
  const revisionOk = isSafeInt(revision) && revision >= 1;
  if (!revisionOk)
    c.add("evidence_revision_invalid", "candidate.evidence_revision");
  const supersedes = value["supersedes"];
  if (revisionOk && revision === 1) {
    if (supersedes !== null)
      c.add("supersedes_invalid", "candidate.supersedes");
  } else if (revisionOk) {
    if (!isRecord(supersedes)) {
      c.add("supersedes_invalid", "candidate.supersedes");
    } else {
      closed(
        supersedes,
        ["evidence_revision", "candidate_hash"],
        "candidate.supersedes",
        c,
      );
      if (supersedes["evidence_revision"] !== revision - 1)
        c.add("supersedes_invalid", "candidate.supersedes.evidence_revision");
      if (!isSha256(supersedes["candidate_hash"]))
        c.add("supersedes_invalid", "candidate.supersedes.candidate_hash");
    }
  }
  if (
    !boundedText(
      value["display_name"],
      DECISION_CANDIDATE_LIMITS.max_display_name_length,
    )
  )
    c.add("display_name_invalid", "candidate.display_name");

  const upstream = checkUpstream(value["upstream"], c);
  const known = checkEvidence(value["evidence"], upstream, c);
  checkRoles(value["roles"], known, c);
  checkLicensing(value["licensing"], known, c);
  checkClaims(value["upstream_claims"], known, c);

  checkConstObject(
    value["lifecycle"],
    DECISION_CANDIDATE_LIFECYCLE,
    "lifecycle_invalid",
    "candidate.lifecycle",
    c,
  );

  const gaps = value["evidence_gaps"];
  const completeness = value["evidence_completeness"];
  if (
    !Array.isArray(gaps) ||
    !gaps.every((gap) => includes(DECISION_CANDIDATE_EVIDENCE_GAPS, gap))
  )
    c.add("evidence_gaps_mismatch", "candidate.evidence_gaps");
  if (!includes(DECISION_CANDIDATE_EVIDENCE_COMPLETENESS, completeness))
    c.add("evidence_completeness_mismatch", "candidate.evidence_completeness");

  if (c.issues.length === 0) {
    const entry = value as unknown as DecisionCandidateEntry;
    const derived = deriveDecisionCandidateEvidenceGaps(entry);
    if (!canonicalEqual(gaps, derived))
      c.add("evidence_gaps_mismatch", "candidate.evidence_gaps");
    if (completeness !== (derived.length === 0 ? "complete" : "incomplete"))
      c.add(
        "evidence_completeness_mismatch",
        "candidate.evidence_completeness",
      );
  }

  if (!isSha256(value["candidate_hash"])) {
    c.add("candidate_hash_mismatch", "candidate.candidate_hash");
  } else if (c.issues.length === 0) {
    const computed = checkedHash(() =>
      computeDecisionCandidateHash(value as unknown as DecisionCandidateEntry),
    );
    if (computed !== value["candidate_hash"])
      c.add("candidate_hash_mismatch", "candidate.candidate_hash");
  }
  return c.result(value as unknown as DecisionCandidateEntry);
}

// ---------------------------------------------------------------------
// Registry manifest
// ---------------------------------------------------------------------

const REGISTRY_KEYS = [
  "contract",
  "schema_version",
  "registry_id",
  "registry_version",
  "review",
  "supersedes",
  "authority",
  "universal_winner",
  "candidates",
  "role_distribution",
  "evidence_completeness_distribution",
  "registry_hash",
] as const;

const BINDING_KEYS = [
  "candidate_id",
  "evidence_revision",
  "candidate_hash",
  "repository",
  "pinned_commit_sha",
  "roles",
  "evidence_completeness",
] as const;

function countBy(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1;
  return counts;
}

/**
 * Semantic-version ordering (`MAJOR.MINOR.PATCH`), numeric per part.
 * Returns a negative, zero or positive number.
 */
export function compareDecisionCandidateRegistryVersions(
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
 * Validates a registry manifest on its own: closed shape, non-authoritative
 * review state, constant authority, strictly ordered unique candidate
 * bindings, recomputed distributions and the self-hash.
 */
export function validateDecisionCandidateRegistryManifest(
  value: unknown,
): DecisionCandidateValidation<DecisionCandidateRegistry> {
  const c = new Collector();
  if (
    !isRecord(value) ||
    value["contract"] !== "typed_decision_candidate_registry"
  ) {
    c.add("contract_invalid", "registry");
    return c.result(value as DecisionCandidateRegistry);
  }
  closed(value, REGISTRY_KEYS, "registry", c);
  checkGlobalForbidden(value, "registry", c);
  checkSchemaVersion(value["schema_version"], "registry.schema_version", c);
  if (!matches(DECISION_CANDIDATE_REGISTRY_ID_PATTERN, value["registry_id"]))
    c.add("registry_identity_invalid", "registry.registry_id");
  if (!matches(DECISION_CANDIDATE_VERSION_PATTERN, value["registry_version"]))
    c.add("registry_identity_invalid", "registry.registry_version");

  const review = value["review"];
  if (!isRecord(review)) {
    c.add("review_invalid", "registry.review");
  } else {
    // Closed: there is no approval field to self-declare, and `approved`
    // is not an admitted state.
    closed(review, ["state", "human_review_required"], "registry.review", c);
    if (!includes(DECISION_CANDIDATE_REGISTRY_REVIEW_STATES, review["state"]))
      c.add("review_invalid", "registry.review.state");
    if (review["human_review_required"] !== true)
      c.add("review_invalid", "registry.review.human_review_required");
  }

  const supersedes = value["supersedes"];
  if (supersedes !== null) {
    if (!isRecord(supersedes)) {
      c.add("supersedes_invalid", "registry.supersedes");
    } else {
      closed(
        supersedes,
        ["registry_version", "registry_hash"],
        "registry.supersedes",
        c,
      );
      if (
        !matches(
          DECISION_CANDIDATE_VERSION_PATTERN,
          supersedes["registry_version"],
        ) ||
        supersedes["registry_version"] === value["registry_version"]
      )
        c.add("supersedes_invalid", "registry.supersedes.registry_version");
      if (!isSha256(supersedes["registry_hash"]))
        c.add("supersedes_invalid", "registry.supersedes.registry_hash");
    }
  }

  if (value["authority"] !== "evidence_only")
    c.add("authority_invalid", "registry.authority");
  if (value["universal_winner"] !== false)
    c.add("authority_invalid", "registry.universal_winner");

  const bindings = value["candidates"];
  const roles: string[] = [];
  const completeness: string[] = [];
  let bindingsOk = false;
  if (!Array.isArray(bindings) || bindings.length === 0) {
    c.add("registry_empty", "registry.candidates");
  } else if (bindings.length > DECISION_CANDIDATE_LIMITS.max_candidates) {
    c.add("candidate_binding_invalid", "registry.candidates");
  } else {
    const before = c.issues.length;
    const ids = new Set<string>();
    const hashes = new Set<string>();
    let previous: string | null = null;
    bindings.forEach((binding: unknown, index) => {
      const at = `registry.candidates[${index}]`;
      if (!isRecord(binding)) {
        c.add("candidate_binding_invalid", at);
        return;
      }
      closed(binding, BINDING_KEYS, at, c);
      const id = binding["candidate_id"];
      if (!isDecisionCandidateId(id)) {
        c.add("candidate_binding_invalid", `${at}.candidate_id`);
      } else if (ids.has(id)) {
        c.add("duplicate_candidate_id", `${at}.candidate_id`);
      } else {
        ids.add(id);
        if (previous !== null && !(previous < id))
          c.add("candidate_order_invalid", `${at}.candidate_id`);
        previous = id;
      }
      const revision = binding["evidence_revision"];
      if (!isSafeInt(revision) || revision < 1)
        c.add("candidate_binding_invalid", `${at}.evidence_revision`);
      const hash = binding["candidate_hash"];
      if (!isSha256(hash))
        c.add("candidate_binding_invalid", `${at}.candidate_hash`);
      else if (hashes.has(hash))
        c.add("duplicate_candidate_hash", `${at}.candidate_hash`);
      else hashes.add(hash);
      if (
        !matches(DECISION_CANDIDATE_REPOSITORY_PATTERN, binding["repository"])
      )
        c.add("candidate_binding_invalid", `${at}.repository`);
      checkCommit(binding["pinned_commit_sha"], `${at}.pinned_commit_sha`, c);
      const bindingRoles = binding["roles"];
      if (
        !Array.isArray(bindingRoles) ||
        bindingRoles.length === 0 ||
        !bindingRoles.every(
          (role: unknown, i) =>
            includes(DECISION_CANDIDATE_ROLES, role) &&
            (i === 0 || (bindingRoles[i - 1] as string) < role),
        )
      )
        c.add("candidate_binding_invalid", `${at}.roles`);
      else roles.push(...(bindingRoles as string[]));
      if (
        !includes(
          DECISION_CANDIDATE_EVIDENCE_COMPLETENESS,
          binding["evidence_completeness"],
        )
      )
        c.add("candidate_binding_invalid", `${at}.evidence_completeness`);
      else completeness.push(binding["evidence_completeness"]);
    });
    bindingsOk = c.issues.length === before;
  }

  for (const key of [
    "role_distribution",
    "evidence_completeness_distribution",
  ] as const) {
    const dist = value[key];
    if (
      !isRecord(dist) ||
      Object.values(dist).some((n) => !isSafeInt(n) || n < 1)
    )
      c.add("distribution_invalid", `registry.${key}`);
    else if (bindingsOk) {
      const recomputed = countBy(
        key === "role_distribution" ? roles : completeness,
      );
      if (!canonicalEqual(dist, recomputed))
        c.add("distribution_mismatch", `registry.${key}`);
    }
  }

  if (!isSha256(value["registry_hash"])) {
    c.add("registry_hash_mismatch", "registry.registry_hash");
  } else if (c.issues.length === 0) {
    const computed = checkedHash(() =>
      computeDecisionCandidateRegistryHash(
        value as unknown as DecisionCandidateRegistry,
      ),
    );
    if (computed !== value["registry_hash"])
      c.add("registry_hash_mismatch", "registry.registry_hash");
  }
  return c.result(value as unknown as DecisionCandidateRegistry);
}

export interface ValidatedDecisionCandidateRegistry {
  readonly registry: DecisionCandidateRegistry;
  /** Entries in registry order. */
  readonly candidates: readonly DecisionCandidateEntry[];
}

/**
 * Validates a registry manifest together with the exact entries it
 * binds: every binding has exactly one valid entry with the same
 * identity, revision, hash, upstream repository, pinned commit, roles and
 * completeness; no extra entry is present.
 */
export function validateDecisionCandidateRegistry(
  manifestValue: unknown,
  entryValues: readonly unknown[],
): DecisionCandidateValidation<ValidatedDecisionCandidateRegistry> {
  const c = new Collector();
  const manifestCheck =
    validateDecisionCandidateRegistryManifest(manifestValue);
  if (!manifestCheck.ok) c.addAll(manifestCheck.issues, "registry");
  if (!Array.isArray(entryValues)) {
    c.add("candidate_invalid", "candidates");
    return c.result(null as unknown as ValidatedDecisionCandidateRegistry);
  }
  const byId = new Map<string, DecisionCandidateEntry>();
  entryValues.forEach((value, index) => {
    const check = validateDecisionCandidateEntry(value);
    if (!check.ok) {
      c.addAll(check.issues, `candidates[${index}]`);
      c.add("candidate_invalid", `candidates[${index}]`);
      return;
    }
    if (byId.has(check.value.candidate_id)) {
      c.add("duplicate_candidate_id", `candidates[${index}].candidate_id`);
      return;
    }
    byId.set(check.value.candidate_id, check.value);
  });
  if (!manifestCheck.ok || c.issues.length > 0)
    return c.result(null as unknown as ValidatedDecisionCandidateRegistry);

  const registry = manifestCheck.value;
  const ordered: DecisionCandidateEntry[] = [];
  const listed = new Set<string>();
  registry.candidates.forEach((binding, index) => {
    const at = `registry.candidates[${index}]`;
    listed.add(binding.candidate_id);
    const entry = byId.get(binding.candidate_id);
    if (entry === undefined) {
      c.add("candidate_missing", at);
      return;
    }
    const expected = {
      candidate_id: entry.candidate_id,
      evidence_revision: entry.evidence_revision,
      candidate_hash: entry.candidate_hash,
      repository: entry.upstream.repository,
      pinned_commit_sha: entry.upstream.pinned_commit_sha,
      roles: entry.roles.map((role) => role.role),
      evidence_completeness: entry.evidence_completeness,
    };
    for (const key of BINDING_KEYS) {
      if (!canonicalEqual(binding[key], expected[key]))
        c.add("candidate_binding_mismatch", `${at}.${key}`);
    }
    ordered.push(entry);
  });
  for (const id of [...byId.keys()].sort()) {
    if (!listed.has(id)) c.add("candidate_not_in_registry", `candidates.${id}`);
  }
  return c.result({ registry, candidates: ordered });
}

// ---------------------------------------------------------------------
// Succession
// ---------------------------------------------------------------------

/**
 * A new evidence revision of the same candidate: same identity, revision
 * exactly one higher, and `supersedes` bound to the previous hash. A new
 * upstream commit or new evidence is always a new revision.
 */
export function validateDecisionCandidateSuccession(
  previousValue: unknown,
  nextValue: unknown,
): DecisionCandidateValidation<DecisionCandidateEntry> {
  const c = new Collector();
  const previous = validateDecisionCandidateEntry(previousValue);
  const next = validateDecisionCandidateEntry(nextValue);
  if (!previous.ok) c.addAll(previous.issues, "previous");
  if (!next.ok) c.addAll(next.issues, "next");
  if (!previous.ok || !next.ok)
    return c.result(nextValue as DecisionCandidateEntry);
  const a = previous.value;
  const b = next.value;
  if (a.candidate_id !== b.candidate_id)
    c.add("succession_identity_mismatch", "next.candidate_id");
  if (b.evidence_revision !== a.evidence_revision + 1)
    c.add("succession_revision_invalid", "next.evidence_revision");
  if (b.supersedes === null || b.supersedes.candidate_hash !== a.candidate_hash)
    c.add("succession_supersedes_mismatch", "next.supersedes");
  return c.result(b);
}

/**
 * A new registry version: same registry identity, strictly higher
 * version, `supersedes` bound to the previous hash, no candidate silently
 * removed, and no candidate whose hash changed without a higher evidence
 * revision. History is superseded, never rewritten.
 */
export function validateDecisionCandidateRegistrySuccession(
  previousValue: unknown,
  nextValue: unknown,
): DecisionCandidateValidation<DecisionCandidateRegistry> {
  const c = new Collector();
  const previous = validateDecisionCandidateRegistryManifest(previousValue);
  const next = validateDecisionCandidateRegistryManifest(nextValue);
  if (!previous.ok) c.addAll(previous.issues, "previous");
  if (!next.ok) c.addAll(next.issues, "next");
  if (!previous.ok || !next.ok)
    return c.result(nextValue as DecisionCandidateRegistry);
  const a = previous.value;
  const b = next.value;
  if (a.registry_id !== b.registry_id)
    c.add("succession_identity_mismatch", "next.registry_id");
  if (
    compareDecisionCandidateRegistryVersions(
      b.registry_version,
      a.registry_version,
    ) <= 0
  )
    c.add("succession_version_not_increased", "next.registry_version");
  if (
    b.supersedes === null ||
    b.supersedes.registry_version !== a.registry_version ||
    b.supersedes.registry_hash !== a.registry_hash
  )
    c.add("succession_supersedes_mismatch", "next.supersedes");
  const nextById = new Map(b.candidates.map((x) => [x.candidate_id, x]));
  for (const old of a.candidates) {
    const at = `next.candidates.${old.candidate_id}`;
    const current = nextById.get(old.candidate_id);
    if (current === undefined) {
      c.add("candidate_removed", at);
      continue;
    }
    if (current.evidence_revision < old.evidence_revision)
      c.add("succession_revision_invalid", `${at}.evidence_revision`);
    else if (
      current.candidate_hash !== old.candidate_hash &&
      current.evidence_revision === old.evidence_revision
    )
      c.add("candidate_rewritten_without_revision", `${at}.candidate_hash`);
  }
  return c.result(b);
}
