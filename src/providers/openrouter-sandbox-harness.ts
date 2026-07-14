import type { OpenRouterSecretProvider } from "./openrouter-secret-provider.js";
import {
  evaluateOpenRouterSandboxPreflight,
  type OpenRouterRuntimeBindings,
  type OpenRouterSandboxBudgetAvailability,
  type OpenRouterSandboxPreflightResult,
  type OpenRouterSandboxRuntimeConfig,
  type OpenRouterKillSwitch,
} from "./openrouter-sandbox-preflight.js";

export const OPENROUTER_FIRST_RUN_FIXTURE_ID =
  "openrouter.normative-claim.synthetic.v1" as const;

export interface GovernedOpenRouterManualExecutor {
  /**
   * Implementations must invoke registry → resolution → authorization → exact
   * policy → atomic consumption → gateway → sandbox transport adapter. The
   * harness never calls transport or consumes authorization directly.
   */
  executeFixture(fixtureId: typeof OPENROUTER_FIRST_RUN_FIXTURE_ID): Promise<{
    readonly adapter_outcome: string;
    readonly consumption_result: string;
    readonly http_status_category?: string;
    readonly reported_input_tokens?: number;
    readonly reported_output_tokens?: number;
    readonly reported_cost_usd?: string;
  }>;
}

export interface OpenRouterManualHarnessOptions {
  readonly config: OpenRouterSandboxRuntimeConfig;
  readonly expected_bindings: OpenRouterRuntimeBindings;
  readonly kill_switch: OpenRouterKillSwitch;
  readonly budget: OpenRouterSandboxBudgetAvailability;
  readonly secret_provider: OpenRouterSecretProvider;
  readonly executor: GovernedOpenRouterManualExecutor;
  readonly fixture_id: string;
  readonly confirmation: boolean;
  readonly preflight_only: boolean;
  readonly supplied_hashes: OpenRouterRuntimeBindings;
  readonly now: Date;
  readonly operator_id: string;
  readonly on_preflight: (result: OpenRouterSandboxPreflightResult) => void;
}

export interface OpenRouterManualHarnessResult {
  readonly status: "preflight_only" | "blocked" | "executed";
  readonly preflight: OpenRouterSandboxPreflightResult;
  readonly adapter_outcome?: string;
  readonly consumption_result: string;
  readonly http_status_category?: string;
  readonly reported_input_tokens?: number;
  readonly reported_output_tokens?: number;
  readonly reported_cost_usd?: string;
}

const sameBindings = (
  left: OpenRouterRuntimeBindings,
  right: OpenRouterRuntimeBindings,
): boolean =>
  (Object.keys(left) as (keyof OpenRouterRuntimeBindings)[]).every(
    (key) => left[key] === right[key],
  );

export async function runOpenRouterManualSandboxHarness(
  options: OpenRouterManualHarnessOptions,
): Promise<OpenRouterManualHarnessResult> {
  if (options.fixture_id !== OPENROUTER_FIRST_RUN_FIXTURE_ID)
    throw new Error("fixture_not_approved");
  const nonSecret = await evaluateOpenRouterSandboxPreflight({
    config: options.config,
    expected_bindings: options.expected_bindings,
    kill_switch: options.kill_switch,
    budget: options.budget,
    resolve_secret: false,
    now: options.now,
    operator_id: options.operator_id,
    invocation: "manual",
    test_data_classification: "synthetic",
  });
  options.on_preflight(nonSecret);
  if (options.preflight_only)
    return Object.freeze({
      status: "preflight_only",
      preflight: nonSecret,
      consumption_result: "not_attempted",
    });
  if (nonSecret.outcome !== "ready_for_manual_sandbox_call")
    return Object.freeze({
      status: "blocked",
      preflight: nonSecret,
      consumption_result: "not_attempted",
    });
  if (!options.confirmation) throw new Error("explicit_confirmation_required");
  if (!sameBindings(options.supplied_hashes, options.expected_bindings))
    throw new Error("explicit_hash_confirmation_mismatch");
  const withSecret = await evaluateOpenRouterSandboxPreflight({
    config: options.config,
    expected_bindings: options.expected_bindings,
    kill_switch: options.kill_switch,
    budget: options.budget,
    secret_provider: options.secret_provider,
    resolve_secret: true,
    now: options.now,
    operator_id: options.operator_id,
    invocation: "manual",
    test_data_classification: "synthetic",
  });
  if (withSecret.outcome !== "ready_for_manual_sandbox_call")
    return Object.freeze({
      status: "blocked",
      preflight: withSecret,
      consumption_result: "not_attempted",
    });
  const execution = await options.executor.executeFixture(
    OPENROUTER_FIRST_RUN_FIXTURE_ID,
  );
  return Object.freeze({
    status: "executed",
    preflight: withSecret,
    ...execution,
  });
}
