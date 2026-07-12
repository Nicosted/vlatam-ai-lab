/**
 * AI-73 privacy enforcement — the enforcement engine.
 *
 * The enforcer computes a deterministic allow/block decision for a
 * (request, capability definition, execution profile) triple. It sits
 * between explicit profile resolution and capability mapping in the
 * gateway. It never resolves, replaces, or ranks profiles, never
 * inspects provider availability, never retries or falls back, never
 * weakens a capability requirement, never infers a privacy guarantee,
 * and never calls a provider SDK. Unknown or incomplete configuration
 * fails closed.
 */

import { createHash } from 'node:crypto';
import type { CapabilityDefinition, CapabilityRequest } from '../capabilities/index.js';
import type { ExecutionProfile } from '../execution/execution-profile.js';
import {
  AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS,
  DATA_CLASSIFICATION_MODEL,
  RETENTION_BEHAVIORS,
  classificationRank,
  resolveRequestClassification,
} from './data-classification.js';
import type { DataClassificationId, RetentionBehavior } from './data-classification.js';
import type { PrivacyReasonCode } from './errors.js';
import { PRIVACY_AUDIT_SCHEMA_VERSION } from './privacy-audit.js';
import type { PrivacyAction, PrivacyAuditRecord, PrivacyDecisionStatus } from './privacy-audit.js';
import { PrivacyPolicyCatalog, validatePrivacyProfileDeclaration } from './privacy-policy.js';
import type { PrivacyPolicyEntry, PrivacyProfileDeclaration, ZdrRequirement } from './privacy-policy.js';
import { applyRedactionRules } from './redaction.js';
import type { RedactionAuditEntry, RedactionCounts } from './redaction.js';
import { ZdrEvidenceStore, evaluateZdrEvidence } from './zdr-evidence.js';
import type { ZdrVerificationEvidence } from './zdr-evidence.js';
import defaultPolicyCatalog from '../../config/ai-privacy-policies.json' with { type: 'json' };
import defaultZdrEvidence from '../../config/ai-zdr-evidence.json' with { type: 'json' };

export interface PrivacyEnforcementInput {
  readonly capability_request: CapabilityRequest;
  readonly capability_definition: CapabilityDefinition;
  readonly execution_profile: ExecutionProfile;
  readonly execution_id?: string | undefined;
}

export interface PrivacyEnforcementDecision {
  readonly status: PrivacyDecisionStatus;
  readonly reason_code: PrivacyReasonCode;
  readonly required_actions: readonly PrivacyAction[];
  readonly cleared_request?: CapabilityRequest;
  readonly audit: PrivacyAuditRecord;
}

export interface PrivacyEnforcerOptions {
  readonly policyCatalog?: PrivacyPolicyCatalog;
  readonly zdrEvidence?: ZdrEvidenceStore;
  readonly clock?: () => Date;
  readonly executionId?: string;
}

const EMPTY_COUNTS: RedactionCounts = Object.freeze({
  removed: 0,
  replaced: 0,
  hashed: 0,
  tokenized: 0,
  preserved: 0,
});

const ZDR_STRICTNESS: Readonly<Record<ZdrRequirement, number>> = {
  not_required: 0,
  required_for_external: 1,
  required: 2,
};

function strictestZdr(...requirements: readonly ZdrRequirement[]): ZdrRequirement {
  let winner: ZdrRequirement = 'not_required';
  for (const requirement of requirements) {
    if (ZDR_STRICTNESS[requirement] > ZDR_STRICTNESS[winner]) winner = requirement;
  }
  return winner;
}

function decisionId(requestId: string, capabilityId: string, profileId: string): string {
  const digest = createHash('sha256')
    .update(`vlatam-ai-lab/ai-73/decision/v1:${requestId}:${capabilityId}:${profileId}`)
    .digest('hex');
  return `pdec-${digest.slice(0, 24)}`;
}

