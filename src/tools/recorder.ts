import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  server.tool(
    "check_recorder_status",
    "Check whether a recorder/survey is active and accepting submissions.",
    {
      token: z.string().min(1).describe("Unique token identifying the recorder"),
    },
    async ({ token }) => {
      try {
        const result = await api.get(`/v1/recorder/status/${token}`);
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
    "create_recorder",
    "Create a new recorder or survey for collecting audio/video submissions.",
    {
      name: z.string().optional().describe("Display name for the recorder"),
      folderId: z.string().optional().describe("Folder to store recordings in"),
      settings: z.record(z.unknown()).optional().describe("Recorder configuration settings"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/create", body);
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
    "list_recorders",
    "List all recorders/surveys in the workspace.",
    {
      page: z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
      sortBy: z.string().optional().describe('Sort field, e.g. "createdAt:desc"'),
    },
    async (params) => {
      try {
        const result = await api.get("/v1/recorder", { params });
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
    "clone_recorder",
    "Duplicate an existing recorder including all its settings and questions.",
    {
      recorderId: z.string().min(1).describe("ID of the recorder to clone"),
    },
    async (body) => {
      try {
        const result = await api.post("/v1/recorder/clone", body);
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
    "get_recorder_info",
    "Get detailed information about a specific recorder including its settings and questions.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/${recorderId}`);
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
    "get_recorder_recordings",
    "List all submissions/recordings collected by a specific recorder.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/recordings/${recorderId}`);
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
    "generate_recorder_url",
    "Generate a shareable public URL for a recorder/survey.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
    },
    async ({ recorderId }) => {
      try {
        const result = await api.get(`/v1/recorder/url/${recorderId}`);
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
    "update_recorder_settings",
    "Update configuration settings for a recorder (branding, permissions, etc.).",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
      settings: z.record(z.unknown()).describe("Settings object with updated values"),
    },
    async ({ recorderId, settings }) => {
      try {
        const result = await api.put(`/v1/recorder/settings/${recorderId}`, settings);
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
    "update_recorder_questions",
    "Update the survey questions for a recorder.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder"),
      questions: z
        .array(z.record(z.unknown()))
        .describe("Array of question objects"),
    },
    async ({ recorderId, questions }) => {
      try {
        const result = await api.put(`/v1/recorder/questions/${recorderId}`, { questions });
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
    "delete_recorder",
    "Permanently delete a recorder/survey. Existing recordings are preserved.",
    {
      recorderId: z.string().min(1).describe("Unique identifier of the recorder to delete"),
    },
    async ({ recorderId }) => {
      try {
        const result = await api.delete(`/v1/recorder/${recorderId}`);
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
