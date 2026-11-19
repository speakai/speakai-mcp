import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DIST_ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));

// config.ts reads os.homedir() once at load (HOME, or USERPROFILE on Windows), so point both at a temp folder first.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cli-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
const CONFIG_FILE = path.join(TEST_HOME, ".speakai", "config.json");
const FAKE_KEY = "fakekey1-0000-1111-2222-333344445555";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  s3Put: vi.fn(),
}));

// speakClient is axios.create(), so every CLI request lands on `api`; axios.put is the S3 upload.
vi.mock("axios", () => {
  const instance = {
    get: api.get,
    post: api.post,
    put: api.put,
    delete: api.delete,
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  };
  return { default: { create: () => instance, isAxiosError: () => false, put: api.s3Put } };
});

class ExitCalled extends Error {
  constructor(readonly code: number | undefined) {
    super(`process.exit(${code})`);
  }
}

let stdout: string[];
let stderr: string[];
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fs.rmSync(path.join(TEST_HOME, ".speakai"), { recursive: true, force: true });
  delete process.env.SPEAK_API_KEY;
  delete process.env.SPEAK_BASE_URL;
  for (const fn of [api.get, api.post, api.put, api.delete, api.s3Put]) fn.mockReset();
  stdout = [];
  stderr = [];
  vi.spyOn(console, "log").mockImplementation((...args) => void stdout.push(args.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args) => void stderr.push(args.join(" ")));
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new ExitCalled(code);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Run one CLI command in-process. Returns the first exit code (undefined when it finished normally). */
async function run(...args: string[]): Promise<number | undefined> {
  const { createCli } = await import("../src/cli/index.js");
  const program = createCli();
  program.exitOverride();
  try {
    await program.parseAsync(["node", "speakai-mcp", ...args]);
  } catch (err) {
    if (!(err instanceof ExitCalled)) throw err;
  }
  return exitSpy.mock.calls[0]?.[0] as number | undefined;
}

describe("config file", () => {
  it("saves the API key owner-only (0600) and loads it back", async () => {
    const { saveConfig, loadConfig } = await import("../src/cli/config.js");

    saveConfig({ apiKey: FAKE_KEY, baseUrl: "https://eu.example.test" });

    expect(os.homedir()).toBe(TEST_HOME);
    // Windows has no POSIX owner-only mode; access there follows the profile folder's ACL.
    if (process.platform !== "win32") expect(fs.statSync(CONFIG_FILE).mode & 0o777).toBe(0o600);
    expect(loadConfig()).toEqual({ apiKey: FAKE_KEY, baseUrl: "https://eu.example.test" });
  });

  it("treats a corrupt config file as empty instead of crashing", async () => {
    const { loadConfig, resolveApiKey } = await import("../src/cli/config.js");
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, "{ not json");

    expect(loadConfig()).toEqual({});
    expect(resolveApiKey()).toBeUndefined();
  });

  it("prefers SPEAK_API_KEY and SPEAK_BASE_URL over the saved file", async () => {
    const { saveConfig, resolveApiKey, resolveBaseUrl } = await import("../src/cli/config.js");
    saveConfig({ apiKey: "file-key", baseUrl: "https://file.example.test" });
    process.env.SPEAK_API_KEY = "env-key";
    process.env.SPEAK_BASE_URL = "https://env.example.test";

    expect(resolveApiKey()).toBe("env-key");
    expect(resolveBaseUrl()).toBe("https://env.example.test");
  });

  it("falls back to the saved file and exports it for the API client", async () => {
    const { saveConfig, resolveApiKey, resolveBaseUrl } = await import("../src/cli/config.js");
    saveConfig({ apiKey: "file-key" });

    expect(resolveApiKey()).toBe("file-key");
    expect(process.env.SPEAK_API_KEY).toBe("file-key");
    expect(resolveBaseUrl()).toBe("https://api.speakai.co");
  });

  it("config set-key keeps the base URL already saved, and config show never prints the full key", async () => {
    const { saveConfig, loadConfig } = await import("../src/cli/config.js");
    saveConfig({ baseUrl: "https://eu.example.test" });

    expect(await run("config", "set-key", FAKE_KEY)).toBeUndefined();
    expect(loadConfig()).toEqual({ baseUrl: "https://eu.example.test", apiKey: FAKE_KEY });

    stdout = [];
    await run("config", "show");
    const shown = stdout.join("\n");
    expect(shown).toContain(`${FAKE_KEY.slice(0, 8)}...`);
    expect(shown).not.toContain(FAKE_KEY.slice(8));
  });
});

