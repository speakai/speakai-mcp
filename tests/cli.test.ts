import { describe, it, expect, vi } from "vitest";

// Mock axios before importing CLI
vi.mock("axios", () => {
  const instance = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  };
  return {
    default: { create: () => instance, isAxiosError: () => false },
    ...instance,
  };
});

describe("CLI Smoke Tests", () => {
  it("creates CLI program without errors", async () => {
    const { createCli } = await import("../src/cli/index.js");
    const program = createCli();
    expect(program).toBeDefined();
    expect(program.name()).toBe("speakai-mcp");
  });

  it("registers all expected commands", async () => {
    const { createCli } = await import("../src/cli/index.js");
    const program = createCli();

    const commandNames = program.commands.map((c) => c.name());

    const expectedCommands = [
      "config",
      "init",
      "list-media",
      "get-transcript",
      "get-insights",
      "upload",
      "export",
      "status",
      "create-text",
      "list-folders",
      "ask",
      "chat-history",
      "search",
      "clips",
      "clip",
      "delete",
      "update",
      "create-folder",
      "favorites",
      "stats",
      "languages",
      "captions",
      "reanalyze",
      "schedule-meeting",
    ];

    for (const name of expectedCommands) {
      expect(commandNames, `Missing CLI command: ${name}`).toContain(name);
    }
  });

  it("config has all subcommands", async () => {
    const { createCli } = await import("../src/cli/index.js");
    const program = createCli();

    const configCmd = program.commands.find((c) => c.name() === "config");
    expect(configCmd).toBeDefined();

    const subNames = configCmd!.commands.map((c) => c.name());
    expect(subNames).toContain("set-key");
    expect(subNames).toContain("show");
    expect(subNames).toContain("test");
    expect(subNames).toContain("set-url");
  });

  it("--help does not throw", async () => {
    const { createCli } = await import("../src/cli/index.js");
    const program = createCli();
    program.exitOverride(); // Prevent process.exit

    try {
      await program.parseAsync(["node", "speakai-mcp", "--help"]);
    } catch (err: any) {
      // Commander throws with code 'commander.helpDisplayed' — that's fine
      expect(err.code).toBe("commander.helpDisplayed");
    }
  });

  it("every command has a description", async () => {
    const { createCli } = await import("../src/cli/index.js");
    const program = createCli();

    for (const cmd of program.commands) {
      expect(cmd.description(), `Command ${cmd.name()} missing description`).toBeTruthy();
    }
  });

  it("exposes the generic tools + call commands", async () => {
    const { createCli } = await import("../src/cli/index.js");
    const names = createCli().commands.map((c) => c.name());
    expect(names).toContain("tools");
    expect(names).toContain("call");
  });

  // The CLI's `call <tool>` dispatches via the SAME registerAllTools used here,
  // so capturing the registered handlers proves `call` can reach every MCP tool.
  // This is what keeps the CLI 1:1 with the tool surface.
  it("call dispatcher covers every MCP tool (CLI is 1:1 with tools)", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");

    const handlers: Record<string, unknown> = {};
    const stub = {
      registerTool: (name: string, _def: unknown, cb: unknown) => {
        handlers[name] = cb;
        return {};
      },
    };
    registerAllTools(stub as any);

    expect(Object.keys(handlers).sort()).toEqual([...SPEAK_MCP_TOOL_NAMES].sort());
  });
});
