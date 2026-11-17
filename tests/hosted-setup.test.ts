import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { detectHostedClients, hostedSetupText, HOSTED_MCP_URL } from "../src/cli/hosted-setup.js";

const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(path.join(tmpdir(), "speakai-hosted-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("detectHostedClients", () => {
  it("finds nothing in an empty home with an empty PATH", () => {
    expect(detectHostedClients(tempDir(), "")).toEqual([]);
  });

  it("finds clients by config folder", () => {
    const home = tempDir();
    mkdirSync(path.join(home, ".codex"));
    mkdirSync(path.join(home, ".cursor"));
    expect(detectHostedClients(home, "")).toEqual(["codex", "cursor"]);
  });

  it.skipIf(process.platform === "win32")("finds Claude Code by command on PATH", () => {
    const bin = tempDir();
    writeFileSync(path.join(bin, "claude"), "#!/bin/sh\n");
    chmodSync(path.join(bin, "claude"), 0o755);
    expect(detectHostedClients(tempDir(), bin)).toEqual(["claude-code"]);
  });
});

describe("hostedSetupText", () => {
  it("shows only the detected client's commands", () => {
    const text = hostedSetupText(["codex"]);
    expect(text).toContain(`codex mcp add speakai --url ${HOSTED_MCP_URL}`);
    expect(text).toContain("codex mcp login speakai");
    expect(text).not.toContain("claude mcp add");
    expect(text).not.toContain("Cursor:");
  });

  it("shows the Claude Code add and login commands", () => {
    const text = hostedSetupText(["claude-code"]);
    expect(text).toContain(`claude mcp add --transport http speakai ${HOSTED_MCP_URL}`);
    expect(text).toContain("claude mcp login speakai");
  });

  it("lists every client when none is detected", () => {
    const text = hostedSetupText([]);
    expect(text).toContain("No AI assistant found");
    expect(text).toContain("Claude Code:");
    expect(text).toContain("Codex:");
    expect(text).toContain("Cursor:");
  });

  it("never asks for an API key in the hosted text", () => {
    expect(hostedSetupText([])).not.toMatch(/SPEAK_API_KEY|Bearer/);
  });
});
