import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios, { AxiosInstance } from "axios";
import { registerSpeakTool, ok, err } from "./_helpers.js";
import { speakClient } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "get_billing_status",
    "Show the account's plan, remaining credits, renewal date, trial end date, whether a payment is pending, and whether the current user can manage billing. " +
      "Also returns the upgrade and top-up options with their prices and checkout links. Read-only and free to call. " +
      "Use it to warn the user before an upload, analysis or chat would run past the remaining credits, or after a tool reports that the account is out of credits. " +
      "Share the checkout links with the user and let them decide; never complete a purchase for them.",
    {},
    {
      title: "Get Billing Status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    async () => {
      try {
        const result = await api.get("/v1/subscription/billing-status");
        return ok(result.data);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Billing status is not available from this Speak AI server yet (HTTP 404). Ask the user to check their plan and credits in the Speak AI app.",
              },
            ],
            isError: true,
          };
        }
        return err(error);
      }
    }
  );
}
