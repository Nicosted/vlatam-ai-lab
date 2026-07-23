import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AI-133 scheduler has no direct transport, database, provider, deployment or vlatam-global boundary", async () => {
  const source = await readFile(
    "src/scheduler/governed-arca-scheduler.ts",
    "utf8",
  );
  for (const forbidden of [
    /\bfetch\s*\(/,
    /from ["']\.\.\/acquisition\//,
    /from ["']\.\.\/providers\//,
    /from ["']\.\.\/adapters\//,
    /from ["'](?:openai|@supabase|pg|postgres|@vercel)/,
    /vlatam-global/,
    /process\.env/,
    /\.env/,
    /setInterval|setTimeout/,
    /cron|launchd|systemd|github actions/i,
  ])
    assert.doesNotMatch(source, forbidden);
});

test("AI-133 CLI invokes only the existing AI-131 and AI-132 boundaries", async () => {
  const source = await readFile("src/cli/governed-arca-scheduler.ts", "utf8");
  assert.match(source, /live-run\/controlled-live-arca-run/);
  assert.match(source, /export\/governed-arca-export/);
  assert.doesNotMatch(source, /\.\.\/acquisition\//);
  assert.doesNotMatch(source, /\.\.\/artifacts\//);
  assert.doesNotMatch(source, /\.\.\/providers\//);
  assert.doesNotMatch(source, /--retry|--disable-kill-switch|--daemon|--cron/);
});

test("repository contains no scheduler installation or active activation", async () => {
  const packageJson = await readFile("package.json", "utf8");
  const template = JSON.parse(
    await readFile(
      "config/ai-133-governed-arca-scheduler-activation-template.json",
      "utf8",
    ),
  );
  assert.match(packageJson, /arca:governed-scheduler/);
  assert.equal(template.template_only, true);
  assert.equal(template.repository_current_activation_present, false);
  assert.equal(template.self_renewal_authorized, false);
});
