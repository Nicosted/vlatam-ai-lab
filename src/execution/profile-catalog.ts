import catalog from '../../config/ai-execution-profiles.json' with { type: 'json' };
import type { ExecutionProfile, ExecutionProfileCatalog, ExecutionProfileId } from './execution-profile.js';
import { validateExecutionProfile } from './execution-profile.js';
import { executionError } from './errors.js';

const typedCatalog = catalog as unknown as ExecutionProfileCatalog;
const byId = new Map<string, ExecutionProfile>();
for (const profile of typedCatalog.profiles) {
  if (byId.has(profile.profile_id)) throw new Error(`Duplicate execution profile: ${profile.profile_id}`);
  const errors = validateExecutionProfile(profile);
  if (errors.length) throw new Error(`Invalid execution profile ${profile.profile_id}: ${errors.join(', ')}`);
  byId.set(profile.profile_id, profile);
}
export function listExecutionProfiles(): readonly ExecutionProfile[] { return [...byId.values()]; }
export function getExecutionProfile(id: ExecutionProfileId): ExecutionProfile | undefined { return byId.get(id); }
export function assertExecutionProfile(id: string): ExecutionProfile {
  const profile = byId.get(id);
  if (!profile) throw executionError('UNKNOWN_PROFILE');
  return profile;
}
