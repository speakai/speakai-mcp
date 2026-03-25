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
import { getMimeType, isVideoFile, detectMediaType } from "../media-utils.js";

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
    .version("2.0.0");

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
    .command("test")
    .description("Validate your API key and test connectivity")
    .action(async () => {
      const key = resolveApiKey();
      resolveBaseUrl();
      if (!key) {
        printError('No API key configured. Run "speakai-mcp config set-key" or set SPEAK_API_KEY.');
        process.exit(1);
      }
      try {
        const axios = (await import("axios")).default;
        const baseUrl = process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
        const res = await axios.post(
          `${baseUrl}/v1/auth/accessToken`,
          {},
          { headers: { "Content-Type": "application/json", "x-speakai-key": key } }
        );
        if (res.data?.data?.accessToken) {
          printSuccess("API key is valid. Connection successful.");
        } else {
          printError("Unexpected response — key may be invalid.");
          process.exit(1);
        }
      } catch (err: any) {
        printError(`Authentication failed: ${err.response?.data?.message ?? err.message}`);
        process.exit(1);
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

  // ── Init (onboarding) ────────────────────────────────────────────

  program
    .command("init")
    .description("Interactive setup — configure API key and auto-detect MCP clients")
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string) =>
        new Promise<string>((resolve) => rl.question(q, (a) => resolve(a.trim())));

      console.log("\n  Speak AI MCP Server — Setup\n");

      // 1. API key
      const existingKey = resolveApiKey();
      let key = existingKey;
      if (existingKey) {
        console.log(`  API key: ${existingKey.slice(0, 8)}... (already configured)`);
        const change = await ask("  Change it? (y/N) ");
        if (change.toLowerCase() === "y") key = "";
      }
      if (!key) {
        key = await ask("  Enter your Speak AI API key: ");
        if (!key) {
          printError("No key provided.");
          rl.close();
          process.exit(1);
        }
      }

      // 2. Validate
      process.stdout.write("  Validating...");
      try {
        const axios = (await import("axios")).default;
        const baseUrl = process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
        const res = await axios.post(
          `${baseUrl}/v1/auth/accessToken`,
          {},
          { headers: { "Content-Type": "application/json", "x-speakai-key": key } }
        );
        if (!res.data?.data?.accessToken) throw new Error("Invalid response");
        console.log(" valid!\n");
      } catch {
        console.log(" failed!");
        printError("API key is invalid. Get your key at https://app.speakai.co/developers/apikeys");
        rl.close();
        process.exit(1);
      }

      // 3. Save
      const cfg = loadConfig();
      cfg.apiKey = key;
      saveConfig(cfg);
      printSuccess(`API key saved to ${getConfigPath()}`);

      // 4. Auto-detect MCP clients
      const os = await import("os");
      const fs = await import("fs");
      const pathMod = await import("path");
      const home = os.homedir();

      const clients: { name: string; configPath: string; exists: boolean }[] = [
        {
          name: "Claude Desktop",
          configPath: process.platform === "darwin"
            ? pathMod.join(home, "Library/Application Support/Claude/claude_desktop_config.json")
            : pathMod.join(home, "AppData/Roaming/Claude/claude_desktop_config.json"),
          exists: false,
        },
        {
          name: "Cursor",
          configPath: pathMod.join(home, ".cursor/mcp.json"),
          exists: false,
        },
        {
          name: "Windsurf",
          configPath: pathMod.join(home, ".windsurf/mcp.json"),
          exists: false,
        },
        {
          name: "VS Code",
          configPath: pathMod.join(home, ".vscode/mcp.json"),
          exists: false,
        },
      ];

      // Check which config dirs exist
      for (const c of clients) {
        const dir = pathMod.dirname(c.configPath);
        c.exists = fs.existsSync(dir);
      }

      const detected = clients.filter((c) => c.exists);
      if (detected.length > 0) {
        console.log("\n  Detected MCP clients:");
        for (const c of detected) {
          console.log(`    - ${c.name}`);
        }

        const configure = await ask("\n  Auto-configure MCP server in these clients? (Y/n) ");
        if (configure.toLowerCase() !== "n") {
          const mcpEntry = {
            command: "npx",
            args: ["-y", "@speakai/mcp-server"],
            env: { SPEAK_API_KEY: key },
          };

          for (const c of detected) {
            try {
              let config: Record<string, unknown> = {};
              if (fs.existsSync(c.configPath)) {
                config = JSON.parse(fs.readFileSync(c.configPath, "utf-8"));
              }
              const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
              servers["speak-ai"] = mcpEntry;
              config.mcpServers = servers;

              const dir = pathMod.dirname(c.configPath);
              if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
              fs.writeFileSync(c.configPath, JSON.stringify(config, null, 2) + "\n");
              printSuccess(`Configured ${c.name}: ${c.configPath}`);
            } catch (err: any) {
              printError(`Failed to configure ${c.name}: ${err.message}`);
            }
          }
        }
      }

      // 5. Claude Code hint
      console.log("\n  For Claude Code, run:");
      console.log(`    export SPEAK_API_KEY="your-api-key"`);
      console.log("    claude mcp add speak-ai -- npx -y @speakai/mcp-server\n");

      rl.close();
      printSuccess("Setup complete! You're ready to go.");
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
    .description("Upload media from a URL or local file")
    .argument("<source>", "Media URL or local file path")
    .option("-n, --name <name>", "Display name")
    .option("-t, --type <type>", "Media type (audio or video)")
    .option("-l, --language <lang>", "Source language (BCP-47)", "en-US")
    .option("-f, --folder <id>", "Destination folder ID")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--wait", "Wait for processing to complete")
    .option("--json", "Output raw JSON")
    .action(async (source: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const fs = await import("fs");
        const pathMod = await import("path");
        const isLocalFile = fs.existsSync(source);

        let mediaId: string | undefined;
        let state: string | undefined;

        if (isLocalFile) {
          // Local file upload via signed URL
          const filename = pathMod.basename(source);
          const isVideo = isVideoFile(source);
          const mediaType = opts.type ?? detectMediaType(source);
          const mimeType = getMimeType(source);

          // Get signed URL
          const signedRes = await client.get("/v1/media/upload/signedurl", {
            params: { isVideo, filename, mimeType },
          });
          const signedData = signedRes.data?.data;
          const uploadUrl = signedData?.signedUrl ?? signedData?.url;

          if (!uploadUrl) {
            printError("Could not get signed upload URL");
            process.exit(1);
          }

          // Upload to S3
          process.stdout.write("Uploading...");
          const fileBuffer = fs.readFileSync(source);
          const axios = (await import("axios")).default;
          await axios.put(uploadUrl, fileBuffer, {
            headers: { "Content-Type": mimeType },
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          });
          console.log(" done");

          // Create media entry
          const createBody: Record<string, unknown> = {
            name: opts.name ?? filename,
            url: uploadUrl.split("?")[0],
            mediaType,
            sourceLanguage: opts.language,
          };
          if (opts.folder) createBody.folderId = opts.folder;
          if (opts.tags) createBody.tags = opts.tags;

          const res = await client.post("/v1/media/upload", createBody);
          const data = res.data?.data;
          mediaId = data?.mediaId;
          state = data?.state;
        } else {
          // URL upload
          const body: Record<string, unknown> = {
            name: opts.name ?? source.split("/").pop()?.split("?")[0] ?? "Upload",
            url: source,
            mediaType: opts.type ?? "audio",
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

          mediaId = data?.mediaId;
          state = data?.state;
        }

        printSuccess(`Uploaded: ${mediaId} (state: ${state})`);

        if (opts.wait && mediaId) {
          process.stdout.write("Processing");
          let attempts = 0;
          const maxAttempts = 120; // 10 minutes max
          while (state !== "processed" && state !== "failed" && attempts < maxAttempts) {
            await new Promise((r) => setTimeout(r, 5000));
            process.stdout.write(".");
            const statusRes = await client.get(`/v1/media/status/${mediaId}`);
            state = statusRes.data?.data?.state;
            attempts++;
          }
          console.log();
          if (state === "processed") {
            printSuccess(`Done! Media ${mediaId} is ready.`);
          } else if (state === "failed") {
            printError(`Processing failed for ${mediaId}`);
            process.exit(1);
          } else {
            printError(`Timeout: ${mediaId} still processing (state: ${state}). Check with: speakai-mcp status ${mediaId}`);
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
    .description("Ask an AI question about media files, folders, or your entire workspace")
    .argument("<prompt>", "Your question")
    .argument("[mediaId]", "Optional media file ID (shorthand for -m <id>)")
    .option("-m, --media <ids...>", "Media file IDs to query (space-separated)")
    .option("-f, --folder <ids...>", "Folder IDs to scope the query to")
    .option("--assistant <type>", "Assistant type (general, researcher, marketer, sales, recruiter)", "general")
    .option("--speakers <ids...>", "Filter by speaker IDs")
    .option("--tags <tags...>", "Filter by tags")
    .option("--from <date>", "Start date (ISO 8601)")
    .option("--to <date>", "End date (ISO 8601)")
    .option("--individual", "Process each media file separately")
    .option("--continue <promptId>", "Continue an existing conversation")
    .option("--json", "Output raw JSON")
    .action(async (prompt: string, mediaId: string | undefined, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const body: Record<string, unknown> = {
          prompt,
          assistantType: opts.assistant,
        };
        // Support both `ask <prompt> <mediaId>` and `ask <prompt> -m <ids...>`
        if (mediaId) body.mediaIds = [mediaId];
        if (opts.media) body.mediaIds = opts.media;
        if (opts.folder) body.folderIds = opts.folder;
        if (opts.speakers) body.speakers = opts.speakers;
        if (opts.tags) body.tags = opts.tags;
        if (opts.from) body.startDate = opts.from;
        if (opts.to) body.endDate = opts.to;
        if (opts.individual) body.isIndividualPrompt = true;
        if (opts.continue) body.promptId = opts.continue;

        const res = await client.post("/v1/prompt", body);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          console.log(data?.answer ?? data?.message ?? JSON.stringify(data, null, 2));
          if (data?.promptId) {
            console.log(`\n(conversation: ${data.promptId} — use --continue to follow up)`);
          }
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("chat-history")
    .description("List past Magic Prompt conversations")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get("/v1/prompt/history");
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        const items = Array.isArray(data) ? data : data?.prompts ?? data?.history ?? [];
        printTable(items, [
          { key: "_id", label: "ID", width: 26 },
          { key: "title", label: "Title", width: 40 },
          { key: "createdAt", label: "Created", width: 20 },
        ]);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Search ───────────────────────────────────────────────────────────

  program
    .command("search")
    .description("Search across all media transcripts, insights, and metadata")
    .argument("<query>", "Search query")
    .option("--from <date>", "Start date (ISO 8601, defaults to start of month)")
    .option("--to <date>", "End date (ISO 8601, defaults to now)")
    .option("--json", "Output raw JSON")
    .action(async (query: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const body: Record<string, unknown> = { query };
        if (opts.from) body.startDate = opts.from;
        if (opts.to) body.endDate = opts.to;

        const res = await client.post("/v1/analytics/search", body);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        // Attempt to display results as a table
        const items = Array.isArray(data) ? data : data?.results ?? data?.mediaNodes ?? [];
        if (Array.isArray(items) && items.length > 0) {
          console.log(`Found ${items.length} result(s)\n`);
          printTable(items, [
            { key: "_id", label: "ID", width: 14 },
            { key: "name", label: "Name", width: 35 },
            { key: "mediaType", label: "Type", width: 6 },
            { key: "tags", label: "Tags", width: 20 },
          ]);
        } else {
          printJson(data);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Clips ───────────────────────────────────────────────────────────

  program
    .command("clips")
    .description("List clips, optionally for a specific media file")
    .option("-m, --media <ids...>", "Filter by source media IDs")
    .option("-f, --folder <id>", "Filter by folder ID")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const params: Record<string, unknown> = {};
        if (opts.media) params.mediaIds = opts.media;
        if (opts.folder) params.folderId = opts.folder;

        const res = await client.get("/v1/clips", { params });
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        const items = Array.isArray(data) ? data : data?.clips ?? [];
        printTable(items, [
          { key: "clipId", label: "ID", width: 14 },
          { key: "title", label: "Title", width: 30 },
          { key: "state", label: "Status", width: 12 },
          { key: "duration", label: "Duration", width: 10 },
          { key: "createdAt", label: "Created", width: 20 },
        ]);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("clip")
    .description("Create a clip from a media file")
    .argument("<mediaId>", "Source media file ID")
    .requiredOption("--start <seconds>", "Start time in seconds")
    .requiredOption("--end <seconds>", "End time in seconds")
    .option("-n, --name <title>", "Clip title", "Clip")
    .option("-t, --type <type>", "Media type (audio or video)", "audio")
    .option("--description <text>", "Clip description")
    .option("--tags <tags...>", "Tags for the clip")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const body: Record<string, unknown> = {
          title: opts.name,
          mediaType: opts.type,
          timeRanges: [
            {
              mediaId,
              startTime: parseFloat(opts.start),
              endTime: parseFloat(opts.end),
            },
          ],
        };
        if (opts.description) body.description = opts.description;
        if (opts.tags) body.tags = opts.tags;

        const res = await client.post("/v1/clips", body);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Clip created: ${data?.clipId ?? data?._id ?? "OK"} (processing...)`);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  // ── Media CRUD ──────────────────────────────────────────────────────

  program
    .command("delete")
    .description("Delete a media file")
    .argument("<mediaId>", "Media file ID to delete")
    .action(async (mediaId: string) => {
      requireApiKey();
      const client = await getClient();
      try {
        await client.delete(`/v1/media/${mediaId}`);
        printSuccess(`Deleted: ${mediaId}`);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("update")
    .description("Update media metadata")
    .argument("<mediaId>", "Media file ID to update")
    .option("-n, --name <name>", "New display name")
    .option("-d, --description <text>", "New description")
    .option("--tags <tags...>", "New tags")
    .option("-f, --folder <id>", "Move to folder ID")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const body: Record<string, unknown> = {};
        if (opts.name) body.name = opts.name;
        if (opts.description) body.description = opts.description;
        if (opts.tags) body.tags = opts.tags;
        if (opts.folder) body.folderId = opts.folder;

        if (Object.keys(body).length === 0) {
          printError("Provide at least one field to update (--name, --description, --tags, --folder)");
          process.exit(1);
        }

        const res = await client.put(`/v1/media/${mediaId}`, body);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Updated: ${mediaId}`);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("create-folder")
    .description("Create a new folder")
    .argument("<name>", "Folder name")
    .option("--json", "Output raw JSON")
    .action(async (name: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.post("/v1/folder", { name });
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          printSuccess(`Folder created: ${data?._id ?? "OK"} — ${name}`);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("favorites")
    .description("Toggle favorite status for a media file")
    .argument("<mediaId>", "Media file ID")
    .action(async (mediaId: string) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.post("/v1/media/favorites", { mediaId });
        const data = res.data?.data;
        printSuccess(data?.message ?? `Favorite toggled for ${mediaId}`);
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("stats")
    .description("Show workspace media statistics")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get("/v1/media/statistics");
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
          return;
        }

        // Human-readable stats
        const total = data?.totalCount ?? data?.total ?? "—";
        const audio = data?.audioCount ?? data?.audio ?? "—";
        const video = data?.videoCount ?? data?.video ?? "—";
        const text = data?.textCount ?? data?.text ?? "—";
        console.log(`Total media:  ${total}`);
        console.log(`  Audio:      ${audio}`);
        console.log(`  Video:      ${video}`);
        console.log(`  Text:       ${text}`);
        if (data?.totalDuration) {
          const hrs = Math.round((data.totalDuration / 3600) * 10) / 10;
          console.log(`Duration:     ${hrs}h total`);
        }
        if (data?.totalSize) {
          const gb = Math.round((data.totalSize / (1024 * 1024 * 1024)) * 100) / 100;
          console.log(`Storage:      ${gb} GB`);
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("languages")
    .description("List supported transcription languages")
    .option("--json", "Output raw JSON")
    .action(async (opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get("/v1/media/supportedLanguages");
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          const langs = Array.isArray(data) ? data : data?.languages ?? [];
          for (const lang of langs) {
            const name = typeof lang === "string" ? lang : lang.name ?? lang.code ?? JSON.stringify(lang);
            console.log(`  ${name}`);
          }
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("captions")
    .description("Get captions for a media file")
    .argument("<mediaId>", "Media file ID")
    .option("--json", "Output raw JSON")
    .action(async (mediaId: string, opts) => {
      requireApiKey();
      const client = await getClient();
      try {
        const res = await client.get(`/v1/media/caption/${mediaId}`);
        const data = res.data?.data;

        if (opts.json) {
          printJson(data);
        } else {
          const captions = Array.isArray(data) ? data : data?.captions ?? [];
          for (const cap of captions) {
            console.log(cap.text ?? cap);
          }
        }
      } catch (err: any) {
        printError(err.response?.data?.message ?? err.message);
        process.exit(1);
      }
    });

  program
    .command("reanalyze")
    .description("Re-run AI analysis on a media file with latest models")
    .argument("<mediaId>", "Media file ID")
    .action(async (mediaId: string) => {
      requireApiKey();
      const client = await getClient();
      try {
        await client.get(`/v1/media/reanalyze/${mediaId}`);
        printSuccess(`Re-analysis started for ${mediaId}`);
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
