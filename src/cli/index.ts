import { Command } from "commander";
import { createInterface } from "readline";
import {
  loadConfig,
  saveConfig,
  resolveApiKey,
  resolveBaseUrl,
  getConfigPath,
} from "./config.js";
import { printJson, printTable, printError, printSuccess } from "./format.js";

/**
 * Lazily load the speakClient — must be called AFTER resolveApiKey()
 * so env vars are set before the client module initializes.
 */
async function getClient() {
  const { speakClient } = await import("../client.js");
  return speakClient;
}

function requireApiKey(): void {
  const key = resolveApiKey();
  resolveBaseUrl();
  if (!key) {
    printError(
      'No API key configured. Run "speakai-mcp config set-key" or set SPEAK_API_KEY.'
    );
    process.exit(1);
  }
}

export function createCli(): Command {
  const program = new Command();

  program
    .name("speakai-mcp")
    .description(
      "Speak AI CLI & MCP Server — transcribe, analyze, and manage media from the command line"
    )
    .version("1.0.0");

  // ── Config commands ────────────────────────────────────────────────

  const config = program.command("config").description("Manage configuration");

  config
    .command("set-key")
    .description("Set your Speak AI API key")
    .argument("[key]", "API key (omit for interactive prompt)")
    .action(async (key?: string) => {
      if (!key) {
        const rl = createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        key = await new Promise<string>((resolve) =>
          rl.question("Enter your Speak AI API key: ", (answer) => {
            rl.close();
            resolve(answer.trim());
          })
        );
      }
      if (!key) {
        printError("No key provided.");
        process.exit(1);
      }
      const cfg = loadConfig();
      cfg.apiKey = key;
      saveConfig(cfg);
      printSuccess(`API key saved to ${getConfigPath()}`);
    });

  config
    .command("show")
    .description("Show current configuration")
    .action(() => {
      const cfg = loadConfig();
      const envKey = process.env.SPEAK_API_KEY;
      console.log(`Config file: ${getConfigPath()}`);
      console.log(
        `API key:     ${cfg.apiKey ? cfg.apiKey.slice(0, 8) + "..." : "(not set)"}`
      );
      console.log(
        `Base URL:    ${cfg.baseUrl ?? "https://api.speakai.co (default)"}`
      );
      if (envKey) {
        console.log(
          `Env override: SPEAK_API_KEY=${envKey.slice(0, 8)}...`
        );
      }
    });

  config
    .command("set-url")
    .description("Set custom API base URL")
    .argument("<url>", "Base URL (e.g. https://api.speakai.co)")
    .action((url: string) => {
      const cfg = loadConfig();
      cfg.baseUrl = url;
      saveConfig(cfg);
      printSuccess(`Base URL set to ${url}`);
    });

  // ── Media commands ─────────────────────────────────────────────────

  program
    .command("list-media")
    .alias("ls")
    .description("List media files")
    .option("-t, --type <type>", "Filter by type (audio, video, text)")
    .option("-p, --page <n>", "Page number (0-based)", "0")
    .option("-s, --page-size <n>", "Results per page", "20")
    .option("--sort <field>", "Sort field", "createdAt:desc")
    .option("-f, --folder <id>", "Filter by folder ID")
    .option("-n, --name <filter>", "Filter by name")
    .option("--favorites", "Show only favorites")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const params: Record<string, unknown> = {
          page: parseInt(opts.page),
          pageSize: parseInt(opts.pageSize),
          sortBy: opts.sort,
          filterMedia: 2, // 0=Uploaded, 1=Assigned, 2=Both
        };
        if (opts.type) params.mediaType = opts.type;
        if (opts.folder) params.folderId = opts.folder;
        if (opts.name) params.filterName = opts.name;
        if (opts.favorites) params.isFavorites = true;

        const res = await client.get("/v1/media", { params });
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        console.log(`Total: ${data.totalCount} | Page ${opts.page} of ${data.pages}\n`);
        printTable(data.mediaList ?? [], [
          { key: "_id", label: "ID", width: 14 },
          { key: "name", label: "Name", width: 40 },
          { key: "mediaType", label: "Type", width: 6 },
          { key: "state", label: "Status", width: 12 },
          { key: "createdAt", label: "Created", width: 20 },
        ]);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("get-transcript")
    .alias("transcript")
    .description("Get transcript for a media file")
    .argument("<mediaId>", "Media file ID")
    .option("--json", "Output raw JSON")
    .option("--plain", "Output plain text only (no timestamps)")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get(`/v1/media/transcript/${mediaId}`);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        if (opts.plain) {
          const segments = data?.transcript ?? data ?? [];
          for (const seg of segments) {
            console.log(seg.text ?? "");
          }
          return;
        }

        // Formatted output with speaker labels and timestamps
        const segments = data?.transcript ?? data ?? [];
        let lastSpeaker = "";
        for (const seg of segments) {
          const speaker = seg.speakerId ?? "?";
          const start = seg.instances?.[0]?.start ?? "";
          const text = seg.text ?? "";
          if (speaker !== lastSpeaker) {
            console.log(`\n[Speaker ${speaker}] ${start}`);
            lastSpeaker = speaker;
          }
          process.stdout.write(text + " ");
        }
        console.log();
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("get-insights")
    .alias("insights")
    .description("Get AI-generated insights for a media file")
    .argument("<mediaId>", "Media file ID")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get(`/v1/media/insight/${mediaId}`);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        // Pretty print key insight categories
        if (data?.summary) {
          console.log("── Summary ──");
          console.log(data.summary + "\n");
        }

        const categories = [
          "keywords",
          "topics",
          "people",
          "locations",
          "brands",
          "sentiment",
        ];
        for (const cat of categories) {
          const items = data?.[cat];
          if (items && Array.isArray(items) && items.length > 0) {
            console.log(`── ${cat.charAt(0).toUpperCase() + cat.slice(1)} ──`);
            for (const item of items.slice(0, 20)) {
              const name = typeof item === "string" ? item : item.name ?? item.text ?? JSON.stringify(item);
              console.log(`  ${name}`);
            }
            if (items.length > 20) console.log(`  ... and ${items.length - 20} more`);
            console.log();
          }
        }

        if (data?.sentiment && !Array.isArray(data.sentiment)) {
          console.log("── Sentiment ──");
          printJson(data.sentiment);
          console.log();
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("upload")
    .description("Upload media from a URL")
    .argument("<url>", "Publicly accessible media URL")
    .option("-n, --name <name>", "Display name")
    .option("-t, --type <type>", "Media type (audio or video)", "audio")
    .option("-l, --language <lang>", "Source language (BCP-47)", "en-US")
    .option("-f, --folder <id>", "Destination folder ID")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--wait", "Wait for processing to complete")
    .option("--json", "Output raw JSON")
    .action(async (url: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const body: Record<string, unknown> = {
          name: opts.name ?? url.split("/").pop()?.split("?")[0] ?? "Upload",
          url,
          mediaType: opts.type,
          sourceLanguage: opts.language,
        };
        if (opts.folder) body.folderId = opts.folder;
        if (opts.tags) body.tags = opts.tags;

        const res = await client.post("/v1/media/upload", body);
        const data = res.data?.data;

        if (opts.json && !opts.wait) {
          printJson(data);
          return;
        }

        const mediaId = data?.mediaId;
        printSuccess(`Uploaded: ${mediaId} (state: ${data?.state})`);

        if (opts.wait && mediaId) {
          process.stdout.write("Processing");
          let status = data?.state;
          while (status !== "processed" && status !== "failed") {
            await new Promise((r) => setTimeout(r, 5000));
            process.stdout.write(".");
            const statusRes = await client.get(`/v1/media/status/${mediaId}`);
            status = statusRes.data?.data?.state;
          }
          console.log();
          if (status === "processed") {
            printSuccess(`Done! Media ${mediaId} is ready.`);
          } else {
            printError(`Processing failed for ${mediaId}`);
            process.exit(1);
          }
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("export")
    .description("Export media transcript/insights")
    .argument("<mediaId>", "Media file ID")
    .option(
      "-f, --format <type>",
      "Export format (pdf, docx, srt, vtt, txt, csv, md)",
      "txt"
    )
    .option("--speakers", "Include speaker names")
    .option("--timestamps", "Include timestamps")
    .option("--redacted", "Apply PII redaction")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const params: Record<string, boolean> = {};
        if (opts.speakers) params.isSpeakerNames = true;
        if (opts.timestamps) params.isTimeStamps = true;
        if (opts.redacted) params.isRedacted = true;

        const res = await client.post(
          `/v1/media/export/${mediaId}/${opts.format}`,
          null,
          { params }
        );

        if (opts.json) {
          printJson(res.data);
        } else {
          printJson(res.data?.data ?? res.data);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("status")
    .description("Check processing status of a media file")
    .argument("<mediaId>", "Media file ID")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get(`/v1/media/status/${mediaId}`);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        console.log(`Name:     ${data?.name ?? "—"}`);
        console.log(`Status:   ${data?.state ?? "—"}`);
        console.log(`Type:     ${data?.mediaType ?? "—"}`);
        const dur = data?.duration;
        const durStr = dur?.inSecond ? `${Math.round(dur.inSecond)}s` : typeof dur === "number" ? `${Math.round(dur)}s` : "—";
        console.log(`Duration: ${durStr}`);
        console.log(`Created:  ${data?.createdAt ?? "—"}`);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Text commands ──────────────────────────────────────────────────

  program
    .command("create-text")
    .description("Create a text note for AI analysis")
    .argument("<name>", "Note title")
    .option("-t, --text <text>", "Text content (or pipe via stdin)")
    .option("-f, --folder <id>", "Folder ID")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output raw JSON")
    .action(async (name: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        let text = opts.text;
        // Read from stdin if no text provided and stdin is piped
        if (!text && !process.stdin.isTTY) {
          const chunks: Buffer[] = [];
          for await (const chunk of process.stdin) {
            chunks.push(chunk);
          }
          text = Buffer.concat(chunks).toString("utf-8").trim();
        }

        if (!text) {
          printError("Provide text via --text or pipe via stdin");
          process.exit(1);
        }

        const body: Record<string, unknown> = { name, text, rawText: text };
        if (opts.folder) body.folderId = opts.folder;
        if (opts.tags) body.tags = opts.tags;

        const res = await client.post("/v1/text/create", body);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Created text note: ${data?.mediaId ?? data?._id}`);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Folder commands ────────────────────────────────────────────────

  program
    .command("list-folders")
    .alias("folders")
    .description("List all folders")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get("/v1/folder", {
          params: { page: 0, pageSize: 100, sortBy: "createdAt:desc" },
        });
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        const folders = Array.isArray(data) ? data : data?.folderList ?? data?.folders ?? [];
        printTable(folders, [
          { key: "_id", label: "ID", width: 14 },
          { key: "name", label: "Name", width: 40 },
          { key: "createdAt", label: "Created", width: 20 },
        ]);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Magic Prompt ───────────────────────────────────────────────────

  program
    .command("ask")
    .description("Ask an AI question about a media file")
    .argument("<mediaId>", "Media file ID")
    .argument("<prompt>", "Your question")
    .option("--assistant <type>", "Assistant type (general, researcher, marketer, sales, recruiter)", "general")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, prompt: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.post("/v1/prompt", {
          mediaIds: [mediaId],
          prompt,
          assistantType: opts.assistant,
        });
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          console.log(data?.answer ?? data?.message ?? JSON.stringify(data, null, 2));
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Schedule meeting ───────────────────────────────────────────────

  program
    .command("schedule-meeting")
    .description("Schedule AI assistant to join a meeting")
    .argument("<url>", "Meeting URL (Zoom, Meet, Teams)")
    .option("-t, --title <title>", "Meeting title")
    .option("-d, --date <datetime>", "Meeting date/time (ISO 8601, omit to join now)")
    .option("-l, --language <lang>", "Meeting language", "en-US")
    .option("--json", "Output raw JSON")
    .action(async (url: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const body: Record<string, unknown> = {
          meetingURL: url,
          title: opts.title ?? "Meeting",
          meetingLanguage: opts.language,
        };
        if (opts.date) body.meetingDate = opts.date;

        const res = await client.post(
          "/v1/meeting-assistant/events/schedule",
          body
        );
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Meeting scheduled: ${data?._id ?? "OK"}`);
          if (!opts.date) console.log("Assistant will join immediately.");
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  return program;
}
