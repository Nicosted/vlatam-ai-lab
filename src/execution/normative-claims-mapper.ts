import type { CapabilityRequest, CapabilityResult } from '../capabilities/index.js';
import type { ProviderExecutionRequest } from '../providers/provider-adapter.js';
import { executionError } from './errors.js';

interface EvidenceRef { source_id: string; snapshot_id: string; excerpt: string; section_label?: string; article_number?: string; }
interface ExtractionInput { packet_id: string; evidence_refs: EvidenceRef[]; [key: string]: unknown; }
export interface NormativeClaimsOutput {
  readonly extraction_result_id: string; readonly evidence_packet_id: string; readonly review_manifest_id: string;
  readonly snapshot_id: string; readonly source_id: string;
  readonly extraction_status: 'draft_unreviewed' | 'critique_flagged' | 'validation_failed' | 'provider_failed';
  readonly extracted_claims: readonly Record<string, unknown>[]; readonly unsupported_claims: readonly Record<string, unknown>[];
  readonly warnings: readonly string[]; readonly confidence: number; readonly critic_summary: string;
  readonly human_review_required: true; readonly downstream_allowed: false; readonly created_at: string;
  readonly contract_version: string; readonly schema_version: string;
}
const OUTPUT_KEYS = new Set(['extraction_result_id','evidence_packet_id','review_manifest_id','snapshot_id','source_id','extraction_status','extracted_claims','unsupported_claims','warnings','confidence','critic_summary','human_review_required','downstream_allowed','created_at','contract_version','schema_version']);

export function mapNormativeClaimsRequest(request: CapabilityRequest): ProviderExecutionRequest {
  if (request.capability_id !== 'evidence.extraction.normative_claims') throw executionError('PROFILE_CAPABILITY_MISMATCH');
  const input = request.input as Partial<ExtractionInput>;
  if (typeof input.packet_id !== 'string' || !Array.isArray(input.evidence_refs)) throw executionError('OUTPUT_SCHEMA_INVALID');
  for (const ref of input.evidence_refs) if (!ref || typeof ref.source_id !== 'string' || typeof ref.snapshot_id !== 'string' || typeof ref.excerpt !== 'string') throw executionError('OUTPUT_SCHEMA_INVALID');
  const system = 'Use only supplied evidence. Report missing evidence. Never invent a final regulatory conclusion. Output is draft, review-required, and not downstream-approved. Return strict JSON only.';
  const evidence = input.evidence_refs.map((r) => ({ source_id: r.source_id, snapshot_id: r.snapshot_id, section_label: r.section_label, article_number: r.article_number, excerpt: r.excerpt }));
  return { request_id: request.request_id, structured_output: true, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ packet_id: input.packet_id, evidence_refs: evidence }) }] };
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(value).every((key) => allowed.includes(key)); }
export function parseNormativeClaimsOutput(content: string, request: CapabilityRequest): NormativeClaimsOutput {
  let raw: unknown;
  try { raw = JSON.parse(content); } catch { throw executionError('PROVIDER_RESPONSE_INVALID'); }
  if (!record(raw)) throw executionError('OUTPUT_SCHEMA_INVALID');
  // Legacy spike outputs may carry these two adapter metadata fields. They are validated then removed.
  const keys = Object.keys(raw).filter((key) => key !== 'provider_id' && key !== 'model_id');
  if (keys.some((key) => !OUTPUT_KEYS.has(key))) throw executionError('OUTPUT_SCHEMA_INVALID');
  const input = request.input as ExtractionInput;
  const requiredStrings = ['extraction_result_id','evidence_packet_id','review_manifest_id','snapshot_id','source_id','extraction_status','critic_summary','created_at','contract_version','schema_version'];
  if (requiredStrings.some((key) => typeof raw[key] !== 'string')) throw executionError('OUTPUT_SCHEMA_INVALID');
  if (raw['evidence_packet_id'] !== input.packet_id || !Array.isArray(raw['extracted_claims']) || !Array.isArray(raw['unsupported_claims']) || !Array.isArray(raw['warnings']) || !raw['warnings'].every((warning) => typeof warning === 'string')) throw executionError('OUTPUT_SCHEMA_INVALID');
  if (!['draft_unreviewed','critique_flagged','validation_failed','provider_failed'].includes(raw['extraction_status'] as string) || Number.isNaN(Date.parse(raw['created_at'] as string))) throw executionError('OUTPUT_SCHEMA_INVALID');
  if (raw['human_review_required'] !== true || raw['downstream_allowed'] !== false || typeof raw['confidence'] !== 'number' || raw['confidence'] < 0 || raw['confidence'] > 1) throw executionError('OUTPUT_SCHEMA_INVALID');
  const refs = new Set(input.evidence_refs.map((ref) => `${ref.source_id}:${ref.snapshot_id}`));
  for (const claim of raw['extracted_claims']) {
    if (!record(claim) || !exactKeys(claim, ['claim_id','claim_text','evidence_reference','support_status','confidence']) || typeof claim['claim_id'] !== 'string' || typeof claim['claim_text'] !== 'string' || typeof claim['evidence_reference'] !== 'string' || !['supported_by_packet','unsupported','needs_human_review'].includes(claim['support_status'] as string) || typeof claim['confidence'] !== 'number' || claim['confidence'] < 0 || claim['confidence'] > 1 || ![...refs].some((ref) => (claim['evidence_reference'] as string).startsWith(ref))) throw executionError('OUTPUT_SCHEMA_INVALID');
  }
  for (const claim of raw['unsupported_claims']) if (!record(claim) || !exactKeys(claim, ['claim_id','claim_text','reason','evidence_reference']) || typeof claim['claim_text'] !== 'string' || typeof claim['reason'] !== 'string') throw executionError('OUTPUT_SCHEMA_INVALID');
  const normalized = Object.fromEntries(Object.entries(raw).filter(([key]) => key !== 'provider_id' && key !== 'model_id'));
  return normalized as unknown as NormativeClaimsOutput;
}

export function capabilityResult(request: CapabilityRequest, output: NormativeClaimsOutput): CapabilityResult<NormativeClaimsOutput> {
  return { request_id: request.request_id, capability_id: request.capability_id, schema_version: request.schema_version, status: 'succeeded', output, governance: { human_review_required: true, downstream_allowed: false, approval_state: 'pending' } };
}
