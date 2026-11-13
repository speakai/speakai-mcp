/**
 * Invariant test: `SPEAK_MCP_TOOL_NAMES` must match the exact set of tools
 * registered by `registerAllTools`. If a tool is added, removed, or renamed
 * in `src/tools/*.ts` without updating `src/tool-names.ts`, this test fails.
 *
 * Consumers (e.g. the API server's orchestrator bridge) depend on this manifest
 * as a single source of truth, so drift here is a release blocker.
 */
import { readFileSync } from "fs";
import { describe, it, expect, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";

type JsonSchema = Record<string, unknown>;

interface SchemaShape {
  type?: string[];
  enum?: string[];
  required?: string[];
  properties?: Record<string, SchemaShape>;
  items?: SchemaShape;
  values?: SchemaShape;
  anyOf?: SchemaShape[];
}

const SCHEMA_SNAPSHOT_PATH = new URL("./fixtures/tool-input-schemas-v1.json", import.meta.url);

const mockClient = {
  get: vi.fn().mockResolvedValue({ data: { data: {} } }),
  post: vi.fn().mockResolvedValue({ data: { data: {} } }),
  put: vi.fn().mockResolvedValue({ data: { data: {} } }),
  delete: vi.fn().mockResolvedValue({ data: { data: {} } }),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
} as any;

vi.mock("axios", () => ({
  default: {
    create: () => mockClient,
    isAxiosError: () => false,
    put: vi.fn().mockResolvedValue({}),
  },
}));

describe("SPEAK_MCP_TOOL_NAMES manifest", () => {
  it("matches the exact set of tools registered by registerAllTools", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");

    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, mockClient, { localFileAccess: true, voiceTestRuns: true, aiChat: true, automations: true, voiceTestRunDetails: true });

    const registered = Object.keys((server as any)._registeredTools).sort();
    const manifest = [...SPEAK_MCP_TOOL_NAMES].sort();

    expect(manifest).toEqual(registered);
  });

  it("has no duplicate entries", async () => {
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");
    const unique = new Set(SPEAK_MCP_TOOL_NAMES);
    expect(unique.size).toBe(SPEAK_MCP_TOOL_NAMES.length);
  });

  it("SPEAK_MCP_TOOL_CATEGORIES puts every tool in exactly one category", async () => {
    const { SPEAK_MCP_TOOL_NAMES } = await import("../src/tool-names.js");
    const { SPEAK_MCP_TOOL_CATEGORIES } = await import("../src/tool-categories.js");

    const categorized = SPEAK_MCP_TOOL_CATEGORIES.flatMap((c) => [...c.tools]);
    expect(new Set(categorized).size).toBe(categorized.length);
    expect([...categorized].sort()).toEqual([...SPEAK_MCP_TOOL_NAMES].sort());
    expect(SPEAK_MCP_TOOL_CATEGORIES.every((c) => c.id && c.name && c.tools.length > 0)).toBe(true);
  });
});

function resolveRef(node: JsonSchema, root: JsonSchema): JsonSchema {
  if (typeof node.$ref !== "string") return node;
  const target = node.$ref
    .replace(/^#\//, "")
    .split("/")
    .reduce<unknown>((at, key) => (at as JsonSchema | undefined)?.[key], root);
  return resolveRef(target as JsonSchema, root);
}

function isNever(node: JsonSchema): boolean {
  return typeof node.not === "object" && node.not !== null && Object.keys(node.not).length === 0;
}

function unionBranches(node: JsonSchema, root: JsonSchema): JsonSchema[] | undefined {
  const union = (node.anyOf ?? node.oneOf) as JsonSchema[] | undefined;
  return union
    ?.map((branch) => resolveRef(branch, root))
    .flatMap((branch) => unionBranches(branch, root) ?? [branch])
    .filter((branch) => !isNever(branch));
}

function isPlainBranch(node: JsonSchema): boolean {
  return Object.keys(node).every((key) => ["type", "const", "enum", "description"].includes(key));
}

function typesOf(node: JsonSchema): string[] {
  if (Array.isArray(node.type)) return node.type as string[];
  if (typeof node.type === "string") return [node.type];
  if ("const" in node) return [node.const === null ? "null" : typeof node.const === "number" ? "number" : typeof node.const];
  return [];
}

function valuesOf(node: JsonSchema): unknown[] {
  if (Array.isArray(node.enum)) return node.enum;
  if ("const" in node) return [node.const];
  return [];
}

function schemaShape(input: JsonSchema, root: JsonSchema = input): SchemaShape {
  const node = resolveRef(input, root);
  const shape: SchemaShape = {};
  const branches = unionBranches(node, root);
  const plainUnion = branches?.every(isPlainBranch) ?? false;
  const flat = plainUnion ? [node, ...branches!] : [node];

  const types = new Set(flat.flatMap(typesOf).map((type) => (type === "integer" ? "number" : type)));
  if (types.size) shape.type = [...types].sort();
  const values = flat.flatMap(valuesOf);
  if (values.length) shape.enum = values.map((value) => JSON.stringify(value)).sort();
  if (branches && !plainUnion) shape.anyOf = branches.map((branch) => schemaShape(branch, root));

  if (node.properties) {
    shape.properties = Object.fromEntries(
      Object.entries(node.properties as Record<string, JsonSchema>).map(([key, value]) => [key, schemaShape(value, root)])
    );
    shape.required = [...((node.required as string[] | undefined) ?? [])].sort();
  }
  if (node.items && typeof node.items === "object") shape.items = schemaShape(node.items as JsonSchema, root);
  if (node.additionalProperties === true) shape.values = {};
  if (node.additionalProperties && typeof node.additionalProperties === "object") {
    shape.values = schemaShape(node.additionalProperties as JsonSchema, root);
  }
  return shape;
}

describe("tool input schemas", () => {
  it("keep every field's type, enum values and required-ness from the v1 snapshot", async () => {
    const { registerAllTools } = await import("../src/tools/index.js");
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAllTools(server, mockClient, { localFileAccess: true, voiceTestRuns: true, aiChat: true, automations: true, voiceTestRunDetails: true });
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    await client.close();

    const snapshot = JSON.parse(readFileSync(SCHEMA_SNAPSHOT_PATH, "utf8")) as Record<string, SchemaShape>;
    const current = Object.fromEntries(tools.map((tool) => [tool.name, schemaShape(tool.inputSchema as JsonSchema)]));
    expect(current).toEqual(snapshot);
  });
});
