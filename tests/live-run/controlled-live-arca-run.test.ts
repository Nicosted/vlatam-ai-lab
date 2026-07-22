import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { GOVERNED_ARCA_ACQUISITION_POLICY_SHA256 } from "../../src/acquisition/governed-source-acquisition.js";
import { parseControlledLiveRunArguments } from "../../src/cli/controlled-live-arca-run.js";
import {
  computeControlledLiveAuthorizationSha256,
  computeControlledLiveConfigurationSha256,
  computeControlledLiveKillSwitchSha256,
  computeControlledLiveProposalSha256,
  executeControlledLiveArcaRun,
  inspectControlledLiveRunRecovery,
  preflightControlledLiveArcaRun,
  recoverControlledLiveArcaRun,
  type ControlledLiveRunAuthorization,
  type ControlledLiveRunKillSwitch,
  type ControlledLiveRunProposal,
  type ControlledLiveRunRootConfiguration,
} from "../../src/live-run/controlled-live-arca-run.js";
import { DURABLE_ARCA_STORE_CONFIGURATION_SHA256 } from "../../src/store/durable-arca-review-store.js";

const NOW = "2026-07-22T12:00:00.000Z";
const URL = "https://www.arca.gob.ar/aduana/arancelintegrado/nomenclador.txt";
const CONTENT = "2@4202.92.00@10.00@20.00@3.00@@@@UN@@BOLSOS DE VIAJE\n";
const addFormats = ((
  addFormatsModule as unknown as { default?: typeof addFormatsModule }
).default ?? addFormatsModule) as unknown as (ajv: Ajv) => void;

interface Fixture {
  root: string;
  proposal: ControlledLiveRunProposal;
  authorization: ControlledLiveRunAuthorization;
  killSwitch: ControlledLiveRunKillSwitch;
  configuration: ControlledLiveRunRootConfiguration;
  killSwitchPath: string;
}

async function fixture(): Promise<Fixture> {
  const root = await mkdtemp(join(await realpath(tmpdir()), "ai-131-"));
  const roots = {
    acquisition: join(root, "acquisitions"),
    candidate: join(root, "candidates"),
    store: join(root, "store"),
    state: join(root, "state"),
  };
  await Promise.all(
    Object.values(roots).map((path) => mkdir(path, { recursive: true })),
  );
  let configuration: ControlledLiveRunRootConfiguration = {
    schema_version: "1.0.0",
    configuration_id: "synthetic-ai-131-roots",
    configuration_sha256: "0".repeat(64),
    acquisition_output: {
      identity: "root:synthetic-acquisition",
      path: roots.acquisition,
    },
    candidate_output: {
      identity: "root:synthetic-candidate",
      path: roots.candidate,
    },
    durable_store: {
      identity: "root:synthetic-store",
      path: roots.store,
      configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    },
    run_state: { identity: "root:synthetic-run-state", path: roots.state },
  };
  configuration = {
    ...configuration,
    configuration_sha256:
      computeControlledLiveConfigurationSha256(configuration),
  };
  let proposal: ControlledLiveRunProposal = {
    schema_version: "1.0.0",
    proposal_id: `arca-live-proposal--${"0".repeat(64)}`,
    proposal_sha256: "0".repeat(64),
    created_at: "2026-07-22T10:00:00.000Z",
    proposal_author_identity: "human:proposer",
    requested_url: URL,
    expected_source_identity: "ar-arca-arancel-integrado",
    acquisition_policy_sha256: GOVERNED_ARCA_ACQUISITION_POLICY_SHA256,
    expected_media_type_family: "arca_delimited_text",
    maximum_response_bytes: 4096,
    timeout_ms: 1000,
    redirect_policy: "manual_allowlisted_host_only",
    acquisition_output_root_identity: configuration.acquisition_output.identity,
    candidate_output_root_identity: configuration.candidate_output.identity,
    durable_store_configuration_sha256: DURABLE_ARCA_STORE_CONFIGURATION_SHA256,
    acquisition_operator_identity: "human:operator",
    parser_runtime_identity: "service:arca-parser@1.0.0",
    candidate_producer_identity: "service:arca-candidate-producer@1.0.0",
    evidence_reviewer_identity: "human:reviewer",
    artifact_builder_identity: "service:arca-builder@1.0.0",
    future_publisher_identity: "human:publisher",
    execution_window: {
      starts_at: "2026-07-22T11:00:00.000Z",
      expires_at: "2026-07-22T13:00:00.000Z",
    },
    maximum_attempts: 1,
    maximum_successful_network_calls: 1,
    scheduler_authorized: false,
    export_authorized: false,
    publication_authorized: false,
    production_reliance_authorized: false,
  };
  const proposalHash = computeControlledLiveProposalSha256(proposal);
  proposal = {
    ...proposal,
    proposal_sha256: proposalHash,
    proposal_id: `arca-live-proposal--${proposalHash}`,
  };
  let authorization: ControlledLiveRunAuthorization = {
    schema_version: "1.0.0",
    authorization_id: `arca-live-authorization--${"0".repeat(64)}`,
    authorization_sha256: "0".repeat(64),
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    requested_url: URL,
    acquisition_policy_sha256: GOVERNED_ARCA_ACQUISITION_POLICY_SHA256,
    expected_source_identity: "ar-arca-arancel-integrado",
    authorization_identity: "human:independent-authorizer",
    authorized_at: "2026-07-22T10:30:00.000Z",
    not_before: "2026-07-22T11:00:00.000Z",
    expires_at: "2026-07-22T13:00:00.000Z",
    maximum_attempts: 1,
    maximum_network_calls: 1,
    scope: "controlled_live_arca_acquisition_only",
  };
  const authorizationHash =
    computeControlledLiveAuthorizationSha256(authorization);
  authorization = {
    ...authorization,
    authorization_sha256: authorizationHash,
    authorization_id: `arca-live-authorization--${authorizationHash}`,
  };
  let killSwitch: ControlledLiveRunKillSwitch = {
    schema_version: "1.0.0",
    kill_switch_id: "controlled-live-arca-run",
    kill_switch_sha256: "0".repeat(64),
    state: "disabled",
    reviewed_artifact_id: "synthetic-reviewed-disablement",
    reviewed_by: "human:kill-switch-reviewer",
    reviewed_at: "2026-07-22T10:45:00.000Z",
    reason: "Synthetic test fixture only.",
    live_execution_blocked: false,
  };
  killSwitch = {
    ...killSwitch,
    kill_switch_sha256: computeControlledLiveKillSwitchSha256(killSwitch),
  };
  const killSwitchPath = join(root, "kill-switch.json");
  await writeFile(killSwitchPath, `${JSON.stringify(killSwitch, null, 2)}\n`);
  return {
    root,
    proposal,
    authorization,
    killSwitch,
    configuration,
    killSwitchPath,
  };
}

