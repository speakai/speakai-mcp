/**
 * Fails when any derived surface drifts from the single source of truth.
 *
 * This exists because drift shipped repeatedly and silently: the agent plugin's
 * skill claimed 84 tools, the README and landing page claimed 107, the Codex
 * manifest sat at version 1.6.0, and the homepage said the automations and
 * webhooks card held 9 tools when it held 22. Nothing failed, because nothing
 * checked. tests/tools-coverage.test.ts pins the tool registry; this pins
 * everything that quotes it.
 *
 * Fix a failure with: npx tsx scripts/sync-plugin.ts
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("derived surfaces", () => {
  it("state the current version and tool count everywhere", () => {
    let output = "";
    let failed = false;

    try {
      output = execFileSync("npx", ["tsx", "scripts/sync-plugin.ts", "--check"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error: any) {
      failed = true;
      output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    }

    expect(failed, `\n${output}\n`).toBe(false);
  });
});

/**
 * Counts drifting is one failure mode. Instructions drifting is the other, and it
 * is worse: a stale number is embarrassing, a wrong auth header makes every call
 * an agent copies fail.
 *
 * Three skills shipped `Authorization: Bearer` against REST endpoints. Only the
 * MCP endpoint accepts Bearer. REST takes `x-speakai-key` plus `x-access-token`,
 * which is the only path src/client.ts implements. This pins that so a future
 * edit cannot reintroduce it.
 */
describe("skill auth examples", () => {
  const SKILLS_DIR = path.join(ROOT, "plugins/speakai-mcp/skills");

  const skillFiles = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(SKILLS_DIR, e.name, "SKILL.md"));

  it.each(skillFiles.map((f) => [path.basename(path.dirname(f)), f]))(
    "%s uses Bearer only against the MCP endpoint",
    (_name, file) => {
      const lines = readFileSync(file, "utf8").split("\n");
      const offenders: string[] = [];

      lines.forEach((line, i) => {
        if (!/Authorization:\s*Bearer/i.test(line)) return;
        // A curl header sits a line or two below its URL, so look back a little.
        const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (!context.includes("/v1/mcp")) {
          offenders.push(`  line ${i + 1}: ${line.trim()}`);
        }
      });

      expect(
        offenders,
        `\nBearer is only valid against https://api.speakai.co/v1/mcp.\n` +
          `The REST API takes x-speakai-key and x-access-token.\n` +
          offenders.join("\n") +
          "\n",
      ).toEqual([]);
    },
  );
});
