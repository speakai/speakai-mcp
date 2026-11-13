/**
 * Fails when a derived surface drifts from the single source of truth.
 * Fix with: npx tsx scripts/sync-plugin.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { syncDerivedSurfaces } from "../scripts/sync-plugin.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("derived surfaces", () => {
  it("state the current version and tool count everywhere", () => {
    const { drifted, stale } = syncDerivedSurfaces(false);
    const problems = [
      ...drifted.map((f) => `  out of step: ${f}`),
      ...stale,
    ];
    expect(problems, `\n${problems.join("\n")}\n\nFix: npx tsx scripts/sync-plugin.ts\n`).toEqual([]);
  });
});

/**
 * Only the MCP endpoint accepts Bearer. The REST API takes `x-speakai-key` and
 * `x-access-token`, which is the path src/client.ts implements.
 */
describe("skill auth examples", () => {
  const SKILLS_DIR = path.join(ROOT, "plugins/speakai-mcp/skills");

  const skillFiles = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(SKILLS_DIR, e.name, "SKILL.md"));

  it.each(skillFiles.map((f) => [path.basename(path.dirname(f)), f]))(
    "%s authenticates REST calls with the API key alone",
    (_name, file) => {
      const offenders = readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, i) =>
          /x-access-token|\/v1\/auth\/(accessToken|refreshToken)/.test(line) ? [`  line ${i + 1}: ${line.trim()}`] : [],
        );

      expect(
        offenders,
        `\nThe API accepts the API key alone, in x-speakai-key or Authorization: Bearer.\n` +
          `Skills must not send agents through the old access-token exchange.\n` +
          offenders.join("\n") +
          "\n",
      ).toEqual([]);
    },
  );
});
