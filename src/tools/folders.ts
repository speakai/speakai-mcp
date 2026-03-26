import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  // Folder Views
  server.tool(
    "get_all_folder_views",
    "Retrieve all saved views across all folders.",
    {},
    async () => {
      try {
        const result = await api.get("/v1/folders/views");
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

  server.tool(
    "get_folder_views",
    "Retrieve all saved views for a specific folder.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
    },
    async ({ folderId }) => {
      try {
        const result = await api.get(`/v1/folders/${folderId}/views`);
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

  server.tool(
    "create_folder_view",
    "Create a new saved view for a folder with custom filters and display settings.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
      name: z.string().optional().describe("Display name for the view"),
      filters: z
        .record(z.unknown())
        .optional()
        .describe("Filter configuration object"),
    },
    async ({ folderId, ...body }) => {
      try {
        const result = await api.post(
          `/v1/folders/${folderId}/views`,
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

  server.tool(
    "update_folder_view",
    "Update an existing saved view's name, filters, or display settings.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
      viewId: z.string().min(1).describe("Unique identifier of the view to update"),
      name: z.string().optional().describe("New display name for the view"),
      filters: z
        .record(z.unknown())
        .optional()
        .describe("Updated filter configuration"),
    },
    async ({ folderId, viewId, ...body }) => {
      try {
        const result = await api.put(
          `/v1/folders/${folderId}/views/${viewId}`,
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

  server.tool(
    "clone_folder_view",
    "Duplicate an existing folder view.",
    {
      viewId: z.string().min(1).describe("Unique identifier of the view to clone"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/folders/views/clone", body);
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
  server.tool(
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

  server.tool(
    "get_folder_info",
    "Get detailed information about a specific folder including its contents.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
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

  server.tool(
    "create_folder",
    "Create a new folder in the workspace.",
    {
      name: z.string().min(1).describe("Display name for the new folder"),
      parentFolderId: z
        .string()
        .optional()
        .describe("ID of the parent folder for nesting"),
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

  server.tool(
    "clone_folder",
    "Duplicate an existing folder and all of its contents.",
    {
      folderId: z.string().min(1).describe("ID of the folder to clone"),
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

  server.tool(
    "update_folder",
    "Update a folder's name or other properties.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder"),
      name: z.string().optional().describe("New display name for the folder"),
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

  server.tool(
    "delete_folder",
    "Permanently delete a folder. Media within the folder will be moved, not deleted.",
    {
      folderId: z.string().min(1).describe("Unique identifier of the folder to delete"),
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