async function cleanup(value: Fixture): Promise<void> {
  await rm(value.root, { recursive: true, force: true });
}
function rehashProposal(
  value: ControlledLiveRunProposal,
): ControlledLiveRunProposal {
  const blank = {
    ...value,
    proposal_id: `arca-live-proposal--${"0".repeat(64)}`,
    proposal_sha256: "0".repeat(64),
  };
  const hash = computeControlledLiveProposalSha256(blank);
  return {
    ...blank,
    proposal_id: `arca-live-proposal--${hash}`,
    proposal_sha256: hash,
  };
}
function rehashAuthorization(
  value: ControlledLiveRunAuthorization,
): ControlledLiveRunAuthorization {
  const blank = {
    ...value,
    authorization_id: `arca-live-authorization--${"0".repeat(64)}`,
    authorization_sha256: "0".repeat(64),
  };
  const hash = computeControlledLiveAuthorizationSha256(blank);
  return {
    ...blank,
    authorization_id: `arca-live-authorization--${hash}`,
    authorization_sha256: hash,
  };
}
function authorizationFor(
  proposal: ControlledLiveRunProposal,
  base: ControlledLiveRunAuthorization,
  identity: string,
): ControlledLiveRunAuthorization {
  return rehashAuthorization({
    ...base,
    proposal_id: proposal.proposal_id,
    proposal_sha256: proposal.proposal_sha256,
    requested_url: proposal.requested_url,
    acquisition_policy_sha256: proposal.acquisition_policy_sha256,
    expected_source_identity: proposal.expected_source_identity,
    authorization_identity: identity,
  });
}

