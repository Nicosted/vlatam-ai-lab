export interface RepositoryCurrentBlockedStatus {
  readonly projection_id: "ai-134.repository-current-blocked-state.v1";
  readonly scheduler: "inactive";
  readonly ai_131_kill_switch: "active";
  readonly ai_132_kill_switch: "active";
  readonly ai_133_kill_switch: "active";
  readonly activation: "none";
  readonly production_run: "none";
  readonly publication_authority: false;
  readonly import_authority: false;
  readonly deployment_authority: false;
  readonly external_database_write_authority: false;
  readonly vlatam_global_access: false;
  readonly cost_visibility: "unavailable";
  readonly recovery_required: "unavailable";
  readonly evidence_paths: readonly string[];
}

/**
 * Static fail-closed projection of reviewed repository configuration.
 * It is presentation-only and cannot issue, consume, or substitute authority.
 */
export const REPOSITORY_CURRENT_BLOCKED_STATUS: RepositoryCurrentBlockedStatus =
  Object.freeze({
    projection_id: "ai-134.repository-current-blocked-state.v1",
    scheduler: "inactive",
    ai_131_kill_switch: "active",
    ai_132_kill_switch: "active",
    ai_133_kill_switch: "active",
    activation: "none",
    production_run: "none",
    publication_authority: false,
    import_authority: false,
    deployment_authority: false,
    external_database_write_authority: false,
    vlatam_global_access: false,
    cost_visibility: "unavailable",
    recovery_required: "unavailable",
    evidence_paths: Object.freeze([
      "config/ai-131-controlled-live-arca-kill-switch.json",
      "config/ai-132-governed-arca-export-kill-switch.json",
      "config/ai-133-governed-arca-scheduler.json",
      "config/ai-133-governed-arca-scheduler-kill-switch.json",
    ]),
  });
