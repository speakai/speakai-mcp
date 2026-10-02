/**
 * Build the ZIP uploaded to OpenAI's plugin portal (platform.openai.com/plugins)
 * from plugins/speakai-mcp.
 *
 * OpenAI reads the package identity from the root plugin.json, and an update must
 * keep the name OpenAI assigned to the existing listing. Everything else in the
 * repo keeps "speakai-mcp" (the Claude and Codex manifests and both marketplaces),
 * so only the ZIP's root plugin.json name is swapped. verify-plugin runs first.
 *
 *   npx tsx scripts/build-openai-zip.ts
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import os from "os";
import path from "path";
import { OPENAI_PLUGIN_NAME } from "./openai-plugin.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN = path.join(ROOT, "plugins/speakai-mcp");
const OUT_DIR = path.join(ROOT, ".openai-package");
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

execFileSync(NPX, ["tsx", "scripts/verify-plugin.ts"], { cwd: ROOT, stdio: "inherit" });

const staging = mkdtempSync(path.join(os.tmpdir(), "speakai-openai-"));
try {
  const pkg = path.join(staging, "plugin");
  cpSync(PLUGIN, pkg, { recursive: true, filter: (src) => path.basename(src) !== ".DS_Store" });

  const manifestPath = path.join(pkg, "plugin.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.name = OPENAI_PLUGIN_NAME;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  mkdirSync(OUT_DIR, { recursive: true });
  const zip = path.join(OUT_DIR, `speakai-mcp-openai-${manifest.version}.zip`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-qrX", zip, "."], { cwd: pkg });

  console.log(`\nOpenAI plugin ZIP: ${path.relative(ROOT, zip)}`);
  console.log(`  name    ${manifest.name}`);
  console.log(`  version ${manifest.version}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
