/**
 * AI-73 privacy enforcement — deterministic redaction engine.
 *
 * Redaction is path-based, capability-specific (paths come from the
 * resolved policy entry), and strictly deterministic: no heuristics,
 * no LLM assistance, no partial success. It runs BEFORE capability
 * mapping and BEFORE adapter invocation; the enforcer hands the
 * gateway a privacy-cleared request and the original is never used
 * again on the execution path.
 *
 * Hashing uses SHA-256 over `<domain-separator>:<path>:<value>`. The
 * domain separator is a stable, documented constant so hashes are
 * reproducible and cannot collide with hashes produced for other
 * purposes. A hash is pseudonymization, NOT anonymization: hashed
 * identifiers remain linkable and are treated as sensitive metadata.
 */

import { createHash } from 'node:crypto';
import type { RedactionAction, RedactionRequirement } from './privacy-policy.js';
import type { PrivacyReasonCode } from './errors.js';

/** Documented, stable domain separator for redaction hashes. */
export const REDACTION_HASH_DOMAIN_SEPARATOR = 'vlatam-ai-lab/ai-73/redaction/v1';

/** Marker inserted by `replace_with_marker`. */
export const REDACTION_MARKER = '[REDACTED]';

export interface RedactionAuditEntry {
  readonly path: string;
  readonly action: RedactionAction;
  readonly outcome: 'applied' | 'skipped_absent' | 'blocked';
  readonly count: number;
}

export interface RedactionCounts {
  readonly removed: number;
  readonly replaced: number;
  readonly hashed: number;
  readonly tokenized: number;
  readonly preserved: number;
}

export type RedactionResult =
  | {
      readonly ok: true;
      readonly cleared_input: unknown;
      readonly entries: readonly RedactionAuditEntry[];
      readonly counts: RedactionCounts;
    }
  | {
      readonly ok: false;
      readonly reason: Extract<
        PrivacyReasonCode,
        'REDACTION_FAILED' | 'REDACTION_PATH_UNKNOWN' | 'EXTERNAL_PROCESSING_FORBIDDEN'
      >;
      readonly path: string;
      readonly entries: readonly RedactionAuditEntry[];
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function redactionHash(path: string, value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value) ?? 'undefined';
  const digest = createHash('sha256')
    .update(`${REDACTION_HASH_DOMAIN_SEPARATOR}:${path}:${serialized}`)
    .digest('hex');
  return digest;
}

interface Site {
  readonly parent: Record<string, unknown>;
  readonly key: string;
}

type SiteResolution =
  | { readonly ok: true; readonly sites: readonly Site[] }
  | { readonly ok: false };

/**
 * Resolves the terminal sites addressed by the path segments. A
 * structural mismatch (a segment expects an object/array and finds a
 * scalar) resolves to `{ ok: false }` — the path cannot be interpreted
 * against this input. Absent optional branches simply produce fewer
 * (possibly zero) sites.
 */
function resolveSites(root: unknown, segments: readonly string[]): SiteResolution {
  let frontier: unknown[] = [root];
  let broken = false;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (segment === undefined) return { ok: false };
    const isArraySegment = segment.endsWith('[]');
    const name = isArraySegment ? segment.slice(0, -2) : segment;
    const next: unknown[] = [];
    for (const node of frontier) {
      if (!isPlainRecord(node)) {
        broken = true;
        continue;
      }
      if (!(name in node)) continue; // absent branch, not broken
      const child = node[name];
      if (isArraySegment) {
        if (!Array.isArray(child)) {
          broken = true;
          continue;
        }
        next.push(...child);
      } else {
        next.push(child);
      }
    }
    frontier = next;
  }

  const terminal = segments[segments.length - 1];
  if (terminal === undefined || terminal.endsWith('[]')) return { ok: false };
  const sites: Site[] = [];
  for (const node of frontier) {
    if (!isPlainRecord(node)) {
      broken = true;
      continue;
    }
    if (terminal in node && node[terminal] !== undefined) {
      sites.push({ parent: node, key: terminal });
    }
  }
  if (broken) return { ok: false };
  return { ok: true, sites };
}

/**
 * Applies the redaction rules to a deep clone of `input` and returns
 * either the cleared input plus metadata-only audit entries, or a
 * fail-closed block. The original object is never mutated.
 *
 * Rule paths are rooted at `input.` (the request envelope field); this
 * function receives the input value itself, so the leading `input`
 * segment is consumed here.
 */
export function applyRedactionRules(
  input: unknown,
  rules: readonly RedactionRequirement[]
): RedactionResult {
  const cleared = structuredClone(input);
  const entries: RedactionAuditEntry[] = [];
  let removed = 0;
  let replaced = 0;
  let hashed = 0;
  let tokenized = 0;
  let preserved = 0;

  for (const rule of rules) {
    const segments = rule.path.split('.');
    if (segments[0] !== 'input' || segments.length < 2) {
      return { ok: false, reason: 'REDACTION_PATH_UNKNOWN', path: rule.path, entries };
    }
    const resolution = resolveSites(cleared, segments.slice(1));
    if (!resolution.ok) {
      if (rule.presence === 'required') {
        return { ok: false, reason: 'REDACTION_PATH_UNKNOWN', path: rule.path, entries };
      }
      entries.push({ path: rule.path, action: rule.action, outcome: 'skipped_absent', count: 0 });
      continue;
    }
    const sites = resolution.sites;
    if (sites.length === 0) {
      if (rule.presence === 'required') {
        return { ok: false, reason: 'REDACTION_FAILED', path: rule.path, entries };
      }
      entries.push({ path: rule.path, action: rule.action, outcome: 'skipped_absent', count: 0 });
      continue;
    }

    if (rule.action === 'block_request') {
      entries.push({ path: rule.path, action: rule.action, outcome: 'blocked', count: sites.length });
      return { ok: false, reason: 'EXTERNAL_PROCESSING_FORBIDDEN', path: rule.path, entries };
    }

    for (const site of sites) {
      const value = site.parent[site.key];
      switch (rule.action) {
        case 'remove':
          delete site.parent[site.key];
          removed += 1;
          break;
        case 'replace_with_marker':
          site.parent[site.key] = REDACTION_MARKER;
          replaced += 1;
          break;
        case 'hash_identifier':
          site.parent[site.key] = `redacted:sha256:${redactionHash(rule.path, value)}`;
          hashed += 1;
          break;
        case 'tokenize_reference':
          site.parent[site.key] = `redacted:ref:${redactionHash(rule.path, value).slice(0, 24)}`;
          tokenized += 1;
          break;
        case 'preserve':
          preserved += 1;
          break;
        default:
          // Unknown action: fail closed. The catalog loader rejects
          // unknown actions, but injected rules must not slip through.
          return { ok: false, reason: 'REDACTION_FAILED', path: rule.path, entries };
      }
    }
    entries.push({ path: rule.path, action: rule.action, outcome: 'applied', count: sites.length });
  }

  return {
    ok: true,
    cleared_input: cleared,
    entries,
    counts: { removed, replaced, hashed, tokenized, preserved },
  };
}
