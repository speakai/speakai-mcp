import fs from "fs";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".speakai");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

interface SpeakConfig {
  apiKey?: string;
  baseUrl?: string;
}

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): SpeakConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch {
    // Corrupted config — start fresh
  }
  return {};
}

export function saveConfig(config: SpeakConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", {
    mode: 0o600, // Owner read/write only
  });
}

/**
 * Resolve API key: env var > config file.
 * Sets process.env.SPEAK_API_KEY so the client module picks it up.
 */
export function resolveApiKey(): string | undefined {
  if (process.env.SPEAK_API_KEY) return process.env.SPEAK_API_KEY;

  const config = loadConfig();
  if (config.apiKey) {
    process.env.SPEAK_API_KEY = config.apiKey;
    return config.apiKey;
  }

  return undefined;
}

export function resolveBaseUrl(): string {
  if (process.env.SPEAK_BASE_URL) return process.env.SPEAK_BASE_URL;

  const config = loadConfig();
  if (config.baseUrl) {
    process.env.SPEAK_BASE_URL = config.baseUrl;
    return config.baseUrl;
  }

  return "https://api.speakai.co";
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
