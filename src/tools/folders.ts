import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool, speakerHintsShape } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  // Folder Views
  registerSpeakTool(server, 
    "get_all_folder_views",
    "Retrieve all saved views across all folders.",
    {},
    {
      title: "Get All Folder Views",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/folder/views");
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "get_folder_views",
    "Retrieve all saved views for a specific folder.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
    },
    {
      title: "Get Folder Views",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ folderId }) => {
      try {
        const result = await api.get(`/v1/folder/${folderId}/views`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "create_folder_view",
    "Create a new saved view for a folder with a custom set of display columns.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
      name: z.string().describe("Display name for the view"),
      isDefault: z
        .boolean()
        .optional()
        .describe("Whether this view is the folder's default view"),
      columns: z
        .array(
          z.object({
            fieldId: z
              .string()
              .optional()
              .describe("Field ID this column maps to (omit for built-in columns)"),
            name: z.string().describe("Column display name"),
            type: z.string().describe("Column type — a FieldType or a default view column"),
            definition: z.string().optional().describe("Optional column definition"),
            order: z.number().describe("Column display order"),
          }),
        )
        .describe("Ordered list of columns shown in the view"),
    },
    {
      title: "Create Folder View",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async ({ folderId, ...body }) => {
      try {
        const result = await api.post(
          `/v1/folder/${folderId}/views`,
          body
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "update_folder_view",
    "Update an existing saved view. Replaces the whole view, so `name`, `isDefault` and `columns` must all be supplied.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
      viewId: z.string().min(1).describe("Unique identifier of the view to update"),
      name: z.string().describe("Display name for the view"),
      isDefault: z.boolean().describe("Whether this view is the folder's default view"),
      columns: z
        .array(
          z.object({
            fieldId: z
              .string()
              .optional()
              .describe("Field ID this column maps to (omit for built-in columns)"),
            name: z.string().describe("Column display name"),
            type: z.string().describe("Column type — a FieldType or a default view column"),
            definition: z.string().optional().describe("Optional column definition"),
            order: z.number().describe("Column display order"),
          }),
        )
        .describe("Ordered list of columns shown in the view"),
    },
    {
      title: "Update Folder View",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ folderId, viewId, ...body }) => {
      try {
        const result = await api.put(
          `/v1/folder/${folderId}/views/${viewId}`,
          body
        );
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "clone_folder_view",
    "Duplicate an existing folder view into a target folder.",
    {
      sourceFolderId: z.string().min(1).describe("Folder that currently holds the view"),
      targetFolderId: z
        .string()
        .min(1)
        .describe("Folder to copy the view into (must differ from sourceFolderId)"),
      viewId: z.string().min(1).describe("Unique identifier of the view to clone"),
      name: z.string().describe("Display name for the cloned view"),
      isDefault: z
        .boolean()
        .optional()
        .describe("Whether the cloned view becomes the target folder's default"),
    },
    {
      title: "Clone Folder View",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folder/views/clone", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${formatAxiosError(err)}` }],
          isError: true,
        };
      }
    }
  );

  // Folders CRUD
  registerSpeakTool(server, 
    "list_folders",
    "List all folders in the workspace with pagination and sorting.",
    {
      page: z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
      sortBy: z
        .string()
        .optional()
        .describe('Sort field and direction, e.g. "createdAt:desc"'),
    },
    {
      title: "List Folders",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/folder", { params });
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "get_folder_info",
    "Get detailed information about a specific folder including its contents.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
    },
    {
      title: "Get Folder Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ folderId }) => {
      try {
        const result = await api.get(`/v1/folder/${folderId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "create_folder",
    "Create a new folder in the workspace.",
    {
      name: z.string().min(1).describe("Display name for the new folder"),
      description: z.string().optional().describe("Optional folder description"),
      ...speakerHintsShape,
    },
    {
      title: "Create Folder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folder", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "clone_folder",
    "Duplicate an existing folder and all of its contents.",
    {
      folderId: z.string().min(1).describe("ID of the folder to clone"),
      name: z.string().optional().describe("Name for the cloned folder"),
      description: z.string().optional().describe("Description for the cloned folder"),
      assignTo: z
        .array(z.string())
        .optional()
        .describe("User IDs to assign the cloned folder to"),
      isSaveDefaultView: z
        .boolean()
        .optional()
        .describe("Whether to copy the source folder's default view"),
    },
    {
      title: "Clone Folder",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folder/clone", body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "update_folder",
    "Update a folder. `name` must always be supplied (the server replaces the folder config).",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
      name: z.string().describe("Display name for the folder"),
      description: z.string().optional().describe("Optional folder description"),
      ...speakerHintsShape,
    },
    {
      title: "Update Folder",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ folderId, ...body }) => {
      try {
        const result = await api.put(`/v1/folder/${folderId}`, body);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
    "delete_folder",
    "Permanently delete a folder. Media within the folder will be moved, not deleted.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder to delete"),
    },
    {
      title: "Delete Folder",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ folderId }) => {
      try {
        const result = await api.delete(`/v1/folder/${folderId}`);
        return {
          content: [
            { type: "text", text: JSON.stringify(result.data, null, 2) },
          ],
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
