import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";
import { AllowedValuesMode } from "@speakai/shared";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "list_fields",
    "List all custom fields defined in the workspace. Each field returns a `slug` (for example " +
      "`regulator_comment`) alongside its `id`, `name`, and `type`. Put `{{field.<slug>}}` in the prompt text " +
      "you send and Speak substitutes that field's value for the media before the model sees it. A slug is " +
      "unique per company and never changes when the field is renamed, so prefer it over the field name. A " +
      "field with no slug yet resolves by `id` in the same token.",
    {},
    {
      title: "List Custom Fields",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/fields");
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

  registerSpeakTool(server, 
    "create_field",
    "Create a new custom field for categorizing and tagging media.",
    {
      name: z.string().min(1).describe("Display name for the field"),
      type: z.string().describe("Field type (text, number, select, etc.)"),
      description: z.string().optional().describe("Optional description for the field"),
      prompt: z.string().optional().describe("AI prompt used to auto-populate the field"),
      allowedValues: z
        .array(z.string())
        .optional()
        .describe("Allowed values for select/multi-select field types"),
      allowedValuesMode: z
        .nativeEnum(AllowedValuesMode)
        .optional()
        .describe("Whether one or multiple allowed values can be selected"),
      otherValues: z
        .boolean()
        .optional()
        .describe("Whether values outside allowedValues are permitted"),
      notApplicableValues: z
        .string()
        .optional()
        .describe("Value(s) treated as not-applicable"),
      privacyMode: z.string().optional().describe("Privacy mode for the field"),
    },
    {
      title: "Create Custom Field",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/fields", body);
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

  registerSpeakTool(server, 
    "update_multiple_fields",
    "Set custom field values across media in a single batch operation. Scope the update with `folderId` (all media in a folder) and/or `mediaIds`.",
    {
      folderId: z
        .string()
        .optional()
        .describe("Apply the field values to all media in this folder"),
      mediaIds: z
        .array(z.string())
        .optional()
        .describe("Apply the field values to these specific media files"),
      fields: z
        .array(
          z.object({
            id: z.string().min(1).describe("Custom field ID"),
            value: z.unknown().describe("Value to set for the field"),
          }),
        )
        .describe("Array of field id/value pairs to set"),
    },
    {
      title: "Bulk Update Custom Field Values",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/fields/batch", body);
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

  registerSpeakTool(server, 
    "update_field",
    "Update a specific custom field by ID. `name` must always be supplied (the server replaces the field config).",
    {
      id: z.string().min(1).describe("Unique identifier of the field"),
      name: z.string().describe("Display name for the field"),
      type: z.string().optional().describe("Field type"),
      description: z.string().optional().describe("Optional description for the field"),
      prompt: z.string().optional().describe("AI prompt used to auto-populate the field"),
      allowedValues: z
        .array(z.string())
        .optional()
        .describe("Allowed values for select/multi-select field types"),
      allowedValuesMode: z
        .nativeEnum(AllowedValuesMode)
        .optional()
        .describe("Whether one or multiple allowed values can be selected"),
      otherValues: z
        .boolean()
        .optional()
        .describe("Whether values outside allowedValues are permitted"),
      notApplicableValues: z
        .string()
        .optional()
        .describe("Value(s) treated as not-applicable"),
      privacyMode: z.string().optional().describe("Privacy mode for the field"),
    },
    {
      title: "Update Custom Field",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ id, ...body }) => {
      try {
        const result = await api.put(`/v1/fields/${id}`, body);
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
