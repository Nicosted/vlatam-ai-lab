import { writeFile } from "node:fs/promises";

import {
  SCHEDULED_RUN_REQUEST_SCHEMA,
  SCHEDULER_ATTEMPT_LEDGER_SCHEMA,
  SCHEDULER_ATTEMPT_LEDGER_MANIFEST_SCHEMA,
  SCHEDULER_AI_131_DISPOSITION_SCHEMA,
  SCHEDULER_AI_132_DISPOSITION_SCHEMA,
  SCHEDULER_ACTIVATION_SCHEMA,
  SCHEDULER_CONFIGURATION_SCHEMA,
  SCHEDULER_KILL_SWITCH_SCHEMA,
  SCHEDULER_LEASE_SCHEMA,
  SCHEDULER_OBSERVATION_SCHEMA,
  SCHEDULER_RECOVERY_DECISION_SCHEMA,
  SCHEDULER_RECOVERY_INPUT_SCHEMA,
  SCHEDULER_REVIEWED_ENVIRONMENT_SCHEMA,
  SCHEDULER_RUN_JOURNAL_SCHEMA,
  SCHEDULER_RUN_RESULT_SCHEMA,
  SCHEDULER_SLOT_ACCEPTANCE_SCHEMA,
} from "../src/scheduler/governed-arca-scheduler.js";

const schemas = {
  "arca-scheduler-configuration.schema.json": SCHEDULER_CONFIGURATION_SCHEMA,
  "arca-scheduler-activation.schema.json": SCHEDULER_ACTIVATION_SCHEMA,
  "arca-scheduled-run-request.schema.json": SCHEDULED_RUN_REQUEST_SCHEMA,
  "arca-scheduler-lease.schema.json": SCHEDULER_LEASE_SCHEMA,
  "arca-scheduler-run-journal.schema.json": SCHEDULER_RUN_JOURNAL_SCHEMA,
  "arca-scheduler-run-result.schema.json": SCHEDULER_RUN_RESULT_SCHEMA,
  "arca-scheduler-observation.schema.json": SCHEDULER_OBSERVATION_SCHEMA,
  "arca-scheduler-recovery-decision.schema.json":
    SCHEDULER_RECOVERY_DECISION_SCHEMA,
  "arca-scheduler-recovery-input.schema.json": SCHEDULER_RECOVERY_INPUT_SCHEMA,
  "arca-scheduler-kill-switch.schema.json": SCHEDULER_KILL_SWITCH_SCHEMA,
  "arca-scheduler-attempt-ledger.schema.json": SCHEDULER_ATTEMPT_LEDGER_SCHEMA,
  "arca-scheduler-attempt-ledger-manifest.schema.json":
    SCHEDULER_ATTEMPT_LEDGER_MANIFEST_SCHEMA,
  "arca-scheduler-slot-acceptance.schema.json":
    SCHEDULER_SLOT_ACCEPTANCE_SCHEMA,
  "arca-scheduler-reviewed-environment.schema.json":
    SCHEDULER_REVIEWED_ENVIRONMENT_SCHEMA,
  "arca-scheduler-ai-131-disposition.schema.json":
    SCHEDULER_AI_131_DISPOSITION_SCHEMA,
  "arca-scheduler-ai-132-disposition.schema.json":
    SCHEDULER_AI_132_DISPOSITION_SCHEMA,
} as const;

for (const [name, schema] of Object.entries(schemas))
  await writeFile(`schemas/${name}`, `${JSON.stringify(schema, null, 2)}\n`);
