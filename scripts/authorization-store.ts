import {
  SqliteAuthorizationStateStore,
  type AuthorizationConsumptionBinding,
} from "../src/handoff/index.js";

const [
  command,
  databasePath = ".local/authorization-consumption.sqlite",
  argument,
] = process.argv.slice(2);
const store = new SqliteAuthorizationStateStore({
  databasePath,
  createParentDirectory: command === "init",
});
const fixture = (
  patch: Partial<AuthorizationConsumptionBinding> = {},
): AuthorizationConsumptionBinding => ({
  authorization_id: "authorization.fixture",
  handoff_policy_id: "handoff.reviewed-routing",
  handoff_policy_version: "1.0.0",
  handoff_policy_hash: "a".repeat(64),
  decision_hash: "b".repeat(64),
  authorization_mode: "single_use",
  execution_correlation_id: "execution.fixture",
  audit_correlation_id: "audit.fixture",
  consumed_at: "2026-07-12T12:00:00.000Z",
  ...patch,
});
try {
  if (command === "init") {
    store.initialize();
    console.log(JSON.stringify(store.validateSchema(), null, 2));
  } else if (command === "validate") {
    const result = store.validateSchema();
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } else if (command === "inspect")
    console.log(
      JSON.stringify(
        {
          schema_version: "1.0.0",
          found: Boolean(store.inspect(argument ?? "")),
          record: store.inspect(argument ?? ""),
        },
        null,
        2,
      ),
    );
  else if (command === "list")
    console.log(
      JSON.stringify(
        {
          schema_version: "1.0.0",
          records: store.listRecent(Number(argument ?? 20)),
        },
        null,
        2,
      ),
    );
  else if (
    [
      "concurrency-fixture",
      "multi-instance-fixture",
      "restart-fixture",
      "binding-conflict-fixture",
      "unavailable-fixture",
    ].includes(command ?? "")
  ) {
    if (command === "unavailable-fixture")
      console.log(
        JSON.stringify({ result: store.consume(fixture()) }, null, 2),
      );
    else {
      store.initialize();
      const first = store.consume(fixture());
      store.close();
      const second = new SqliteAuthorizationStateStore({ databasePath });
      const patch =
        command === "binding-conflict-fixture"
          ? { decision_hash: "c".repeat(64) }
          : {};
      const subsequent = second.consume(fixture(patch));
      console.log(
        JSON.stringify(
          { fixture: command, first, subsequent, records: second.listRecent() },
          null,
          2,
        ),
      );
      second.close();
    }
  } else {
    console.error(
      "usage: authorization-store <init|validate|inspect|list|concurrency-fixture|multi-instance-fixture|restart-fixture|binding-conflict-fixture|unavailable-fixture> [database-path] [id-or-limit]",
    );
    process.exitCode = 1;
  }
} finally {
  store.close();
}
