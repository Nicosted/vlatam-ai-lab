import { access } from "node:fs/promises";
import path from "node:path";

import { readUtf8File, writeUtf8File } from "../lib/fs.js";

const requiredEntryFields = [
  "contract_name",
  "schema_file",
  "valid_fixture",
  "invalid_fixtures",
  "test_file",
  "status",
  "purpose",
  "downstream_role",
  "requires_human_review_semantics",
  "requires_traceability",
  "downstream_allowed_field_present",
] as const;

export interface SchemaRegistryEntry {
  contract_name: string;
  schema_file: string;
  valid_fixture: string;
  invalid_fixtures: string[];
  test_file: string;
  status: string;
  purpose: string;
  downstream_role: string;
  requires_human_review_semantics: boolean;
  requires_traceability: boolean;
  downstream_allowed_field_present: boolean;
}

export interface SchemaRegistry {
  contracts: SchemaRegistryEntry[];
}

export interface MissingReference {
  contract_name: string;
  field: string;
  path: string;
}

export interface SchemaReadinessSummary {
  registryPath: string;
  totalContracts: number;
  totalValidFixtures: number;
  totalInvalidFixtures: number;
  totalTestFiles: number;
  contractNames: string[];
  missingReferences: MissingReference[];
  entries: SchemaRegistryEntry[];
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }

  return value;
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  key: string,
  label: string,
): boolean {
  const value = record[key];

  if (typeof value !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean.`);
  }

  return value;
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string[] {
  const value = record[key];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label}.${key} must be an array of strings.`);
  }

  return [...value];
}

function toRegistryEntry(value: unknown, index: number): SchemaRegistryEntry {
  const label = `contracts[${index}]`;
  const record = asRecord(value, label);

  for (const field of requiredEntryFields) {
    if (!Object.hasOwn(record, field)) {
      throw new Error(`${label}.${field} is required.`);
    }
  }

  return {
    contract_name: readRequiredString(record, "contract_name", label),
    schema_file: readRequiredString(record, "schema_file", label),
    valid_fixture: readRequiredString(record, "valid_fixture", label),
    invalid_fixtures: readRequiredStringArray(
      record,
      "invalid_fixtures",
      label,
    ),
    test_file: readRequiredString(record, "test_file", label),
    status: readRequiredString(record, "status", label),
    purpose: readRequiredString(record, "purpose", label),
    downstream_role: readRequiredString(record, "downstream_role", label),
    requires_human_review_semantics: readRequiredBoolean(
      record,
      "requires_human_review_semantics",
      label,
    ),
    requires_traceability: readRequiredBoolean(
      record,
      "requires_traceability",
      label,
    ),
    downstream_allowed_field_present: readRequiredBoolean(
      record,
      "downstream_allowed_field_present",
      label,
    ),
  };
}