describe("commands", () => {
  it("refuses to run an API command with no key, before any request", async () => {
    expect(await run("delete", "media-1")).toBe(1);

    expect(stderr.join("\n")).toContain("No API key configured");
    expect(api.delete).not.toHaveBeenCalled();
  });

  it("exits 1 and prints the API's message when a request fails", async () => {
    process.env.SPEAK_API_KEY = "test-key";
    api.delete.mockRejectedValue({ response: { data: { message: "Media not found" } } });

    expect(await run("delete", "media-1")).toBe(1);

    expect(api.delete).toHaveBeenCalledWith("/v1/media/media-1");
    expect(stderr).toEqual(["Error: Media not found"]);
    expect(stdout.join("\n")).not.toContain("Deleted");
  });

  describe("upload", () => {
    let file: string;

    beforeEach(() => {
      process.env.SPEAK_API_KEY = "test-key";
      file = path.join(TEST_HOME, "team call.mp4");
      fs.writeFileSync(file, "fake video bytes");
    });

    it("uploads a local file through a signed URL and stores the URL without its signature", async () => {
      const signedUrl = "https://bucket.s3.example.test/video/team%20call.mp4?X-Amz-Signature=abc";
      api.get.mockResolvedValue({ data: { data: { signedUrl } } });
      api.s3Put.mockResolvedValue({});
      api.post.mockResolvedValue({ data: { data: { mediaId: "m-42", state: "pending" } } });

      expect(await run("upload", file, "--folder", "f-1")).toBeUndefined();

      expect(api.get).toHaveBeenCalledWith("/v1/media/upload/signedurl", {
        params: { mediaType: "video", filename: "team call.mp4", mimeType: "video/mp4" },
      });
      expect(api.s3Put).toHaveBeenCalledTimes(1);
      const [putUrl, body, putConfig] = api.s3Put.mock.calls[0];
      expect(putUrl).toBe(signedUrl);
      expect(Buffer.from(body).toString()).toBe("fake video bytes");
      expect(putConfig.headers).toEqual({ "Content-Type": "video/mp4" });
      expect(api.post).toHaveBeenCalledWith("/v1/media/upload", {
        name: "team call.mp4",
        url: "https://bucket.s3.example.test/video/team%20call.mp4",
        mediaType: "video",
        sourceLanguage: "en-US",
        folderId: "f-1",
      });
      expect(stdout).toContain("Uploaded: m-42 (state: pending)");
    });

    it("stops before uploading when no signed URL comes back", async () => {
      api.get.mockResolvedValue({ data: { data: {} } });

      expect(await run("upload", file)).toBe(1);

      expect(stderr[0]).toBe("Error: Could not get signed upload URL");
      expect(api.s3Put).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
    });

    it("sends a remote URL as is and names it after the file, without the query string", async () => {
      api.post.mockResolvedValue({ data: { data: { mediaId: "m-7", state: "pending" } } });

      await run("upload", "https://cdn.example.test/calls/standup.mp3?token=xyz", "--type", "audio");

      expect(api.s3Put).not.toHaveBeenCalled();
      expect(api.post).toHaveBeenCalledWith("/v1/media/upload", {
        name: "standup.mp3",
        url: "https://cdn.example.test/calls/standup.mp3?token=xyz",
        mediaType: "audio",
        sourceLanguage: "en-US",
      });
    });
  });

  describe("call", () => {
    beforeEach(() => {
      process.env.SPEAK_API_KEY = "test-key";
    });

    it("runs the named tool with the JSON arguments and prints its data", async () => {
      api.get.mockResolvedValue({ data: { data: { mediaId: "m-1", state: "processed" } } });

      expect(await run("call", "get_media_status", '{"mediaId":"m-1"}')).toBeUndefined();

      expect(api.get).toHaveBeenCalledWith("/v1/media/status/m-1");
      expect(JSON.parse(stdout.join("\n"))).toEqual({ data: { mediaId: "m-1", state: "processed" } });
    });

    it.each([
      ["invalid JSON", ["get_media_status", "{mediaId:"], "Invalid JSON arguments"],
      ["an unknown tool", ["no_such_tool"], 'Unknown tool "no_such_tool"'],
    ])("exits 1 on %s without calling the API", async (_case, args, message) => {
      expect(await run("call", ...args)).toBe(1);

      expect(stderr.join("\n")).toContain(message);
      expect(api.get).not.toHaveBeenCalled();
    });

    it("exits 1 with the tool's error text when the tool fails", async () => {
      api.get.mockRejectedValue(new Error("socket hang up"));

      expect(await run("call", "get_media_status", '{"mediaId":"m-1"}')).toBe(1);

      expect(stderr.join("\n")).toContain("socket hang up");
      expect(stdout).toEqual([]);
    });
  });
});

function runNode(args: string[], stdinLine?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env: { ...process.env, SPEAK_API_KEY: "test-key" }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
      if (stdinLine && out.includes("\n")) child.kill();
    });
    child.stderr.on("data", (chunk) => (err += chunk));
    if (stdinLine) child.stdin.write(stdinLine + "\n");
    const timer = setTimeout(() => child.kill(), 10_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: out, stderr: err });
    });
  });
}

// These run the built package (CI builds before testing); run `npm run build` first locally.
describe("package entry", () => {
  it("importing the built package leaves stdin and stdout alone and lets the host exit", async () => {
    const script = `require(${JSON.stringify(DIST_ENTRY)}); setImmediate(() => console.error("loaded"));`;
    const result = await runNode(["-e", script]);

    expect(result.code).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("loaded");
    expect(result.stderr).not.toContain("Server started");
  });

  it("running the built package as the bin still serves MCP over stdio", async () => {
    const initialize = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    });
    const result = await runNode([DIST_ENTRY], initialize);

    expect(JSON.parse(result.stdout.split("\n")[0]).result.protocolVersion).toBe("2025-06-18");
  });
});
