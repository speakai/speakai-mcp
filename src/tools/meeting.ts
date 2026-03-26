import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  server.tool(
    "list_meeting_events",
    "List scheduled or completed meeting assistant events with filtering and pagination.",
    {
      platformType: z
        .string()
        .optional()
        .describe("Filter by platform (e.g. zoom, teams, meet)"),
      meetingStatus: z
        .string()
        .optional()
        .describe("Filter by status (e.g. scheduled, completed, cancelled)"),
      page: z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
    },
    async (params) => {
      try {
        const result = await api.get("/v1/meeting-assistant/events", {
          params,
        });
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
    "schedule_meeting_event",
    "Schedule the Speak AI meeting assistant to join and record an upcoming meeting.",
    {
      meetingUrl: z.string().min(1).describe("URL of the meeting to join"),
      title: z.string().optional().describe("Display title for the event"),
      scheduledAt: z
        .string()
        .optional()
        .describe("ISO 8601 datetime for when the meeting starts"),
    },
    async (body) => {
      try {
        const result = await api.post(
          "/v1/meeting-assistant/events/schedule",
          body
        );
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
    "remove_assistant_from_meeting",
    "Remove the Speak AI assistant from an active or scheduled meeting.",
    {
      meetingAssistantEventId: z
        .string()
        .describe("Unique identifier of the meeting assistant event"),
    },
    async ({ meetingAssistantEventId }) => {
      try {
        const result = await api.put(
          "/v1/meeting-assistant/events/remove",
          null,
          { params: { meetingAssistantEventId } }
        );
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
    "delete_scheduled_assistant",
    "Cancel and delete a scheduled meeting assistant event.",
    {
      meetingAssistantEventId: z
        .string()
        .describe("Unique identifier of the meeting assistant event to cancel"),
    },
    async ({ meetingAssistantEventId }) => {
      try {
        const result = await api.delete(
          "/v1/meeting-assistant/events",
          { params: { meetingAssistantEventId } }
        );
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
