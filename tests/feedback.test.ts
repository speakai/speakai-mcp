import { describe, it, expect } from "vitest";
import axios from "axios";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { feedbackAppVersion, feedbackSurface, register } from "../src/tools/feedback.js";

type Reply = { status: number; data: unknown };

async function connect(reply: (config: any) => Reply, clientInfo = { name: "claude-ai", version: "0.1.0" }) {
  const seen: any[] = [];
  const api = axios.create({
    adapter: async (config) => {
      seen.push(config);
      const { status, data } = reply(config);
      const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
      if (status >= 400) {
        throw new axios.AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", config, {}, response);
      }
      return response;
    },
  });
  const server = new McpServer({ name: "speak-ai-test", version: "1.0.0" });
  register(server, api);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client(clientInfo);
  await client.connect(clientTransport);
  const call = (args: Record<string, unknown>) => client.callTool({ name: "submit_feedback", arguments: args }) as Promise<any>;
  return { call, seen };
}

describe("submit_feedback", () => {
  it("posts an improvement to /v1/feedback, marked as coming from MCP and the connected AI app", async () => {
    const { call, seen } = await connect(() => ({ status: 201, data: { status: "success", data: { id: "f1" } } }));

    const result = await call({ text: "  Speaker names keep resetting after I rename them.  ", area: "transcripts" });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.data).toEqual({ status: "success", data: { id: "f1" } });
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(seen[0].url).toBe("/v1/feedback");
    expect(JSON.parse(seen[0].data)).toEqual({
      type: "improvement",
      trigger: "manual",
      surface: "MCP: transcripts",
      text: "Speaker names keep resetting after I rename them.",
      context: { appVersion: "MCP via claude-ai 0.1.0" },
    });
    expect(seen[0].skipRateLimitRetry).toBe(true);
  });

  it("explains the per-minute limit and says when the person can send again", async () => {
    const nextAllowedAt = "2026-11-17T15:00:00.000Z";
    const { call, seen } = await connect(() => ({
      status: 429,
      data: { status: "failed", message: "You can send one suggestion a minute.", nextAllowedAt },
    }));

    const result = await call({ text: "Please add a dark mode to the recorder." });

    expect(seen).toHaveLength(1);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(`They can send more after ${nextAllowedAt}`);
    expect(result.content[0].text).toContain("limit is one a minute");
    expect(result.structuredContent.data).toEqual({ status: "failed", reason: "FEEDBACK_RATE_LIMIT", nextAllowedAt });
  });

  it("reports other failures, such as the per-minute limit, as a plain tool error", async () => {
    const { call } = await connect(() => ({
      status: 429,
      data: "Too many feedback submissions. Please wait a minute before trying again.",
    }));

    const result = await call({ text: "Please add a dark mode to the recorder." });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 429");
    expect(result.content[0].text).not.toContain("limit is one a minute");
  });

  it.each([
    { text: "too short" },
    { text: "x".repeat(4001) },
    { text: "Long enough feedback text.", area: "a".repeat(151) },
  ])("rejects input the API would refuse, without calling it", async (args) => {
    const { call, seen } = await connect(() => ({ status: 201, data: {} }));

    const result = await call(args);

    expect(result.isError).toBe(true);
    expect(seen).toHaveLength(0);
  });
});

describe("feedback labels", () => {
  it("names the area after MCP, and stays inside the API's 200-character limit", () => {
    expect(feedbackSurface()).toBe("MCP");
    expect(feedbackSurface("   ")).toBe("MCP");
    expect(feedbackSurface(" clips ")).toBe("MCP: clips");
    expect(feedbackSurface("a".repeat(300))).toHaveLength(200);
  });

  it("names the AI app when it said who it is, and stays inside the API's 100-character limit", () => {
    expect(feedbackAppVersion()).toBe("MCP");
    expect(feedbackAppVersion({ name: "chatgpt" })).toBe("MCP via chatgpt");
    expect(feedbackAppVersion({ name: "cursor", version: "2.1" })).toBe("MCP via cursor 2.1");
    expect(feedbackAppVersion({ name: "a".repeat(200), version: "1" })).toHaveLength(100);
  });
});
