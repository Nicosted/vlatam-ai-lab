import type { PrivacyProfileDeclaration } from '../../src/privacy/privacy-policy.js';

/** Honest declaration for a local, fixture-backed replay profile used in tests. */
export const LOCAL_REPLAY_PRIVACY: PrivacyProfileDeclaration = {
  max_data_classification: 'internal',
  external_processing: 'forbidden',
  zdr_support: 'unsupported',
  retention_behavior: 'bounded_local_fixture',
  training_use: 'declared_not_used',
  processing_region: 'local',
  pre_execution_redaction_required: true,
  replay_fixture_origin: 'synthetic',
  replay_fixture_sanitization: 'not_applicable',
  regulated_data_permitted: false,
  restricted_data_permitted: false,
};

/** Conservative declaration for a disabled live profile used in tests. */
export const LIVE_UNKNOWN_PRIVACY: PrivacyProfileDeclaration = {
  max_data_classification: 'public',
  external_processing: 'allowed',
  zdr_support: 'unknown',
  retention_behavior: 'provider_unknown',
  training_use: 'unknown',
  processing_region: 'unknown',
  pre_execution_redaction_required: true,
  regulated_data_permitted: false,
  restricted_data_permitted: false,
};
