import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;
  registerSpeakTool(server, 
    "list_meeting_events",
    "List scheduled or completed meeting assistant events with filtering and pagination.",
    {
      platformType: z
        .string()
        .optional()
        .describe("Filter by platform. Allowed values: zoom, googleMeet, microsoftTeams, webex. Comma-separate for multiple. Must match these exact strings — server validates strictly."),
      meetingStatus: z
        .string()
        .optional()
        .describe("Filter by status (e.g. scheduled, completed, cancelled)"),
      page: z.number().int().min(0).optional().describe("Page number (0-based, default: 0)"),
      pageSize: z.number().int().min(1).max(500).optional().describe("Results per page (default: 20, max: 500)"),
    },
    {
      title: "List Meeting Events",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
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

  registerSpeakTool(server, 
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
    {
      title: "Schedule AI Meeting Assistant",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
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

  registerSpeakTool(server, 
    "remove_assistant_from_meeting",
    "Remove the Speak AI assistant from an active or scheduled meeting.",
    {
      meetingAssistantEventId: z
        .string()
        .describe("Unique identifier of the meeting assistant event"),
    },
    {
      title: "Remove Assistant from Meeting",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
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

  registerSpeakTool(server, 
    "delete_scheduled_assistant",
    "Cancel and delete a scheduled meeting assistant event.",
    {
      meetingAssistantEventId: z
        .string()
        .describe("Unique identifier of the meeting assistant event to cancel"),
    },
    {
      title: "Cancel Scheduled Meeting Assistant",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
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

  registerSpeakTool(server,
    "get_live_meeting_transcript",
    "Fetch new sentences from an in-progress or just-ended meeting transcript. Identify the meeting via meetingAssistantEventId (preferred) or mediaId. Pass back the previous response's nextCursor as sinceEndInSec to receive only what's been added since.",
    {
      meetingAssistantEventId: z
        .string()
        .optional()
        .describe("Meeting assistant event id from list_meeting_events. Either this or mediaId is required."),
      mediaId: z
        .string()
        .optional()
        .describe("Media id of the live meeting. Either this or meetingAssistantEventId is required."),
      sinceEndInSec: z
        .number()
        .min(0)
        .optional()
        .describe("Pass the nextCursor value from your previous response to skip already-seen sentences. Omit on the first call."),
    },
    {
      title: "Get Live Meeting Transcript",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    async ({ meetingAssistantEventId, mediaId, sinceEndInSec }) => {
      if (!meetingAssistantEventId && !mediaId) {
        return {
          content: [{ type: "text", text: "Error: provide either meetingAssistantEventId or mediaId." }],
          isError: true,
        };
      }

      try {
        let resolvedMediaId = mediaId;
        let meetingStatus: string | null = null;
        let meetingName: string | undefined;

        if (meetingAssistantEventId) {
          const eventsRes = await api.get("/v1/meeting-assistant/events", {
            params: { pageSize: 50, sortBy: "startTime:desc" },
          });
          const events = (eventsRes.data?.data?.events ?? eventsRes.data?.events ?? []) as Array<{
            meetingAssistantEventId?: string;
            currentStatus?: string;
            title?: string;
            mediaId?: { mediaId?: string } | string | null;
          }>;
          const event = events.find((e) => e.meetingAssistantEventId === meetingAssistantEventId);
          if (!event) {
            return {
              content: [{ type: "text", text: JSON.stringify({ status: "not_found", meetingAssistantEventId }, null, 2) }],
              structuredContent: { data: { status: "not_found", meetingAssistantEventId } },
            };
          }
          meetingStatus = event.currentStatus ?? null;
          meetingName = event.title;
          const mediaRef = event.mediaId;
          const linkedMediaId = typeof mediaRef === "string" ? mediaRef : mediaRef?.mediaId;
          if (!linkedMediaId) {
            const payload = {
              status: "not_started",
              meetingAssistantEventId,
              meetingStatus,
              message: "Meeting has no linked media yet — the bot may not have joined or started recording.",
            };
            return {
              content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
              structuredContent: { data: payload },
            };
          }
          resolvedMediaId = linkedMediaId;
        }

        const transcriptRes = await api.get(`/v1/media/transcript/${resolvedMediaId}`, {
          params: Number.isFinite(sinceEndInSec) ? { sinceEndInSec } : undefined,
        });
        const data = transcriptRes.data?.data ?? transcriptRes.data ?? {};
        const sentences = (data?.insight?.transcript ?? []) as Array<{
          instances?: Array<{ endInSec?: number }>;
        }>;
        const maxEnd = sentences.reduce((m, s) => Math.max(m, s.instances?.[0]?.endInSec ?? 0), 0);
        const nextCursor = sentences.length > 0 ? maxEnd : (sinceEndInSec ?? 0);

        const payload = {
          mediaId: resolvedMediaId,
          name: data?.name ?? meetingName ?? null,
          meetingStatus,
          isLive: meetingStatus === "inCallRecording",
          newSentences: sentences,
          nextCursor,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: { data: payload },
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
