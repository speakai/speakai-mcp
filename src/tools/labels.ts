import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool, ok, err } from "./_helpers.js";
import { speakClient } from "../client.js";
import { publicId, rangeInputSchema, resolveRange, STALE_TRANSCRIPT_NOTE } from "./transcript-range.js";

// Limits match the server's Joi schemas in speak-server src/@speak-labels/util/validations.
const LABEL_NAME_MAX = 80;
const LABEL_DESCRIPTION_MAX = 500;
const MAX_LABELS_PER_SPAN = 20;
const SORT_ORDER_MAX = 1_000_000;
const SPEAK_LABEL_SETS = ["sales_qa", "research", "meetings", "transcript_feedback"] as const;
const ANCHOR_STATUSES = ["active", "shifted", "needs_review"] as const;

const labelName = z.string().trim().min(1).max(LABEL_NAME_MAX);
const labelDescription = z.string().trim().max(LABEL_DESCRIPTION_MAX);
const labelColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "color must be #rrggbb");
const sortOrder = z.number().int().min(0).max(SORT_ORDER_MAX);
const labelIds = z
  .array(publicId("labelId"))
  .min(1)
  .max(MAX_LABELS_PER_SPAN)
  .refine((ids) => new Set(ids).size === ids.length, "labelIds must not repeat")
  .describe(`1 to ${MAX_LABELS_PER_SPAN} distinct ids of active labels (not groups), from list_labels`);

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_labels",
    "List the workspace's labels as a tree: groups (isGroup true) carry their labels in `labels`, and ungrouped labels sit at the top level. Each item has labelId, name, description, color, parentId, source (`speak` for Speak label sets), usageCount and isActive. Use the labelIds of non-group labels with apply_label. Anyone in the workspace can read labels.",
    {
      status: z
        .enum(["active", "archived", "all"])
        .optional()
        .describe("Which labels to list (default active)"),
      search: z
        .string()
        .trim()
        .max(LABEL_NAME_MAX)
        .optional()
        .describe("Case-insensitive name match; a group is listed when it or any of its labels match"),
    },
    { title: "List Labels", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (params) => {
      try {
        const result = await api.get("/v1/labels", { params });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "create_label",
    "Create a label, or a label group with isGroup true. Labels are shared by the whole workspace and are applied to transcript words with apply_label. A label can sit in one group (parentId); groups cannot be nested, and a group has no color. Names are unique among active labels under the same parent, ignoring case and extra spaces: 409 means the name is taken. Requires the labels create permission (owners and admins by default).",
    {
      name: labelName.describe(`Label or group name (1 to ${LABEL_NAME_MAX} characters)`),
      isGroup: z.boolean().optional().describe("true to create a group that holds labels"),
      description: labelDescription.optional().describe(`What the label means (up to ${LABEL_DESCRIPTION_MAX} characters)`),
      color: labelColor.optional().describe("Label color as #rrggbb (default #6366f1). Not allowed on a group."),
      parentId: publicId("parentId").optional().describe("labelId of an active group to put the label in. Not allowed on a group."),
      sortOrder: sortOrder.optional().describe(`Position among its siblings (0 to ${SORT_ORDER_MAX})`),
    },
    { title: "Create Label", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async (body) => {
      if (body.isGroup && (body.color !== undefined || body.parentId !== undefined)) {
        return err(new Error("A group cannot have a color or a parentId."));
      }
      try {
        const result = await api.post("/v1/labels", body);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "update_label",
    "Rename, recolor, describe, move or reorder a label or group. Send only the fields to change. parentId null moves a label to the top level. An archived label cannot be edited (restore_label first), and a group cannot take a color or a parent. 409 means another active label under the same parent already has the name. Requires the labels update permission (owners and admins by default).",
    {
      labelId: publicId("labelId").describe("labelId from list_labels"),
      name: labelName.optional().describe(`New name (1 to ${LABEL_NAME_MAX} characters)`),
      description: labelDescription.optional().describe(`New description (up to ${LABEL_DESCRIPTION_MAX} characters, empty clears it)`),
      color: labelColor.optional().describe("New color as #rrggbb"),
      parentId: publicId("parentId").nullable().optional().describe("labelId of a group to move into, or null for the top level"),
      sortOrder: sortOrder.optional().describe(`New position among its siblings (0 to ${SORT_ORDER_MAX})`),
    },
    { title: "Update Label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ labelId, ...body }) => {
      if (Object.values(body).every((value) => value === undefined)) {
        return err(new Error("Send at least one of name, description, color, parentId or sortOrder."));
      }
      try {
        const result = await api.put(`/v1/labels/${labelId}`, body);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "archive_label",
    "Archive a label so it can no longer be applied; archiving a group archives its labels too. Labels already applied to transcripts stay where they are, and restore_label undoes this. Safe to repeat. Returns archivedCount. Requires the labels delete permission (owners and admins by default).",
    { labelId: publicId("labelId").describe("labelId from list_labels") },
    { title: "Archive Label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ labelId }) => {
      try {
        const result = await api.post(`/v1/labels/${labelId}/archive`);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "restore_label",
    "Restore an archived label; restoring a group also restores its archived labels. A label whose name is now used by an active label stays archived and is counted in skippedCount. 409 means the label's own name is taken (rename the active one first); a merged label cannot be restored, and a label cannot be restored while its group is archived. Requires the labels delete permission (owners and admins by default).",
    { labelId: publicId("labelId").describe("labelId of an archived label, from list_labels with status archived") },
    { title: "Restore Label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ labelId }) => {
      try {
        const result = await api.post(`/v1/labels/${labelId}/restore`);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "merge_labels",
    "Merge one label into another: every place the source label is applied moves onto the target (a span that had both keeps one), then the source is archived with mergedInto set. This cannot be undone by restore_label. Both must be active, non-group labels and different. Returns movedCount. Requires both the labels update and labels delete permissions (owners and admins by default).",
    {
      labelId: publicId("labelId").describe("The label to merge away (it is archived)"),
      targetLabelId: publicId("targetLabelId").describe("The label that receives every use of labelId"),
    },
    { title: "Merge Labels", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    async ({ labelId, targetLabelId }) => {
      if (labelId === targetLabelId) {
        return err(new Error("labelId and targetLabelId must be different labels."));
      }
      try {
        const result = await api.post(`/v1/labels/${labelId}/merge`, { targetLabelId });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "add_speak_label_sets",
    "Add ready-made label groups from Speak: sales_qa (Unprofessional, Slang, Objection, Great moment, Compliance risk), research (Pain point, Motivation, Quote for report, Surprise, Follow-up), meetings (Decision, Action item, Risk, Open question) and transcript_feedback (Wrong split, Misheard word, Wrong speaker, Bad translation). Safe to repeat: a group or label that already exists with the same name is reused, and a set whose group name is taken by a plain label is skipped (listed in skippedSets). Requires the labels create permission (owners and admins by default).",
    {
      sets: z
        .array(z.enum(SPEAK_LABEL_SETS))
        .min(1)
        .refine((sets) => new Set(sets).size === sets.length, "sets must not repeat")
        .describe("Which sets to add"),
    },
    { title: "Add Speak Label Sets", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async (body) => {
      try {
        const result = await api.post("/v1/labels/speak-sets", body);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "list_media_labels",
    "List the labels applied to a media file's transcript, in transcript order, with the file's current transcriptRevision. Each item has mediaLabelId, labelIds and an anchor: startWord and endWord (inclusive word indices), exact (the labelled words), startInSec, endInSec, speakerIds and status. Status active means the same words; shifted means the transcript was edited and most of the words survived; needs_review means the words changed too much, so anchor holds a suggested range and lastResolved the last confirmed one (confirm or move it with update_media_label). Anyone who can open the file can read its labels.",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      status: z.enum(ANCHOR_STATUSES).optional().describe("Only labels with this anchor status"),
    },
    { title: "List Media Labels", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, status }) => {
      try {
        const result = await api.get(`/v1/media/${mediaId}/labels`, { params: status ? { status } : undefined });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "apply_label",
    "Apply one or more labels to a span of words in a media file's transcript. Give the span as quote (words copied from get_transcript; this tool finds their position and the current transcriptRevision for you) or as range plus expectedTranscriptRevision. If the same span already has labels, the new ones are added to it. Check the returned anchor.exact to confirm the right words were labelled. " +
      STALE_TRANSCRIPT_NOTE +
      " A 400 means the range is outside the transcript or a label is archived, a group, or not in this workspace. Requires the labels assign permission (every member by default).",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      labelIds,
      ...rangeInputSchema,
    },
    { title: "Apply Label", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    async ({ mediaId, labelIds: ids, ...rangeInput }) => {
      try {
        const resolved = await resolveRange(api, mediaId, rangeInput);
        if (!resolved) throw new Error("Give the words to label as quote, or as range with expectedTranscriptRevision.");
        const result = await api.post(`/v1/media/${mediaId}/labels`, { ...resolved, labelIds: ids });
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "update_media_label",
    "Change a labelled span on a transcript. Do exactly one of: labelIds to replace its labels; action keep to confirm its current anchor (after the transcript was edited and its status is shifted or needs_review); or action replace with a new quote or range to move it. " +
      STALE_TRANSCRIPT_NOTE +
      " Keep also answers 409 when the anchor was built on an older revision: list_media_labels again first. Requires the labels assign permission (every member by default).",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      mediaLabelId: publicId("mediaLabelId").describe("mediaLabelId from list_media_labels"),
      labelIds: labelIds.optional(),
      action: z
        .enum(["keep", "replace"])
        .optional()
        .describe("keep confirms the current anchor; replace moves the span to quote or range"),
      ...rangeInputSchema,
    },
    { title: "Update Media Label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, mediaLabelId, labelIds: ids, action, ...rangeInput }) => {
      try {
        const hasSpan = rangeInput.range !== undefined || rangeInput.quote !== undefined;
        let body: Record<string, unknown>;
        if ((ids === undefined) === (action === undefined)) {
          throw new Error("Send exactly one of labelIds or action.");
        } else if (action === "replace") {
          const resolved = await resolveRange(api, mediaId, rangeInput);
          if (!resolved) throw new Error("action replace needs the new span as quote, or as range with expectedTranscriptRevision.");
          body = { action, ...resolved };
        } else if (hasSpan || rangeInput.expectedTranscriptRevision !== undefined) {
          throw new Error("quote, range and expectedTranscriptRevision are only used with action replace.");
        } else {
          body = ids !== undefined ? { labelIds: ids } : { action };
        }
        const result = await api.patch(`/v1/media/${mediaId}/labels/${mediaLabelId}`, body);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );

  registerSpeakTool(server,
    "remove_media_label",
    "Remove a labelled span from a transcript. The label itself stays in the workspace, and comments linked to the span stay without the link. Requires the labels assign permission (every member by default).",
    {
      mediaId: publicId("mediaId").describe("Media id"),
      mediaLabelId: publicId("mediaLabelId").describe("mediaLabelId from list_media_labels"),
    },
    { title: "Remove Media Label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    async ({ mediaId, mediaLabelId }) => {
      try {
        const result = await api.delete(`/v1/media/${mediaId}/labels/${mediaLabelId}`);
        return ok(result.data);
      } catch (error) {
        return err(error);
      }
    }
  );
}