interface AuditDraft {
  request_id: string;
  execution_id?: string | undefined;
  capability_id: string;
  profile_id?: string | undefined;
  data_classification?: DataClassificationId | undefined;
  privacy_policy_id?: string | undefined;
  privacy_policy_version?: string | undefined;
  zdr_requirement?: ZdrRequirement | undefined;
  zdr_support?: PrivacyProfileDeclaration['zdr_support'] | undefined;
  zdr_evidence_id?: string | undefined;
  zdr_evidence_hash?: string | undefined;
  retention_requirement?: readonly RetentionBehavior[] | undefined;
  retention_declaration?: RetentionBehavior | undefined;
  execution_mode?: 'replay' | 'live' | undefined;
  redaction: readonly RedactionAuditEntry[];
  redaction_counts: RedactionCounts;
}

export class PrivacyEnforcer {
  private readonly catalog: PrivacyPolicyCatalog;
  private readonly evidence: ZdrEvidenceStore;
  private readonly clock: () => Date;
  private readonly executionId: string | undefined;

  constructor(options: PrivacyEnforcerOptions = {}) {
    this.catalog = options.policyCatalog ?? new PrivacyPolicyCatalog(defaultPolicyCatalog);
    this.evidence = options.zdrEvidence ?? new ZdrEvidenceStore(defaultZdrEvidence);
    this.clock = options.clock ?? (() => new Date());
    this.executionId = options.executionId;
  }

  enforce(input: PrivacyEnforcementInput): PrivacyEnforcementDecision {
    try {
      return this.enforceInternal(input);
    } catch {
      // Any unexpected fault in enforcement fails closed with a
      // sanitized configuration error and a minimal metadata audit.
      const draft: AuditDraft = {
        request_id: safeString(input?.capability_request?.request_id),
        execution_id: input?.execution_id ?? this.executionId,
        capability_id: safeString(input?.capability_definition?.capability_id),
        profile_id: input?.execution_profile?.profile_id,
        redaction: [],
        redaction_counts: EMPTY_COUNTS,
      };
      return this.blocked('PRIVACY_CONFIGURATION_INVALID', draft, ['blocked']);
    }
  }

