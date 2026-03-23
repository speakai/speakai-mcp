import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer): void {
  server.tool(
    "list_fields",
    "List all custom fields defined in the workspace.",
    {},
    async () => {
      try {
        const result = await speakClient.get("/v1/fields");
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "create_field",
    "Create a new custom field for categorizing and tagging media.",
    {
      name: z.string().describe("Display name for the field"),
      type: z.string().optional().describe("Field type (text, number, select, etc.)"),
      options: z
        .array(z.string())
        .optional()
        .describe("Options for select/multi-select field types"),
    },
    async (body) => {
      try {
        const result = await speakClient.post("/v1/fields", body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update_multiple_fields",
    "Update multiple custom fields in a single batch operation.",
    {
      fields: z
        .array(z.record(z.unknown()))
        .describe("Array of field objects to update"),
    },
    async ({ fields }) => {
      try {
        const result = await speakClient.post("/v1/fields/multi", { fields });
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "update_field",
    "Update a specific custom field by ID.",
    {
      id: z.string().describe("Unique identifier of the field"),
      name: z.string().optional().describe("New display name"),
      type: z.string().optional().describe("New field type"),
      options: z
        .array(z.string())
        .optional()
        .describe("Updated options for select types"),
    },
    async ({ id, ...body }) => {
      try {
        const result = await speakClient.put(`/v1/fields/${id}`, body);
        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );
}
