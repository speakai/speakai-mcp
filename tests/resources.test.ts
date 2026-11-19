/**
 * Tests for src/resources.ts, read through a real MCP client so URI templates are matched as hosts do.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";

const mockGet = vi.fn();

const mockClient = {
  get: mockGet,
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  },
} as any;

vi.mock("axios", () => ({
  default: {
    create: () => mockClient,
    isAxiosError: () => false,
  },
}));

const RESOURCES = [
  {
    uri: "speakai://media",
    label: "media-library",
    request: ["/v1/media", { params: { page: 0, pageSize: 50, sortBy: "createdAt:desc", filterMedia: 2 } }],
  },
  {
    uri: "speakai://folders",
    label: "folders",
    request: ["/v1/folder", { params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" } }],
  },
  { uri: "speakai://languages", label: "supported-languages", request: ["/v1/media/supportedLanguages"] },
  { uri: "speakai://media/m1/transcript", label: "transcript(m1)", request: ["/v1/media/transcript/m1"] },
  { uri: "speakai://media/m1/insights", label: "insights(m1)", request: ["/v1/media/insight/m1"] },
];

describe("Resources", () => {
  let client: Client;

  beforeEach(async () => {
    vi.resetAllMocks();
    const server = new McpServer({ name: "test", version: "1.0.0" });
    const { registerResources } = await import("../src/resources.js");
    registerResources(server, mockClient);
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
  });

  it.each(RESOURCES)("$uri returns the API data as JSON", async ({ uri, request }) => {
    const data = { items: [{ id: "x1", name: "Recording" }] };
    mockGet.mockResolvedValueOnce({ data: { data } });

    const result = await client.readResource({ uri });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(...request);
    expect(result.contents).toEqual([{ uri, mimeType: "application/json", text: JSON.stringify(data, null, 2) }]);
  });

  // An auth failure or outage must not read as an empty workspace.
  it.each(RESOURCES)("$uri fails loudly when the API fails", async ({ uri, label }) => {
    mockGet.mockRejectedValueOnce(new Error("Request failed with status code 401"));

    await expect(client.readResource({ uri })).rejects.toThrow(`Speak AI resource '${label}' failed`);
  });
});