  private enforceInternal(input: PrivacyEnforcementInput): PrivacyEnforcementDecision {
    const { capability_request: request, capability_definition: definition, execution_profile: profile } = input;
    const requiredActions: PrivacyAction[] = [];
    const draft: AuditDraft = {
      request_id: safeString(request?.request_id),
      execution_id: input.execution_id ?? this.executionId,
      capability_id: safeString(definition?.capability_id),
      profile_id: profile?.profile_id,
      execution_mode: profile?.mode,
      redaction: [],
      redaction_counts: EMPTY_COUNTS,
    };

    // 1. Explicit data classification (missing/unknown fail closed).
    const classificationResolution = resolveRequestClassification(request);
    if (!classificationResolution.ok) {
      return this.blocked(classificationResolution.reason, draft, ['blocked']);
    }
    const classification = classificationResolution.classification;
    const classDef = DATA_CLASSIFICATION_MODEL[classification];
    draft.data_classification = classification;

    // 2. Capability privacy requirement must be complete.
    const requirement = definition?.policy?.privacy_requirement;
    if (
      requirement === undefined ||
      typeof requirement.zdr_required !== 'boolean' ||
      !Array.isArray(requirement.redact_fields) ||
      !(requirement.retention_class in AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS)
    ) {
      return this.blocked('PRIVACY_CONFIGURATION_INVALID', draft, ['blocked']);
    }

    // 3. Profile privacy declaration must exist and be complete. A
    //    declaration is never proof; it is merely a prerequisite.
    const declaration = (profile as { privacy?: PrivacyProfileDeclaration } | undefined)?.privacy;
    if (declaration === undefined) {
      return this.blocked('PROFILE_PRIVACY_DECLARATION_MISSING', draft, ['blocked']);
    }
    if (validatePrivacyProfileDeclaration(declaration, profile.mode).length > 0) {
      return this.blocked('PRIVACY_CONFIGURATION_INVALID', draft, ['blocked']);
    }
    draft.zdr_support = declaration.zdr_support;
    draft.retention_declaration = declaration.retention_behavior;

    // 4. Deterministic policy resolution (missing/ambiguous fail closed).
    const resolution = this.catalog.resolve(definition.capability_id, classification);
    if (!resolution.ok) {
      return this.blocked(resolution.reason, draft, ['blocked']);
    }
    const entry: PrivacyPolicyEntry = resolution.entry;
    draft.privacy_policy_id = entry.policy_id;
    draft.privacy_policy_version = entry.schema_version;

    // 5. Explicit policy block.
    if (entry.decision === 'block') {
      return this.blocked(entry.reason_code, draft, ['blocked']);
    }

    // 6. Execution mode gates (classification model AND policy entry).
    if (
      !classDef.permitted_execution_modes.includes(profile.mode) ||
      !entry.allowed_execution_modes.includes(profile.mode)
    ) {
      return this.blocked('PROFILE_PRIVACY_INCOMPATIBLE', draft, ['blocked']);
    }

    // 7. A lower-capability profile cannot process a higher
    //    classification. No automatic downgrade exists.
    if (classificationRank(declaration.max_data_classification) < classificationRank(classification)) {
      return this.blocked('PROFILE_PRIVACY_INCOMPATIBLE', draft, ['blocked']);
    }
    if (classification === 'regulated' && !declaration.regulated_data_permitted) {
      return this.blocked('PROFILE_PRIVACY_INCOMPATIBLE', draft, ['blocked']);
    }
    if (classification === 'restricted' && !declaration.restricted_data_permitted) {
      return this.blocked('PROFILE_PRIVACY_INCOMPATIBLE', draft, ['blocked']);
    }

    // 8. External-processing boundary.
    const external = declaration.external_processing === 'allowed';
    if (external && !classDef.external_processing_potentially_allowed) {
      return this.blocked('EXTERNAL_PROCESSING_FORBIDDEN', draft, ['blocked']);
    }
    if (entry.decision === 'require_local_execution') {
      if (external) {
        return this.blocked('EXTERNAL_PROCESSING_FORBIDDEN', draft, ['blocked']);
      }
      requiredActions.push('local_execution_enforced');
    }

    // 9. ZDR. The effective requirement is the strictest of the
    //    capability requirement, the policy entry, and the
    //    classification model — a profile declaration can never weaken
    //    it. Verified support is only honored with valid evidence.
    const effectiveZdr = strictestZdr(
      requirement.zdr_required ? 'required_for_external' : 'not_required',
      entry.zdr_requirement,
      classDef.verified_zdr_mandatory_for_external ? 'required_for_external' : 'not_required'
    );
    draft.zdr_requirement = effectiveZdr;
    const zdrApplies = effectiveZdr === 'required' || (effectiveZdr === 'required_for_external' && external);
    if (zdrApplies) {
      if (declaration.zdr_support === 'unsupported') {
        return this.blocked('ZDR_REQUIRED', draft, ['blocked']);
      }
      if (declaration.zdr_support !== 'verified') {
        // 'declared_unverified' and 'unknown' never satisfy ZDR.
        return this.blocked('ZDR_UNVERIFIED', draft, ['blocked']);
      }
      const record: ZdrVerificationEvidence | undefined =
        declaration.zdr_evidence_ref === undefined
          ? undefined
          : this.evidence.get(declaration.zdr_evidence_ref);
      const evaluation = evaluateZdrEvidence({
        evidence: record,
        profile_id: profile.profile_id,
        capability_id: definition.capability_id,
        classification,
        retention_behavior: declaration.retention_behavior,
        processing_region: declaration.processing_region,
        training_use: declaration.training_use,
        now: this.clock(),
      });
      if (!evaluation.ok) {
        return this.blocked(evaluation.reason, draft, ['blocked']);
      }
      draft.zdr_evidence_id = evaluation.evidence.evidence_id;
      draft.zdr_evidence_hash = evaluation.evidence.evidence_hash;
      requiredActions.push('zdr_verified');
    }

    // 10. Retention compatibility: intersection of classification,
    //     capability retention class, and policy entry. `forbidden`
    //     never matches anything.
    const capabilityAllowed =
      AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS[
        requirement.retention_class as keyof typeof AI71_RETENTION_CLASS_ALLOWED_BEHAVIORS
      ];
    const allowedRetention = RETENTION_BEHAVIORS.filter(
      behavior =>
        behavior !== 'forbidden' &&
        classDef.permitted_retention_behaviors.includes(behavior) &&
        capabilityAllowed.includes(behavior) &&
        entry.retention_requirement.allowed_retention_behaviors.includes(behavior)
    );
    draft.retention_requirement = allowedRetention;
    if (
      declaration.retention_behavior === 'forbidden' ||
      !allowedRetention.includes(declaration.retention_behavior)
    ) {
      return this.blocked('RETENTION_POLICY_INCOMPATIBLE', draft, ['blocked']);
    }
    requiredActions.push('retention_validated');

    // 11. Replay fixture provenance. Fixture storage is itself a
    //     retention decision; unsanitized or unknown provenance fails
    //     closed, and replay never implies safety.
    if (profile.mode === 'replay' || declaration.retention_behavior === 'bounded_local_fixture') {
      const origin = declaration.replay_fixture_origin;
      const sanitization = declaration.replay_fixture_sanitization;
      if (origin === undefined || sanitization === undefined) {
        return this.blocked('PROFILE_PRIVACY_DECLARATION_MISSING', draft, ['blocked']);
      }
      const fixtureSafe =
        (origin === 'synthetic' && sanitization !== 'unsanitized' && sanitization !== 'unknown') ||
        (origin === 'sanitized_recorded' && sanitization === 'sanitized');
      if (!fixtureSafe) {
        return this.blocked('REPLAY_FIXTURE_UNSAFE', draft, ['blocked']);
      }
    }

    // 12. Deterministic redaction. Coverage of the capability's
    //     declared redact_fields is validated before any rule runs.
    const rules = entry.redaction_rules;
    if (classDef.redaction_mandatory && requirement.redact_fields.length > 0) {
      if (rules.length === 0) {
        return this.blocked('REDACTION_REQUIRED', draft, ['blocked']);
      }
      const covered = new Set(rules.flatMap(rule => [...(rule.covers ?? [])]));
      if (requirement.redact_fields.some(field => !covered.has(field))) {
        return this.blocked('PRIVACY_CONFIGURATION_INVALID', draft, ['blocked']);
      }
    }
    const redaction = applyRedactionRules(request.input, rules);
    draft.redaction = redaction.entries;
    if (!redaction.ok) {
      return this.blocked(redaction.reason, draft, ['blocked']);
    }
    draft.redaction_counts = redaction.counts;
    if (rules.length > 0) requiredActions.push('redaction_applied');

    if (entry.human_review_required || classDef.human_review_required_before_export) {
      requiredActions.push('human_review_required');
    }

    const clearedRequest: CapabilityRequest = { ...request, input: redaction.cleared_input };
    return {
      status: 'allowed',
      reason_code: 'PRIVACY_CLEARED',
      required_actions: requiredActions,
      cleared_request: clearedRequest,
      audit: this.buildAudit('allowed', 'PRIVACY_CLEARED', draft, requiredActions),
    };
  }