test("valid synthetic preflight is zero-network and repository kill switch blocks", async () => {
  const value = await fixture();
  try {
    const calls = 0;
    const result = await preflightControlledLiveArcaRun({
      runId: "run-preflight",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      configuration: value.configuration,
      executionTimestamp: NOW,
    });
    assert.equal(result.lifecycle, "authorized", JSON.stringify(result));
    assert.equal(result.outcome, "network_call_not_performed");
    assert.equal(result.network_calls_attempted, 0);
    assert.equal(calls, 0);
    const active = JSON.parse(
      await readFile(
        "config/ai-131-controlled-live-arca-kill-switch.json",
        "utf8",
      ),
    );
    const blocked = await preflightControlledLiveArcaRun({
      runId: "run-blocked",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: active,
      configuration: value.configuration,
      executionTimestamp: NOW,
    });
    assert.equal(blocked.outcome, "kill_switch_active");
    for (const invalid of [undefined, { state: "active" }]) {
      const failure = await preflightControlledLiveArcaRun({
        runId: "run-invalid-switch",
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: invalid,
        configuration: value.configuration,
        executionTimestamp: NOW,
      });
      assert.equal(failure.outcome, "kill_switch_active");
    }
  } finally {
    await cleanup(value);
  }
});

test("proposal, authorization, bindings, time, duties, and exact source fail closed", async () => {
  const value = await fixture();
  try {
    const candidateProposal = rehashProposal({
      ...value.proposal,
      candidate_producer_identity: "human:candidate-producer",
    });
    const builderProposal = rehashProposal({
      ...value.proposal,
      artifact_builder_identity: "human:builder",
    });
    const shortWindowProposal = rehashProposal({
      ...value.proposal,
      execution_window: {
        ...value.proposal.execution_window,
        expires_at: "2026-07-22T11:30:00.000Z",
      },
    });
    const cases: Array<[string, unknown, unknown, string, string]> = [
      [
        "invalid proposal",
        { ...value.proposal, unknown: true },
        value.authorization,
        NOW,
        "invalid_proposal",
      ],
      [
        "invalid authorization",
        value.proposal,
        { ...value.authorization, unknown: true },
        NOW,
        "invalid_authorization",
      ],
      [
        "future authorization",
        value.proposal,
        rehashAuthorization({
          ...value.authorization,
          authorized_at: "2026-07-22T12:30:00.000Z",
          not_before: "2026-07-22T12:30:00.000Z",
        }),
        NOW,
        "authorization_not_yet_valid",
      ],
      [
        "expired authorization",
        value.proposal,
        rehashAuthorization({
          ...value.authorization,
          expires_at: "2026-07-22T11:30:00.000Z",
        }),
        NOW,
        "authorization_expired",
      ],
      [
        "outside window",
        shortWindowProposal,
        authorizationFor(
          shortWindowProposal,
          value.authorization,
          value.authorization.authorization_identity,
        ),
        NOW,
        "execution_window_invalid",
      ],
      [
        "proposal mismatch",
        value.proposal,
        rehashAuthorization({
          ...value.authorization,
          proposal_sha256: "f".repeat(64),
        }),
        NOW,
        "invalid_authorization",
      ],
      [
        "url mismatch",
        value.proposal,
        rehashAuthorization({
          ...value.authorization,
          requested_url:
            "https://www.afip.gob.ar/aduana/arancelintegrado/nomenclador.txt",
        }),
        NOW,
        "source_binding_mismatch",
      ],
      [
        "source mismatch",
        rehashProposal({
          ...value.proposal,
          requested_url: "https://www.arca.gob.ar/not-allowlisted",
        }),
        value.authorization,
        NOW,
        "source_not_allowlisted",
      ],
      [
        "policy mismatch",
        rehashProposal({
          ...value.proposal,
          acquisition_policy_sha256: "f".repeat(64),
        }),
        value.authorization,
        NOW,
        "policy_binding_mismatch",
      ],
      [
        "operator conflict",
        value.proposal,
        rehashAuthorization({
          ...value.authorization,
          authorization_identity: value.proposal.acquisition_operator_identity,
        }),
        NOW,
        "separation_of_duties_violation",
      ],
      [
        "candidate producer conflict",
        candidateProposal,
        authorizationFor(
          candidateProposal,
          value.authorization,
          "human:candidate-producer",
        ),
        NOW,
        "separation_of_duties_violation",
      ],
      [
        "builder conflict",
        builderProposal,
        authorizationFor(builderProposal, value.authorization, "human:builder"),
        NOW,
        "separation_of_duties_violation",
      ],
      [
        "publisher conflict",
        value.proposal,
        rehashAuthorization({
          ...value.authorization,
          authorization_identity: value.proposal.future_publisher_identity,
        }),
        NOW,
        "separation_of_duties_violation",
      ],
    ];
    for (const [name, proposal, authorization, timestamp, expected] of cases) {
      const result = await preflightControlledLiveArcaRun({
        runId: `run-${name.replaceAll(" ", "-")}`,
        proposal,
        authorization,
        killSwitch: value.killSwitch,
        configuration: value.configuration,
        executionTimestamp: timestamp,
      });
      assert.equal(
        result.outcome,
        expected,
        `${name}:${JSON.stringify(result)}`,
      );
    }
    const invalidRun = await preflightControlledLiveArcaRun({
      runId: "../../escape",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      configuration: value.configuration,
      executionTimestamp: NOW,
    });
    assert.equal(invalidRun.outcome, "invalid_proposal");
    const invalidTimestamp = await preflightControlledLiveArcaRun({
      runId: "run-invalid-time",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      configuration: value.configuration,
      executionTimestamp: "not-a-timestamp",
    });
    assert.equal(invalidTimestamp.outcome, "execution_window_invalid");
    const invalidConfiguration = structuredClone(
      value.configuration,
    ) as ControlledLiveRunRootConfiguration & {
      acquisition_output: ControlledLiveRunRootConfiguration["acquisition_output"] & {
        proxy: string;
      };
    };
    invalidConfiguration.acquisition_output.proxy = "forbidden";
    const invalidConfigurationResult = await preflightControlledLiveArcaRun({
      runId: "run-invalid-configuration",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      configuration: invalidConfiguration,
      executionTimestamp: NOW,
    });
    assert.equal(invalidConfigurationResult.outcome, "policy_binding_mismatch");
  } finally {
    await cleanup(value);
  }
});

