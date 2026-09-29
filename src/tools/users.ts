import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AxiosInstance } from "axios";
import { z } from "zod";
import { registerSpeakTool } from "./_helpers.js";
import { speakClient, formatAxiosError } from "../client.js";

// Team / user-group management. These routes live under /v1/admin on the
// Speak server and are scoped to the API key holder's company. Group
// membership is keyed by user _id, which you obtain from list_users.
export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "list_users",
    "List the users (members) in the workspace/company, with their ids, names, emails, and permissions. Use the returned _id values when assigning members to user groups.",
    {
      filterName: z
        .string()
        .optional()
        .describe(
          "Search text. Plain text matches first/last name or email; prefix with \"email:\" or \"name:\" to scope, e.g. \"email:jane@acme.com\".",
        ),
      sortBy: z
        .string()
        .optional()
        .describe("Sort expression \"field:asc\" or \"field:desc\", e.g. \"createdAt:desc\", \"email:asc\""),
      page: z.number().int().min(0).optional().describe("0-based page index (default 0)"),
      pageSize: z.number().int().min(1).max(200).optional().describe("Results per page (default 50)"),
    },
    {
      title: "List Users",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (params) => {
      try {
        const result = await api.get("/v1/admin/users", { params });
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
    "list_user_groups",
    "List all user groups in the company. Each group includes its members (hydrated names/emails) and member ids. Use this to discover group ids and current membership before updating or deleting a group.",
    {},
    {
      title: "List User Groups",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/admin/usergroup");
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
    "create_user_group",
    "Create a new user group and assign members. Member ids come from list_users. Fails with a 409 if a group with the same name already exists in the company.",
    {
      description: z.string().min(1).describe("Group name"),
      users: z
        .array(z.string().min(1))
        .default([])
        .describe("User _id strings to add as members (fetch via list_users)"),
    },
    {
      title: "Create User Group",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.post("/v1/admin/usergroup", body);
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
    "update_user_group",
    "Update a user group's name and member list. NOTE: the users array is a FULL REPLACEMENT, not a delta — any member id you omit is removed from the group. Fetch the current members with list_user_groups first and send the complete list.",
    {
      _id: z.string().min(1).describe("Group _id to update (from list_user_groups)"),
      description: z.string().min(1).describe("New group name"),
      users: z
        .array(z.string().min(1))
        .describe("Full replacement list of member _id strings (omitted users are removed)"),
    },
    {
      title: "Update User Group",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async (body) => {
      try {
        const result = await api.put("/v1/admin/usergroup", body);
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
    "delete_user_group",
    "Delete a user group. This removes the group only; it does not delete the users themselves.",
    {
      id: z.string().min(1).describe("Group _id to delete (from list_user_groups)"),
    },
    {
      title: "Delete User Group",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    async ({ id }) => {
      try {
        const result = await api.delete(`/v1/admin/usergroup/${id}`);
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
