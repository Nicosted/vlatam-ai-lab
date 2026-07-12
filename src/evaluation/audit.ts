export const EVALUATION_AUDIT_EVENTS = ['evaluation_started','evaluation_completed','evaluation_failed','evaluation_rejected'] as const;
export type EvaluationAuditEventType = (typeof EVALUATION_AUDIT_EVENTS)[number];
export interface EvaluationAuditEvent { readonly schema_version: '1.0.0'; readonly event_id: string; readonly event_type: EvaluationAuditEventType; readonly report_id?: string; readonly suite_id?: string; readonly suite_version?: string; readonly evaluator_id?: string; readonly evaluator_version?: string; readonly profile_id?: string; readonly correlation_ids: readonly string[]; readonly occurred_at: string; readonly reason_code?: string; }
const KEYS = new Set(['schema_version','event_id','event_type','report_id','suite_id','suite_version','evaluator_id','evaluator_version','profile_id','correlation_ids','occurred_at','reason_code']);
const FORBIDDEN = /prompt|messages|content|context|credential|api[_-]?key|secret|bearer|authorization|raw|provider_id|model_id/i;
export function assertEvaluationAuditMetadataOnly(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['audit event must be an object'];
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!KEYS.has(key)) errors.push(`unexpected key: ${key}`);
  if (FORBIDDEN.test(JSON.stringify(value))) errors.push('audit event contains forbidden data');
  return errors;
}
