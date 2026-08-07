/**
 * Pre-ship checks for plugins/speakai-mcp.
 *
 * Validates both manifests against the Agent Plugins 1.0.0 schemas, every
 * SKILL.md against the Agent Skills specification, and the tool names the skills
 * reference against tools.json.
 *
 *   npx tsx scripts/verify-plugin.ts          # static checks
 *   npx tsx scripts/verify-plugin.ts --live   # also probe the remote endpoint
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** npx resolves to npx.cmd on Windows, which execFile will not find. */
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const PLUGIN = path.join(ROOT, "plugins/speakai-mcp");
const LIVE = process.argv.includes("--live");

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, fn: () => string | null) => {
  try {
    const problem = fn();
    results.push({ name, ok: !problem, detail: problem ?? "ok" });
  } catch (error: any) {
    results.push({ name, ok: false, detail: error.message });
  }
};

const read = (rel: string) => readFileSync(path.join(PLUGIN, rel), "utf8");
const json = (rel: string) => JSON.parse(read(rel));

/* ------------------------------------------------- Agent Plugins 1.0.0 ---- */

check("plugin.json matches the Agent Plugins schema", () => {
  const d = json("plugin.json");
  const allowed = [
    "$schema", "name", "version", "description", "author",
    "homepage", "repository", "license", "keywords", "extensions",
  ];
  if (d.$schema !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") {
    return "wrong $schema constant";
  }
  const extra = Object.keys(d).filter((k) => !allowed.includes(k));
  if (extra.length) return `top-level fields not permitted: ${extra.join(", ")}`;
  if (!/^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(d.name) || d.name.length > 64) {
    return `name "${d.name}" does not match the required pattern`;
  }
  if (d.author) {
    const bad = Object.keys(d.author).filter((k) => !["name", "email", "url"].includes(k));
    if (bad.length) return `author has fields not permitted: ${bad.join(", ")}`;
  }
  return null;
});

check("mcp.json matches the Agent Plugins schema", () => {
  const d = json("mcp.json");
  if (d.$schema !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") {
    return "wrong $schema constant";
  }
  const extra = Object.keys(d).filter((k) => !["$schema", "mcpServers"].includes(k));
  if (extra.length) return `top-level fields not permitted: ${extra.join(", ")}`;
  for (const [id, s] of Object.entries<any>(d.mcpServers)) {
    if (s.type === "stdio") {
      const bad = Object.keys(s).filter((k) => !["type", "command", "args", "env", "cwd"].includes(k));
      if (bad.length) return `server "${id}" has fields not permitted: ${bad.join(", ")}`;
      if (s.env && ("PLUGIN_ROOT" in s.env || "PLUGIN_DATA" in s.env)) {
        return `server "${id}" env must not define PLUGIN_ROOT or PLUGIN_DATA`;
      }
    } else if (s.type === "streamable-http" || s.type === "sse") {
      const bad = Object.keys(s).filter((k) => !["type", "url", "headers"].includes(k));
      if (bad.length) return `server "${id}" has fields not permitted: ${bad.join(", ")}`;
      if (!/^https:\/\//.test(s.url)) return `server "${id}" url must be HTTPS`;
      if (s.url.includes("#") || s.url.includes("@")) {
        return `server "${id}" url must not carry a fragment or user info`;
      }
    } else {
      return `server "${id}" has unknown type "${s.type}"`;
    }
  }
  return null;
});

check("mcp.json carries no unresolvable placeholder", () => {
  // Only ${PLUGIN_ROOT} and ${PLUGIN_DATA} expand. Anything else, notably a
  // client-native ${user_config.*}, reaches the server as a literal string.
  const found = [...read("mcp.json").matchAll(/\$\{([^}]+)\}/g)].map((m) => m[1]);
  const bad = found.filter((v) => !/^PLUGIN_(ROOT|DATA)(\/.*)?$/.test(v));
  return bad.length ? `placeholders no client will expand: ${bad.join(", ")}` : null;
});

check("every client-native placeholder has a manifest that fills it", () => {
  // .mcp.json interpolates ${user_config.*}, which is filled from a userConfig
  // block. A manifest pointing at it without one leaves the value unresolved.
  const keys = [...read(".mcp.json").matchAll(/\$\{user_config\.([a-z0-9_]+)\}/gi)].map((m) => m[1]);
  if (!keys.length) return null;

  const problems: string[] = [];
  for (const manifest of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    let d: any;
    try {
      d = json(manifest);
    } catch {
      continue;
    }
    if (d.mcpServers !== "./.mcp.json") continue;
    const declared = Object.keys(d.userConfig ?? {});
    const unfilled = keys.filter((k) => !declared.includes(k));
    if (unfilled.length) {
      problems.push(`${manifest} uses .mcp.json but declares no userConfig for ${unfilled.join(", ")}`);
    }
  }
  return problems.length ? problems.join("; ") : null;
});

/* --------------------------------------------------- Agent Skills spec ---- */