test("exact one-call mocked success persists only a review-required candidate", async () => {
  const value = await fixture();
  try {
    let calls = 0;
    const result = await executeControlledLiveArcaRun({
      runId: "run-success",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      killSwitchPath: value.killSwitchPath,
      configuration: value.configuration,
      executionTimestamp: NOW,
      transport: async () => {
        calls += 1;
        return new Response(CONTENT, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      },
    });
    assert.equal(result.outcome, "completed");
    assert.equal(calls, 1);
    assert.equal(result.network_calls_attempted, 1);
    assert.equal(result.network_calls_completed, 1);
    assert.equal(result.authorization_consumed, true);
    assert.equal(result.acquisition_bytes_persisted, true);
    assert.equal(result.candidate_created, true);
    assert.equal(result.candidate_durably_persisted, true);
    assert.equal(result.review_required, true);
    assert.equal(result.approval, false);
    assert.equal(result.approved_artifact_created, false);
    assert.equal(result.export_authorized, false);
    assert.equal(result.publication_authorized, false);
    assert.equal(result.production_reliance_authorized, false);
    assert.equal(result.scheduler_authorized, false);
    assert.equal(result.deployment_authorized, false);
    assert.equal(result.vlatam_global_access_authorized, false);
    const repeat = await executeControlledLiveArcaRun({
      runId: "run-repeat",
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      killSwitchPath: value.killSwitchPath,
      configuration: value.configuration,
      executionTimestamp: NOW,
      transport: async () => {
        throw new Error("second fetch forbidden");
      },
    });
    assert.equal(repeat.outcome, "authorization_already_consumed");
  } finally {
    await cleanup(value);
  }
});

test("transport failures are sanitized and redirects cannot trigger a second call", async () => {
  for (const scenario of [
    "redirect",
    "bad_redirect",
    "large",
    "media",
    "timeout",
    "failure",
  ] as const) {
    const value = await fixture();
    try {
      let calls = 0;
      const transport = async (): Promise<Response> => {
        calls += 1;
        if (scenario === "redirect")
          return new Response(null, {
            status: 302,
            headers: {
              location:
                "https://www.afip.gob.ar/aduana/arancelintegrado/nomenclador.txt",
            },
          });
        if (scenario === "bad_redirect")
          return new Response(null, {
            status: 302,
            headers: { location: "https://example.com/forbidden" },
          });
        if (scenario === "large")
          return new Response(CONTENT, {
            status: 200,
            headers: {
              "content-type": "text/plain",
              "content-length": "99999",
            },
          });
        if (scenario === "media")
          return new Response(CONTENT, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        if (scenario === "timeout") {
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
        throw new Error("synthetic transport failure");
      };
      const result = await executeControlledLiveArcaRun({
        runId: `run-${scenario}`,
        proposal: value.proposal,
        authorization: value.authorization,
        killSwitch: value.killSwitch,
        killSwitchPath: value.killSwitchPath,
        configuration: value.configuration,
        executionTimestamp: NOW,
        transport,
      });
      assert.equal(result.outcome, "acquisition_failed");
      assert.equal(calls, 1);
      if (scenario === "redirect")
        assert.deepEqual(result.details, ["NETWORK_CALL_LIMIT"]);
    } finally {
      await cleanup(value);
    }
  }
});

test("recovery resumes acquisition and candidate persistence from exact local bytes without fetch", async () => {
  for (const stage of [
    "acquisition_succeeded",
    "ingestion_succeeded",
  ] as const) {
    const value = await fixture();
    try {
      let calls = 0;
      await assert.rejects(
        executeControlledLiveArcaRun({
          runId: `run-resume-${stage}`,
          proposal: value.proposal,
          authorization: value.authorization,
          killSwitch: value.killSwitch,
          killSwitchPath: value.killSwitchPath,
          configuration: value.configuration,
          executionTimestamp: NOW,
          interruptAfterLifecycle: stage,
          transport: async () => {
            calls += 1;
            return new Response(CONTENT, {
              status: 200,
              headers: { "content-type": "text/plain" },
            });
          },
        }),
        new RegExp(stage),
      );
      assert.equal(calls, 1);
      const recovered = await recoverControlledLiveArcaRun({
        runId: `run-resume-${stage}`,
        proposal: value.proposal,
        authorization: value.authorization,
        configuration: value.configuration,
        recoveryTimestamp: "2026-07-22T12:05:00.000Z",
      });
      assert.equal(recovered.outcome, "completed");
      assert.equal(recovered.network_calls_attempted, 0);
      assert.equal(calls, 1);
      assert.equal(recovered.candidate_durably_persisted, true);
    } finally {
      await cleanup(value);
    }
  }
});

test("crash inspection never retries automatically and consumption is atomic", async () => {
  for (const stage of [
    "authorized",
    "authorization_consumed",
    "acquisition_started",
  ] as const) {
    const value = await fixture();
    try {
      await assert.rejects(
        executeControlledLiveArcaRun({
          runId: `run-crash-${stage}`,
          proposal: value.proposal,
          authorization: value.authorization,
          killSwitch: value.killSwitch,
          killSwitchPath: value.killSwitchPath,
          configuration: value.configuration,
          executionTimestamp: NOW,
          interruptAfterLifecycle: stage,
          transport: async () => {
            throw new Error("must not fetch");
          },
        }),
        new RegExp(stage),
      );
      const recovery = await inspectControlledLiveRunRecovery(
        value.configuration.run_state.path,
        `run-crash-${stage}`,
        NOW,
      );
      assert.equal(recovery.network_calls_attempted, 0);
      if (stage === "authorized")
        assert.equal(recovery.outcome, "network_call_not_performed");
      else assert.equal(recovery.outcome, "recovery_required");
    } finally {
      await cleanup(value);
    }
  }
  const value = await fixture();
  try {
    let calls = 0;
    const input = (runId: string) => ({
      runId,
      proposal: value.proposal,
      authorization: value.authorization,
      killSwitch: value.killSwitch,
      killSwitchPath: value.killSwitchPath,
      configuration: value.configuration,
      executionTimestamp: NOW,
      transport: async () => {
        calls += 1;
        return new Response(CONTENT, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      },
    });
    const results = await Promise.all([
      executeControlledLiveArcaRun(input("run-race-a")),
      executeControlledLiveArcaRun(input("run-race-b")),
    ]);
    assert.equal(
      results.filter((result) => result.authorization_consumed).length,
      1,
    );
    assert.equal(calls, 1);
  } finally {
    await cleanup(value);
  }
});

test("schemas compile closed and CLI rejects authority-expanding arguments", async () => {
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  for (const path of [
    "schemas/controlled-live-arca-run-proposal.schema.json",
    "schemas/controlled-live-arca-run-authorization.schema.json",
    "schemas/controlled-live-arca-kill-switch.schema.json",
    "schemas/controlled-live-arca-run-result.schema.json",
    "schemas/controlled-live-arca-run-journal.schema.json",
    "schemas/durable-controlled-live-arca-run-record.schema.json",
  ]) {
    const schema = JSON.parse(await readFile(path, "utf8"));
    assert.equal(schema.additionalProperties, false);
    assert.doesNotThrow(() => ajv.compile(schema));
  }
  assert.throws(
    () => parseControlledLiveRunArguments(["--url", URL]),
    /unsupported_argument/,
  );
  for (const forbidden of [
    "--headers",
    "--cookie",
    "--proxy",
    "--retry",
    "--scheduler",
    "--publish",
    "--production",
    "--disable-kill-switch",
  ])
    assert.throws(() => parseControlledLiveRunArguments([forbidden, "x"]));
  assert.deepEqual(parseControlledLiveRunArguments(["--preflight"]), {
    preflight: "true",
  });
});
