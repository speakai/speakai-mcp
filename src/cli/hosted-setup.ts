// The hosted connector signs people in through the browser, so init recommends it before the API key path.
import { existsSync } from "fs";
import { homedir } from "os";
import path from "path";

export const HOSTED_MCP_URL = "https://api.speakai.co/v1/mcp";

export type HostedClient = "claude-code" | "codex" | "cursor";

export const HOSTED_SETUP: Record<HostedClient, { name: string; steps: string[] }> = {
  "claude-code": {
    name: "Claude Code",
    steps: [
      `claude mcp add --transport http speakai ${HOSTED_MCP_URL}`,
      "claude mcp login speakai",
    ],
  },
  codex: {
    name: "Codex",
    steps: [
      `codex mcp add speakai --url ${HOSTED_MCP_URL}`,
      "codex mcp login speakai   (only if the browser sign-in did not open or finish)",
    ],
  },
  cursor: {
    name: "Cursor",
    steps: [
      `Add to ~/.cursor/mcp.json: { "mcpServers": { "speakai": { "url": "${HOSTED_MCP_URL}" } } }`,
      "Open Cursor Settings > Tools & MCP and click the login prompt next to speakai",
    ],
  },
};

const ORDER: HostedClient[] = ["claude-code", "codex", "cursor"];

function onPath(command: string, envPath: string): boolean {
  const exts = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  return envPath
    .split(path.delimiter)
    .filter(Boolean)
    .some((dir) => exts.some((ext) => existsSync(path.join(dir, command + ext))));
}

/** Clients found on this machine, by command on PATH or config folder in the home folder. */
export function detectHostedClients(
  home: string = homedir(),
  envPath: string = process.env.PATH ?? ""
): HostedClient[] {
  const found: Record<HostedClient, boolean> = {
    "claude-code": onPath("claude", envPath) || existsSync(path.join(home, ".claude")),
    codex: onPath("codex", envPath) || existsSync(path.join(home, ".codex")),
    cursor: existsSync(path.join(home, ".cursor")),
  };
  return ORDER.filter((c) => found[c]);
}

// With no client detected, list all three so the person still sees the command for their assistant.
export function hostedSetupText(detected: HostedClient[]): string {
  const clients = detected.length > 0 ? detected : ORDER;
  const lines = [
    "  Recommended: connect through the hosted connector.",
    "  Your browser opens Speak AI's sign-in page, where you can sign in or create",
    "  an account. No API key is needed.",
    "",
  ];
  if (detected.length === 0) {
    lines.push("  No AI assistant found on this machine. Pick yours:", "");
  }
  for (const c of clients) {
    lines.push(`  ${HOSTED_SETUP[c].name}:`);
    for (const step of HOSTED_SETUP[c].steps) lines.push(`    ${step}`);
    lines.push("");
  }
  lines.push(`  Any other assistant: add ${HOSTED_MCP_URL} as a remote MCP server.`);
  return lines.join("\n");
}
