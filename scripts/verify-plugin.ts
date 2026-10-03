/**
 * Pre-ship checks for plugins/speakai-mcp (Claude) and plugins/speakai-mcp-portable
 * (Agent Plugins, Codex and OpenAI).
 *
 * Validates the portable manifests against the Agent Plugins 1.0.0 schemas, every
 * SKILL.md against the Agent Skills specification, the tool names the skills
 * reference against tools.json, the OpenAI directory limits, and that the Claude
 * folder holds only what Claude's directory reads.
 *
 *   npx tsx scripts/verify-plugin.ts          # static checks
 *   npx tsx scripts/verify-plugin.ts --live   # also probe the remote endpoint
 */
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";
import {
  OPENAI_PLUGIN_NAME, OPENAI_NAME_FORMAT, OPENAI_SKILL_IDENTITY_MAX, OPENAI_DESCRIPTION_MAX,
  OPENAI_LISTING_LIMITS, OPENAI_SINGLE_LINE_FIELDS, OPENAI_LISTING_URLS, OPENAI_URL_MAX,
  OPENAI_MAX_PROMPTS, OPENAI_PROMPT_MAX, OPENAI_MAX_CAPABILITIES, OPENAI_CAPABILITY_MAX,
  OPENAI_ICON_FIELDS, OPENAI_ICON_MIN_PX, OPENAI_ICON_MAX_PX, OPENAI_IMAGE_MAX_BYTES,
  OPENAI_BRAND_CONTRAST_MIN, OPENAI_DARK_SURFACE,
} from "./openai-plugin.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** npx resolves to npx.cmd on Windows, which execFile will not find. */
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const PLUGIN = path.join(ROOT, "plugins/speakai-mcp-portable");
const CLAUDE_PLUGIN = path.join(ROOT, "plugins/speakai-mcp");
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
const readClaude = (rel: string) => readFileSync(path.join(CLAUDE_PLUGIN, rel), "utf8");
const jsonClaude = (rel: string) => JSON.parse(readClaude(rel));

/** Every file under a folder, as forward-slash paths relative to it. */
const listFiles = (dir: string, prefix = ""): string[] =>
  readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap((e) => {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    return e.isDirectory() ? listFiles(dir, rel) : [rel];
  });

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
  const keys = [...readClaude(".mcp.json").matchAll(/\$\{user_config\.([a-z0-9_]+)\}/gi)].map((m) => m[1]);
  if (!keys.length) return null;
  const d = jsonClaude(".claude-plugin/plugin.json");
  if (d.mcpServers !== "./.mcp.json") return null;
  const unfilled = keys.filter((k) => !Object.keys(d.userConfig ?? {}).includes(k));
  return unfilled.length ? `.claude-plugin/plugin.json declares no userConfig for ${unfilled.join(", ")}` : null;
});

/* ------------------------------------------------ Claude plugin folder ---- */

// Claude's directory scans every file in the plugin folder and raises a note or
// warning for anything Claude doesn't read, so the folder holds only these.
const CLAUDE_ALLOWED = [
  /^\.claude-plugin\/plugin\.json$/,
  /^\.mcp\.json$/,
  /^README\.md$/,
  /^assets\/icon\.png$/,
  /^skills\/[a-z0-9-]+\/SKILL\.md$/,
];

check("the Claude plugin folder holds only files Claude reads", () => {
  const extra = listFiles(CLAUDE_PLUGIN).filter((f) => !CLAUDE_ALLOWED.some((re) => re.test(f)));
  return extra.length ? `move to plugins/speakai-mcp-portable: ${extra.join(", ")}` : null;
});

check("the Claude manifest carries every directory listing field", () => {
  const d = jsonClaude(".claude-plugin/plugin.json");
  const problems: string[] = [];
  if (!d.icon || !existsSync(path.join(CLAUDE_PLUGIN, d.icon))) problems.push(`icon ${d.icon} not found`);
  for (const field of ["homepage", "documentationUrl", "supportUrl", "privacyPolicyUrl", "termsOfServiceUrl"]) {
    if (!/^https:\/\/\S+$/.test(d[field] ?? "")) problems.push(`${field} must be an HTTPS URL`);
  }
  if (d.mcpServers !== "./.mcp.json") problems.push(`mcpServers should be "./.mcp.json"`);
  return problems.length ? problems.join("; ") : null;
});

check("Claude connects only to the remote endpoint the portable package uses", () => {
  const servers = Object.entries<any>(jsonClaude(".mcp.json").mcpServers ?? {});
  const portableUrl = json("mcp.json").mcpServers.speakai.url;
  const bad = servers.filter(([, s]) => s.type !== "http" || s.url !== portableUrl || s.command || s.headers);
  return bad.length ? `servers must be { type: "http", url: "${portableUrl}" }: ${bad.map(([id]) => id).join(", ")}` : null;
});

