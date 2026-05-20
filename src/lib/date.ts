export function nowIso(date: Date = new Date()): string {
  return date.toISOString();
}

export function timestampForFilename(date: Date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