export async function readSchemaRegistry(
  registryPath = "schemas/schema-registry.json",
): Promise<SchemaRegistry> {
  const content = await readUtf8File(path.resolve(process.cwd(), registryPath));
  const parsed = asRecord(JSON.parse(content) as unknown, "schema registry");
  const contracts = parsed["contracts"];

  if (!Array.isArray(contracts)) {
    throw new Error("schema registry.contracts must be an array.");
  }

  return {
    contracts: contracts.map((entry, index) => toRegistryEntry(entry, index)),
  };
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await access(path.resolve(process.cwd(), relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function buildSchemaReadinessSummary(
  registryPath = "schemas/schema-registry.json",
): Promise<SchemaReadinessSummary> {
  const registry = await readSchemaRegistry(registryPath);
  const missingReferences: MissingReference[] = [];

  for (const entry of registry.contracts) {
    const references = [
      { field: "schema_file", path: entry.schema_file },
      { field: "valid_fixture", path: entry.valid_fixture },
      { field: "test_file", path: entry.test_file },
      ...entry.invalid_fixtures.map((fixturePath) => ({
        field: "invalid_fixtures",
        path: fixturePath,
      })),
    ];

    for (const reference of references) {
      if (!(await pathExists(reference.path))) {
        missingReferences.push({
          contract_name: entry.contract_name,
          field: reference.field,
          path: reference.path,
        });
      }
    }
  }

  return {
    registryPath,
    totalContracts: registry.contracts.length,
    totalValidFixtures: registry.contracts.length,
    totalInvalidFixtures: registry.contracts.reduce(
      (total, entry) => total + entry.invalid_fixtures.length,
      0,
    ),
    totalTestFiles: new Set(registry.contracts.map((entry) => entry.test_file))
      .size,
    contractNames: registry.contracts.map((entry) => entry.contract_name),
    missingReferences,
    entries: registry.contracts,
  };
}

function formatBoolean(value: boolean): string {
  return value ? "yes" : "no";
}

function renderMissingReferences(
  missingReferences: MissingReference[],
): string[] {
  if (missingReferences.length === 0) {
    return ["- Missing references: `0`", "- Status: `none`"];
  }

  return missingReferences.map(
    (reference) =>
      `- ${reference.contract_name} ${reference.field}: \`${reference.path}\``,
  );
}

function renderMarkdownTable(
  rows: string[][],
  rightAlignedColumns: number[],
): string[] {
  const headerRow = rows[0];
  if (!headerRow) {
    return [];
  }

  const header = headerRow.join(" | ");
  const divider = headerRow
    .map((_, columnIndex) =>
      rightAlignedColumns.includes(columnIndex) ? "---:" : "---",
    )
    .join(" | ");
  const body = rows.slice(1).map((row) => row.join(" | "));

  return [
    `| ${header} |`,
    `| ${divider} |`,
    ...body.map((row) => `| ${row} |`),
  ];
}

function wrapText(text: string, width = 80): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;

    if (nextLine.length > width && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export function renderSchemaReadinessReport(
  summary: SchemaReadinessSummary,
): string {
  const inventoryRows = [
    [
      "Contract",
      "Status",
      "Schema",
      "Valid Fixture",
      "Invalid Fixtures",
      "Test File",
      "Human Review Semantics",
      "Traceability",
      "Downstream Allowed Field",
    ],
    ...summary.entries.map((entry) => [
      `\`${entry.contract_name}\``,
      `\`${entry.status}\``,
      `\`${entry.schema_file}\``,
      `\`${entry.valid_fixture}\``,
      String(entry.invalid_fixtures.length),
      `\`${entry.test_file}\``,
      formatBoolean(entry.requires_human_review_semantics),
      formatBoolean(entry.requires_traceability),
      formatBoolean(entry.downstream_allowed_field_present),
    ]),
  ];
  const lines = [
    "# P1 Schema Readiness Report",
    "",
    "## Metadata",
    "",
    "- generated_by: `schema-readiness-report.ts`",
    `- source_registry_path: \`${summary.registryPath}\``,
    "- local_only_note: Generated from local repository artifacts only; no production systems, external services, or network access are required.",
    "",
    "## Summary",
    "",
    `- total_contracts: \`${summary.totalContracts}\``,
    `- total_valid_fixtures: \`${summary.totalValidFixtures}\``,
    `- total_invalid_fixtures: \`${summary.totalInvalidFixtures}\``,
    `- total_test_files: \`${summary.totalTestFiles}\``,
    "",
    "## Contract Names",
    "",
    ...summary.contractNames.map((contractName) => `- \`${contractName}\``),
    "",
    "## Contract Inventory",
    "",
    ...renderMarkdownTable(inventoryRows, [4]),
  ];

  lines.push(
    "",
    "## Missing Reference Summary",
    "",
    ...renderMissingReferences(summary.missingReferences),
    "",
    "## Readiness Conclusion",
    "",
  );

  if (summary.missingReferences.length === 0) {
    lines.push(
      ...wrapText(
        "The completed P1 schema hardening set is locally indexed and reference-complete for schema readiness reporting.",
      ),
    );
  } else {
    lines.push(
      ...wrapText(
        "The completed P1 schema hardening set has missing local references that require review before readiness handoff.",
      ),
    );
  }

  lines.push(
    "",
    "## Local-Only / No-Production Note",
    "",
    ...wrapText(
      "This report is generated from local repository files only. It does not require `.env` files, Supabase, production systems, API routes, database migrations, scraping, scheduled jobs, runtime agents, classifier write-back, or external network access.",
    ),
    "",
  );

  return lines.join("\n");
}

export async function generateSchemaReadinessReport(
  outputPath = "reports/schema-readiness-p1.md",
  registryPath = "schemas/schema-registry.json",
): Promise<string> {
  const summary = await buildSchemaReadinessSummary(registryPath);
  const markdown = renderSchemaReadinessReport(summary);

  await writeUtf8File(path.resolve(process.cwd(), outputPath), markdown);

  return markdown;
}

async function run(): Promise<void> {
  const outputPath = process.argv[2] ?? "reports/schema-readiness-p1.md";

  await generateSchemaReadinessReport(outputPath);
  console.log(`Schema readiness report generated successfully: ${outputPath}`);
}

if (process.argv[1]?.endsWith("schema-readiness-report.ts")) {
  run().catch((error) => {
    console.error("Schema readiness report generation failed.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