  private blocked(
    reason: PrivacyReasonCode,
    draft: AuditDraft,
    actions: readonly PrivacyAction[]
  ): PrivacyEnforcementDecision {
    return {
      status: 'blocked',
      reason_code: reason,
      required_actions: actions,
      audit: this.buildAudit('blocked', reason, draft, actions),
    };
  }

  private buildAudit(
    decision: PrivacyDecisionStatus,
    reason: PrivacyReasonCode,
    draft: AuditDraft,
    actions: readonly PrivacyAction[]
  ): PrivacyAuditRecord {
    return {
      privacy_decision_id: decisionId(draft.request_id, draft.capability_id, draft.profile_id ?? 'unknown'),
      schema_version: PRIVACY_AUDIT_SCHEMA_VERSION,
      request_id: draft.request_id,
      execution_id: draft.execution_id,
      capability_id: draft.capability_id,
      profile_id: draft.profile_id,
      data_classification: draft.data_classification,
      privacy_policy_id: draft.privacy_policy_id,
      privacy_policy_version: draft.privacy_policy_version,
      decision,
      reason_code: reason,
      required_actions: actions,
      redaction: draft.redaction,
      redaction_counts: draft.redaction_counts,
      zdr_requirement: draft.zdr_requirement,
      zdr_support: draft.zdr_support,
      zdr_evidence_id: draft.zdr_evidence_id,
      zdr_evidence_hash: draft.zdr_evidence_hash,
      retention_requirement: draft.retention_requirement,
      retention_declaration: draft.retention_declaration,
      execution_mode: draft.execution_mode,
      decided_at: this.clock().toISOString(),
    };
  }
}

function safeString(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'unknown';
}
