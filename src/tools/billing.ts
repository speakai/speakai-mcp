import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import axios, { AxiosInstance } from "axios";
import { registerSpeakTool, ok, err } from "./_helpers.js";
import { speakClient } from "../client.js";

export function register(server: McpServer, client?: AxiosInstance): void {
  const api = client ?? speakClient;

  registerSpeakTool(server,
    "get_billing_status",
    "Show the account's billing status: plan (free_trial, pay_as_you_go, pro or custom), creditsRemaining, renewsAt, trialEndsAt, " +
      "pendingPayment, canManageBilling and manageUrl, plus options: 'pro' has only id, recommended and a checkout url (no price), " +
      "and 'top_up' has id, recommended, amount, currency, credits, autoReload and a checkout url. " +
      "checkoutUrl links to the recommended option and is left out when the current user cannot manage billing; then ask them to contact whoever manages billing on the account. " +
      "Read-only and free to call. Use it to warn the user before an upload, analysis or chat would run past the remaining credits, " +
      "or after a tool reports that the account is out of credits. Pro gives more hours of transcription for the money than adding credit. " +
      "Share the links with the user and let them decide; never complete a purchase for them. Retry a blocked tool only after the user confirms they added credit or started Pro.",
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