check("the Claude README is long enough and names no bundled image in code", () => {
  const text = readClaude("README.md");
  const prose = text.replace(/```[\s\S]*?```/g, "");
  const words = prose.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
  const code = [...text.matchAll(/```[\s\S]*?```|`[^`\n]+`/g)].map((m) => m[0]).join("\n");
  const named = code.match(/[\w./-]+\.(png|jpe?g|gif|webp|svg|ico|ttf|otf|woff2?)\b/gi) ?? [];
  const problems: string[] = [];
  if (words < 40) problems.push(`${words} words outside code blocks, the directory needs 40`);
  if (named.length) problems.push(`image or font paths in code: ${named.join(", ")}`);
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

/* ------------------------------------------- OpenAI plugin directory ---- */

const openai = () => json("plugin.json").extensions?.["com.openai"] ?? {};

check("OpenAI listing meets the directory's submission limits", () => {
  const root = json("plugin.json");
  const ext = openai();
  const i = ext.interface ?? {};
  const problems: string[] = [];
  if ((root.description ?? "").length > OPENAI_DESCRIPTION_MAX) problems.push(`description over ${OPENAI_DESCRIPTION_MAX}`);
  if (!root.author?.name) problems.push("author.name missing");
  for (const [field, max] of Object.entries(OPENAI_LISTING_LIMITS)) {
    const v = i[field];
    if (typeof v !== "string" || !v.trim()) problems.push(`interface.${field} missing`);
    else if (v.length > max) problems.push(`interface.${field} is ${v.length} chars, limit ${max}`);
  }
  for (const field of OPENAI_SINGLE_LINE_FIELDS) {
    if (/[\r\n]/.test(i[field] ?? "")) problems.push(`interface.${field} must be one line`);
  }
  if (!i.category) problems.push("interface.category missing");
  for (const field of OPENAI_LISTING_URLS) {
    const v = i[field] ?? "";
    if (!/^https:\/\/[^\s@]+$/.test(v) || v.length > OPENAI_URL_MAX) problems.push(`interface.${field} must be an HTTPS URL`);
  }
  const caps: string[] = i.capabilities ?? [];
  if (caps.length > OPENAI_MAX_CAPABILITIES) problems.push(`more than ${OPENAI_MAX_CAPABILITIES} capabilities`);
  if (caps.some((c) => !c.trim() || /[\r\n]/.test(c) || c.length > OPENAI_CAPABILITY_MAX)) problems.push("a capability is empty, multi-line or too long");
  const prompts: string[] = [i.defaultPrompt ?? []].flat();
  const normalized = prompts.map((p) => p.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase());
  if (prompts.length > OPENAI_MAX_PROMPTS) problems.push(`more than ${OPENAI_MAX_PROMPTS} starter prompts`);
  if (prompts.some((p) => !p.trim() || /[\r\n@]/.test(p) || p.length > OPENAI_PROMPT_MAX)) problems.push("a starter prompt is empty, multi-line, mentions @ or is too long");
  if (new Set(normalized).size !== normalized.length) problems.push("starter prompts are not unique");
  if ("apps" in ext || "hooks" in ext) problems.push("apps and hooks cannot be submitted");
  if (ext.onboardingSkill && !existsSync(path.join(PLUGIN, ext.onboardingSkill))) problems.push("onboardingSkill path missing");
  return problems.length ? problems.join("; ") : null;
});

/** Width and height of a PNG from its IHDR chunk, or null for any other format. */
const pngSize = (file: string): [number, number] | null => {
  const b = readFileSync(file);
  return b.subarray(1, 4).toString() === "PNG" ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null;
};

check("OpenAI icons and logos are square images within the size limits", () => {
  const i = openai().interface ?? {};
  const problems: string[] = [];
  for (const field of OPENAI_ICON_FIELDS) {
    const rel = i[field];
    if (!rel) {
      if (field === "logo" || field === "composerIcon") problems.push(`interface.${field} missing`);
      continue;
    }
    const file = path.join(PLUGIN, rel);
    if (!rel.startsWith("./") || !existsSync(file)) { problems.push(`${field}: ${rel} not found`); continue; }
    if (statSync(file).size > OPENAI_IMAGE_MAX_BYTES) problems.push(`${field} is over 5 MiB`);
    const size = pngSize(file);
    if (!size) { problems.push(`${field} must be a PNG for this check`); continue; }
    const [w, h] = size;
    if (w !== h || w < OPENAI_ICON_MIN_PX || w > OPENAI_ICON_MAX_PX) problems.push(`${field} is ${w}x${h}`);
  }
  return problems.length ? problems.join("; ") : null;
});

/** WCAG contrast ratio between two #RRGGBB colors. */
const contrast = (a: string, b: string) => {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

check("OpenAI brand colors meet the contrast minimum", () => {
  const i = openai().interface ?? {};
  const problems: string[] = [];
  for (const [field, surface] of [["brandColor", "#FFFFFF"], ["brandColorDark", OPENAI_DARK_SURFACE]] as const) {
    const v = i[field];
    if (!v) continue;
    if (!/^#[0-9A-Fa-f]{6}$/.test(v)) problems.push(`${field} must be #RRGGBB`);
    else if (contrast(v, surface) < OPENAI_BRAND_CONTRAST_MIN) problems.push(`${field} contrast ${contrast(v, surface).toFixed(2)} below ${OPENAI_BRAND_CONTRAST_MIN}:1`);
  }
  return problems.length ? problems.join("; ") : null;
});

check("skill identities fit under the OpenAI plugin name", () => {
  if (!OPENAI_NAME_FORMAT.test(OPENAI_PLUGIN_NAME)) return `OPENAI_PLUGIN_NAME "${OPENAI_PLUGIN_NAME}" has an unsupported format`;
  const long = skillDirs
    .map((d) => `${OPENAI_PLUGIN_NAME}:${d}`)
    .filter((id) => id.length > OPENAI_SKILL_IDENTITY_MAX);
  return long.length ? `over ${OPENAI_SKILL_IDENTITY_MAX} chars: ${long.join(", ")}` : null;
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
