import path from "node:path";
import { access } from "node:fs/promises";

import { readUtf8File, writeUtf8File } from "../lib/fs.js";
import { generateOperationalBriefingPreview } from "./operational-briefing-preview.js";

export type QualityGateStatus = "pass" | "fail";
export type QualityGateSeverity = "blocking" | "warning";

export interface BriefingQualityCheckResult {
  check_id: string;
  label: string;
  status: QualityGateStatus;
  severity: QualityGateSeverity;
  evidence: string;
  recommendation: string;
}

export interface BriefingQualityGateResult {
  sourceBriefingPath: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  blockingFailures: number;
  result: QualityGateStatus;
  checks: BriefingQualityCheckResult[];
}

export const defaultBriefingPath = "reports/operational-briefing-preview-p1.md";
export const defaultQualityGateReportPath =
  "reports/briefing-quality-gate-p1.md";

const requiredSections = [
  "Operational Intelligence Briefing Preview",
  "Executive Signal",
  "Decision Workspace Snapshot",
  "Why This Matters Operationally",
  "Evidence & Traceability",
  "Risk, Uncertainty & Limits",
  "Recommended Next Actions",
  "Human Review & Downstream Use",
  "Briefing Quality Bar",
] as const;

function normalizeMarkdownText(input: string): string {
  return input.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasHeading(markdown: string, heading: string): boolean {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingPattern = new RegExp(`^#{1,6}\\s+${escapedHeading}\\s*$`, "im");

  return headingPattern.test(markdown);
}

function hasAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => normalized.includes(phrase));
}

function hasAll(normalized: string, phrases: string[]): boolean {
  return phrases.every((phrase) => normalized.includes(phrase));
}

function createResult(
  checkId: string,
  label: string,
  passed: boolean,
  evidence: string,
  recommendation: string,
  severity: QualityGateSeverity = "blocking",
): BriefingQualityCheckResult {
  return {
    check_id: checkId,
    label,
    status: passed ? "pass" : "fail",
    severity,
    evidence,
    recommendation: passed ? "No action required." : recommendation,
  };
}