const skillDirs = readdirSync(path.join(PLUGIN, "skills"), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

check("at least one component type is present", () =>
  skillDirs.length || existsSync(path.join(PLUGIN, "mcp.json")) ? null : "no skills and no mcp.json",
);

for (const dir of skillDirs) {
  check(`skill "${dir}" conforms to the Agent Skills spec`, () => {
    const text = read(`skills/${dir}/SKILL.md`);
    const fm = text.split("---")[1];
    if (!fm) return "no YAML frontmatter";

    const allowed = ["name", "description", "license", "compatibility", "metadata", "allowed-tools"];
    const keys = [...fm.matchAll(/^([a-zA-Z-]+):/gm)].map((m) => m[1]);
    const extra = keys.filter((k) => !allowed.includes(k));
    if (extra.length) return `frontmatter keys not permitted: ${extra.join(", ")}`;

    const name = fm.match(/^name:\s*(\S+)/m)?.[1];
    if (name !== dir) return `name "${name}" does not match directory "${dir}"`;
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      return `name "${name}" does not match the required pattern`;
    }

    const desc = fm.match(/^description:\s*(.+)$/m)?.[1] ?? "";
    if (!desc.length) return "description is empty";
    if (desc.length > 1024) return `description is ${desc.length} characters, max 1024`;

    // metadata takes string values only, so no nested mapping.
    if (/^metadata:\n(?:[ ]{2}\S.*\n)*?[ ]{4}\S/m.test(fm)) {
      return "metadata contains a nested object; values must be strings";
    }

    const lines = text.split("\n").length;
    if (lines > 500) return `${lines} lines, keep SKILL.md under 500`;
    return null;
  });
}

/* ------------------------------------------------- factual correctness ---- */

// Only the MCP endpoint accepts Bearer. REST uses x-speakai-key and
// x-access-token, which is the path src/client.ts implements.
check("Bearer is used only against the MCP endpoint", () => {
  const offenders: string[] = [];
  for (const dir of skillDirs) {
    const lines = read(`skills/${dir}/SKILL.md`).split("\n");
    lines.forEach((line, i) => {
      if (!/Authorization:\s*Bearer/i.test(line)) return;
      const context = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      if (!context.includes("/v1/mcp")) offenders.push(`${dir}/SKILL.md:${i + 1}`);
    });
  }
  return offenders.length
    ? `REST takes x-speakai-key and x-access-token, not Bearer: ${offenders.join(", ")}`
    : null;
});

check("every tool named in a skill exists", () => {
  const known = new Set<string>(
    JSON.parse(readFileSync(path.join(ROOT, "tools.json"), "utf8")).categories.flatMap(
      (c: { tools: { name: string }[] }) => c.tools.map((t) => t.name),
    ),
  );
  const missing = new Set<string>();
  for (const dir of skillDirs) {
    const text = read(`skills/${dir}/SKILL.md`);
    // Tool names appear in backticks and are snake_case with a verb prefix.
    for (const m of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) {
      const token = m[1];
      if (!known.has(token) && /^(get|list|create|update|delete|search|export|upload|toggle|bulk|run|build|ask|retry|submit|schedule|remove|provision|reanalyze|clone|check|generate|duplicate|share|add)_/.test(token)) {
        missing.add(token);
      }
    }
  }
  return missing.size ? `not registered tools: ${[...missing].join(", ")}` : null;
});

check("derived surfaces are in sync", () => {
  try {
    execFileSync(NPX, ["tsx", "scripts/sync-plugin.ts", "--check"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return null;
  } catch (error: any) {
    return `${error.stdout ?? ""}${error.stderr ?? ""}`.trim().split("\n")[0];
  }
});

/* -------------------------------------------------------------- live ------ */

if (LIVE) {
  const url = json("mcp.json").mcpServers.speakai.url;

  check("the remote endpoint is reachable and requires auth", () => {
    const out = execFileSync(
      "curl",
      ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST", url,
       "-H", "Content-Type: application/json",
       "-H", "Accept: application/json, text/event-stream",
       "-d", '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'],
      { encoding: "utf8" },
    ).trim();
    return out === "401" ? null : `expected 401 from an unauthenticated probe, got ${out}`;
  });

  check("the 401 advertises OAuth resource metadata", () => {
    const headers = execFileSync(
      "curl",
      ["-s", "-D", "-", "-o", "/dev/null", "-X", "POST", url,
       "-H", "Content-Type: application/json",
       "-d", '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'],
      { encoding: "utf8" },
    );
    return /www-authenticate:.*resource_metadata=/i.test(headers)
      ? null
      : "no www-authenticate resource_metadata header, so clients cannot discover the auth server";
  });
}

/* ------------------------------------------------------------- report ----- */

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.name}`);
  if (!r.ok) {
    console.log(`      ${r.detail}`);
    failed++;
  }
}
console.log(
  `\n${results.length - failed}/${results.length} checks passed` +
    (LIVE ? " (including live endpoint probes)." : ". Add --live to probe the remote endpoint."),
);
process.exit(failed ? 1 : 0);
