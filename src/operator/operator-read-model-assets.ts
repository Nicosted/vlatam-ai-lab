import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Immutable repository-current inputs required by the Operator Read Model.
 *
 * This is the canonical runtime and packaging contract. Every path is relative
 * to the packaged application root and must be present in the Vercel Function.
 */
export const OPERATOR_READ_MODEL_ARTIFACTS = {
  models: "config/ai-openrouter-model-registry.json",
  routes: "config/ai-openrouter-route-registry.json",
  adapter: "config/ai-openrouter-adapter.json",
  profiles: "config/ai-execution-profiles.json",
  dossier: "config/ai-openrouter-readiness-dossier.json",
  evidence: "config/ai-openrouter-external-evidence-pack.json",
  proposal: "config/ai-openrouter-sandbox-enablement-proposal.json",
  approval: "config/ai-openrouter-sandbox-configuration-approval.json",
  runtime: "config/ai-openrouter-sandbox-runtime.json",
  activation_review: "config/ai-openrouter-sandbox-activation-review.json",
  gold_case: "config/ai-openrouter-sandbox-gold-case.json",
  fixture:
    "data/fixtures/providers/openrouter-normative-claim-synthetic-v1.json",
  pricing: "config/ai-pricing.json",
  zdr: "config/ai-zdr-evidence.json",
  tournament_native: "config/ai-tournament-runtime-native.json",
  tournament_eve: "config/ai-tournament-runtime-eve.json",
  tournament_cloudflare: "config/ai-tournament-runtime-cloudflare.json",
  runtime_evidence_eve: "config/ai-runtime-evidence-eve.json",
  runtime_evidence_cloudflare: "config/ai-runtime-evidence-cloudflare.json",
  glm_conformance: "config/ai-122-glm-fireworks-conformance-result.json",
  arca_review_fixture: "data/fixtures/arca/ai-127-pending-review.json",
} as const;

export type OperatorReadModelArtifactKey =
  keyof typeof OPERATOR_READ_MODEL_ARTIFACTS;

export type OperatorReadModelAssetPath =
  (typeof OPERATOR_READ_MODEL_ARTIFACTS)[OperatorReadModelArtifactKey];

export const OPERATOR_READ_MODEL_ASSET_PATHS = Object.freeze(
  Object.values(OPERATOR_READ_MODEL_ARTIFACTS),
) as readonly OperatorReadModelAssetPath[];

/**
 * The Vercel entrypoint is packaged at api/index.* and includeFiles preserves
 * repository-relative asset paths. Resolve the application root from that
 * known module location without cwd, environment input, Git discovery, or
 * upward filesystem searches.
 */
export function resolvePackagedOperatorAssetRoot(
  applicationEntrypointUrl: string,
): string {
  return resolve(dirname(fileURLToPath(applicationEntrypointUrl)), "..");
}