function hasRawJsonDump(markdown: string): boolean {
  if (/```\s*json/i.test(markdown)) {
    return true;
  }

  if (/^\s*[{[]\s*"[A-Za-z0-9_ -]+"\s*:/m.test(markdown)) {
    return true;
  }

  return /"schema_version"\s*:/.test(markdown);
}

function hasForbiddenAutonomousDetermination(markdown: string): boolean {
  const normalized = normalizeMarkdownText(markdown);
  const forbiddenPhrases = [
    "autonomous final determination",
    "final customs determination approved",
    "final legal determination approved",
    "customs clearance is approved",
    "clearance is authorized",
    "execute production action",
    "call supabase",
    "run api route",
  ];

  return hasAny(normalized, forbiddenPhrases);
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function evaluateBriefingQuality(
  markdown: string,
  sourceBriefingPath = defaultBriefingPath,
): BriefingQualityGateResult {
  const normalized = normalizeMarkdownText(markdown);
  const checks: BriefingQualityCheckResult[] = [];

  for (const section of requiredSections) {
    checks.push(
      createResult(
        `required-section-${section
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`,
        `Required section: ${section}`,
        hasHeading(markdown, section),
        hasHeading(markdown, section)
          ? `Heading present: ${section}`
          : `Heading missing: ${section}`,
        `Restore the ${section} section in the briefing preview.`,
      ),
    );
  }

  checks.push(
    createResult(
      "evidence-first-traceability",
      "Evidence-first traceability is visible",
      hasAny(normalized, ["evidence & traceability", "evidence ref"]) &&
        normalized.includes("traceability"),
      "Evidence section and traceability language must be visible.",
      "Add explicit evidence references and traceability language.",
    ),
    createResult(
      "no-raw-json-dumps",
      "Briefing avoids raw JSON and schema dumps",
      !hasRawJsonDump(markdown),
      hasRawJsonDump(markdown)
        ? "Raw JSON-looking content detected."
        : "No raw JSON-looking block detected.",
      "Replace raw JSON/schema dumps with operator-facing evidence summaries.",
    ),
    createResult(
      "risk-uncertainty-review",
      "Risk, uncertainty, and human review are explicit",
      hasAny(normalized, ["risk", "risk:"]) &&
        hasAny(normalized, ["uncertainty", "limitations", "limits"]) &&
        hasAny(normalized, ["human review", "review gate", "review required"]),
      "Risk, uncertainty or limitations, and human review language are required.",
      "Add visible risk, uncertainty or limitations, and human-review gate language.",
    ),
    createResult(
      "recommended-actions-present",
      "Recommended next actions are present",
      hasHeading(markdown, "Recommended Next Actions") &&
        hasAny(normalized, ["next action", "recommended next actions"]),
      "Recommended next action language must be present.",
      "Restore broker-facing recommended next actions.",
    ),
    createResult(
      "broker-workflow-usefulness",
      "Broker workflow usefulness is explicit",
      hasAny(normalized, ["operator impact", "broker", "despachante"]),
      "Operator, broker, or despachante workflow impact language must be present.",
      "Add operational impact language for a broker/despachante workflow.",
    ),
    createResult(
      "not-engineering-only",
      "Briefing is not only schema/report infrastructure",
      hasAny(normalized, [
        "operator-facing",
        "operator impact",
        "decision support",
      ]) && !hasAll(normalized, ["schema registry", "schema validation only"]),
      "Briefing must read as operator-facing intelligence, not only infrastructure output.",
      "Lead with operational decision support, not schema/report infrastructure language.",
    ),
    createResult(
      "local-only-no-production",
      "Local-only and no-production boundary is explicit",
      hasAny(normalized, ["repository fixtures only", "local-only"]) &&
        hasAny(normalized, [
          "no production systems",
          "no production integration",
        ]),
      "Local-only/no-production language must be present.",
      "Add a clear local-only and no-production systems note.",
    ),
    createResult(
      "no-final-determination",
      "Legal/customs final determination boundary is explicit",
      normalized.includes("not a final legal or customs determination"),
      "Briefing must state it is not a final legal or customs determination.",
      "Add the required non-final legal/customs determination boundary.",
    ),
    createResult(
      "no-autonomous-final-action",
      "No autonomous final action language is present",
      !hasForbiddenAutonomousDetermination(markdown),
      hasForbiddenAutonomousDetermination(markdown)
        ? "Autonomous final action wording detected."
        : "No autonomous final action wording detected.",
      "Remove autonomous final determination or execution wording.",
    ),
    createResult(
      "product-quality-bar",
      "Product quality bar is enforced in prose",
      hasAll(normalized, [
        "concise-first",
        "evidence-first",
        "uncertainty visible",
        "next action clear",
        "ai inference separated from reviewed evidence",
        "not raw schema output",
      ]),
      "Quality bar must include concise-first, evidence-first, uncertainty, action clarity, inference/evidence separation, and no raw schema output.",
      "Restore the full Briefing Quality Bar checklist.",
    ),
  );

  const passedChecks = checks.filter((check) => check.status === "pass").length;
  const failedChecks = checks.length - passedChecks;
  const blockingFailures = checks.filter(
    (check) => check.status === "fail" && check.severity === "blocking",
  ).length;

  return {
    sourceBriefingPath,
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    blockingFailures,
    result: blockingFailures === 0 ? "pass" : "fail",
    checks,
  };
}

export function renderBriefingQualityGateReport(
  result: BriefingQualityGateResult,
): string {
  const lines = [
    "# Briefing Quality Gate P1",
    "",
    `- **Source briefing path:** ${result.sourceBriefingPath}`,
    `- **Total checks:** ${result.totalChecks}`,
    `- **Passed checks:** ${result.passedChecks}`,
    `- **Failed checks:** ${result.failedChecks}`,
    `- **Blocking status:** ${result.blockingFailures === 0 ? "clear" : `${result.blockingFailures} blocking failure(s)`}`,
    `- **Quality gate result:** ${result.result.toUpperCase()}`,
    "",
    "## Check Results",
    "",
    "| Check ID | Label | Severity | Status | Evidence | Recommendation |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const check of result.checks) {
    lines.push(
      `| ${escapeTableCell(check.check_id)} | ${escapeTableCell(check.label)} | ${check.severity} | ${check.status.toUpperCase()} | ${escapeTableCell(check.evidence)} | ${escapeTableCell(check.recommendation)} |`,
    );
  }

  const failedChecks = result.checks.filter((check) => check.status === "fail");
  lines.push("", "## Focused Recommendations", "");

  if (failedChecks.length === 0) {
    lines.push(
      "- Current briefing passes the local premium operational intelligence quality gate.",
      "- Keep evidence, uncertainty, human-review gates, and broker-facing next actions visible in future edits.",
    );
  } else {
    for (const check of failedChecks) {
      lines.push(`- **${check.check_id}:** ${check.recommendation}`);
    }
  }

  lines.push(
    "",
    "## Local-Only / No-Production Note",
    "",
    "This quality gate reads local repository markdown only. It does not require production systems, external services, network access, Supabase, scraping, runtime agents, API routes, migrations, scheduled jobs, or classifier write-back.",
    "",
  );

  return lines.join("\n");
}

async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await access(path.resolve(process.cwd(), relativePath));
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function runBriefingQualityGate(
  sourceBriefingPath = defaultBriefingPath,
  outputPath = defaultQualityGateReportPath,
): Promise<BriefingQualityGateResult> {
  if (!(await fileExists(sourceBriefingPath))) {
    await generateOperationalBriefingPreview(sourceBriefingPath);
  }

  const markdown = await readUtf8File(
    path.resolve(process.cwd(), sourceBriefingPath),
  );
  const result = evaluateBriefingQuality(markdown, sourceBriefingPath);
  const report = renderBriefingQualityGateReport(result);

  await writeUtf8File(path.resolve(process.cwd(), outputPath), report);

  return result;
}

async function run(): Promise<void> {
  const sourceBriefingPath = process.argv[2] ?? defaultBriefingPath;
  const outputPath = process.argv[3] ?? defaultQualityGateReportPath;
  const result = await runBriefingQualityGate(sourceBriefingPath, outputPath);

  console.log(
    `Briefing quality gate ${result.result.toUpperCase()}: ${result.passedChecks}/${result.totalChecks} checks passed.`,
  );

  if (result.result === "fail") {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("briefing-quality-gate.ts")) {
  run().catch((error) => {
    console.error("Briefing quality gate failed to run.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
