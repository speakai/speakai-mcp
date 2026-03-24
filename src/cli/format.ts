/**
 * Simple output formatting for CLI — no external deps.
 */

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(
  rows: Record<string, unknown>[],
  columns: { key: string; label: string; width?: number }[]
): void {
  if (rows.length === 0) {
    console.log("No results found.");
    return;
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const maxData = rows.reduce(
      (max, row) => Math.max(max, String(row[col.key] ?? "").length),
      0
    );
    return col.width ?? Math.max(col.label.length, Math.min(maxData, 50));
  });

  // Header
  const header = columns
    .map((col, i) => col.label.padEnd(widths[i]))
    .join("  ");
  console.log(header);
  console.log(widths.map((w) => "─".repeat(w)).join("──"));

  // Rows
  for (const row of rows) {
    const line = columns
      .map((col, i) => {
        const val = String(row[col.key] ?? "—");
        return val.length > widths[i]
          ? val.slice(0, widths[i] - 1) + "…"
          : val.padEnd(widths[i]);
      })
      .join("  ");
    console.log(line);
  }

  console.log(`\n${rows.length} result${rows.length === 1 ? "" : "s"}`);
}

export function printError(message: string): void {
  console.error(`Error: ${message}`);
}

export function printSuccess(message: string): void {
  console.log(message);
}
