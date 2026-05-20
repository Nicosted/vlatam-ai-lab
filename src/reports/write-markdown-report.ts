import path from "node:path";

import { timestampForFilename } from "../lib/date.js";
import { writeUtf8File } from "../lib/fs.js";

export interface MarkdownSection {
  heading: string;
  body: string;
}

export interface MarkdownReportInput {
  title: string;
  sections: MarkdownSection[];
  directory?: string;
  fileNamePrefix?: string;
}

export async function writeMarkdownReport(
  input: MarkdownReportInput,
): Promise<string> {
  const directory = input.directory ?? path.resolve(process.cwd(), "reports");
  const prefix = input.fileNamePrefix ?? "report";
  const filePath = path.join(
    directory,
    `${prefix}-${timestampForFilename()}.md`,
  );

  const lines: string[] = [`# ${input.title}`, ""];

  for (const section of input.sections) {
    lines.push(`## ${section.heading}`);
    lines.push(section.body);
    lines.push("");
  }

  await writeUtf8File(filePath, lines.join("\n"));
  return filePath;
}
