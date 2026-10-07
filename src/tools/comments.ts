import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool, ok, err } from "./_helpers.js";
import { speakClient } from "../client.js";
import { CommentListFilter, MEDIA_COMMENT_BODY_MAX } from "@speakai/shared";
import { publicId, rangeInputSchema, resolveRange, STALE_TRANSCRIPT_NOTE } from "./transcript-range.js";

const commentBody = z.string().trim().min(1).max(MEDIA_COMMENT_BODY_MAX);

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_media_comments",
    "List the comment threads on a media file, with the file's current transcriptRevision. Each thread is its first comment with `replies` (oldest first). A comment on words carries an anchor (startWord, endWord, exact, times, status as in list_media_labels); a whole-file comment has none. A deleted first comment that has replies stays with an empty body and isDeleted true. Anyone who can open the file can read its comments.",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      filter: z
        .nativeEnum(CommentListFilter)
        .optional()
        .describe("all (default), open or resolved threads, or file for whole-file comments only"),
    },
    { title: "List Media Comments", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, filter }) => {
      try {
        const result = await api.get(`/v1/media/${mediaId}/comments`, { params: filter ? { filter } : undefined });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "add_comment",
    "Add a comment to a media file. Three kinds: on the whole file (no quote or range), on words in the transcript (quote, or range plus expectedTranscriptRevision, exactly as in apply_label), or a reply to a thread (parentId, with no span of its own). Replies go one level deep, so parentId must be a thread's first comment. A reply gives the thread's author an in-app notification in Speak. mediaLabelId links the comment to a labelled span on this file. " +
      STALE_TRANSCRIPT_NOTE +
      " Requires the comments create permission (every member by default).",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      body: commentBody.describe(`Comment text (1 to ${MEDIA_COMMENT_BODY_MAX} characters)`),
      parentId: publicId("parentId").optional().describe("commentId of the thread's first comment, to reply to it"),
      mediaLabelId: publicId("mediaLabelId").optional().describe("mediaLabelId from list_media_labels to link the comment to"),
      ...rangeInputSchema,
    },
    { title: "Add Comment", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ mediaId, body, parentId, mediaLabelId, ...rangeInput }) => {
      try {
        const hasSpan = rangeInput.range !== undefined || rangeInput.quote !== undefined;
        if (parentId !== undefined && (hasSpan || mediaLabelId !== undefined)) {
          throw new Error("A reply (parentId) belongs to its thread's span, so it cannot take quote, range or mediaLabelId.");
        }
        const resolved = await resolveRange(api, mediaId, rangeInput);
        const result = await api.post(`/v1/media/${mediaId}/comments`, {
          body,
          ...(resolved ?? {}),
          ...(parentId !== undefined ? { parentId } : {}),
          ...(mediaLabelId !== undefined ? { mediaLabelId } : {}),
        });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "update_comment",
    "Edit the text of a comment. Only the comment's author can edit its text (403 otherwise). To resolve or reopen a thread, use resolve_comment.",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      commentId: publicId("commentId").describe("commentId from list_media_comments"),
      body: commentBody.describe(`New comment text (1 to ${MEDIA_COMMENT_BODY_MAX} characters)`),
    },
    { title: "Update Comment", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, commentId, body }) => {
      try {
        const result = await api.patch(`/v1/media/${mediaId}/comments/${commentId}`, { body });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "resolve_comment",
    "Resolve a comment thread, or reopen it with resolved false. Only a thread's first comment can be resolved (400 on a reply). Requires the comments update permission (every member by default).",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      commentId: publicId("commentId").describe("commentId of the thread's first comment, from list_media_comments"),
      resolved: z.boolean().optional().describe("true to resolve (default), false to reopen"),
    },
    { title: "Resolve Comment", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, commentId, resolved }) => {
      try {
        const result = await api.patch(`/v1/media/${mediaId}/comments/${commentId}`, {
          isResolved: resolved ?? true,
        });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "delete_comment",
    "Delete a comment. Deleting a thread's first comment keeps its replies visible under an empty placeholder. You can always delete your own comments; deleting someone else's needs the comments delete permission (owners and admins by default), otherwise 403.",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      commentId: publicId("commentId").describe("commentId from list_media_comments"),
    },
    { title: "Delete Comment", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, commentId }) => {
      try {
        const result = await api.delete(`/v1/media/${mediaId}/comments/${commentId}`);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );
}
