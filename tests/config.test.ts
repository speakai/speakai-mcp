import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// config.ts reads the home folder at import, so each test imports it fresh
// with HOME (and USERPROFILE, which Windows uses) pointed at a temp folder.
let home: string;
const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, SPEAK_API_KEY: process.env.SPEAK_API_KEY };

async function loadConfigModule() {
  vi.resetModules();
  return import("../src/cli/config.js");
}

function configFile(): string {
  return path.join(home, ".speakai", "config.json");
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "cli-config-test-"));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.SPEAK_API_KEY;
});

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  fs.rmSync(home, { recursive: true, force: true });
});

describe("cli config", () => {
  it.skipIf(process.platform === "win32")("makes an existing config file owner-only when a key is saved", async () => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), "{}\n", { mode: 0o644 });
    fs.chmodSync(configFile(), 0o644);
    const { saveConfig } = await loadConfigModule();

    saveConfig({ apiKey: "new-key" });

    expect(fs.statSync(configFile()).mode & 0o777).toBe(0o600);
    expect(JSON.parse(fs.readFileSync(configFile(), "utf-8"))).toEqual({ apiKey: "new-key" });
  });

  it.each(["null", "[]", "42", '"key"'])("treats a config file holding %s as empty", async (contents) => {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), contents);
    const { loadConfig, resolveApiKey, resolveBaseUrl } = await loadConfigModule();

    expect(loadConfig()).toEqual({});
    expect(resolveApiKey()).toBeUndefined();
    expect(resolveBaseUrl()).toBe(process.env.SPEAK_BASE_URL ?? "https://api.speakai.co");
  });
});
