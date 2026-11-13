import { AsyncLocalStorage } from "node:async_hooks";
import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

export const TOOL_NAME_HEADER = "x-speakai-mcp-tool";

export type ApiRefusal = Record<string, unknown> & {
  status?: string;
  message?: string;
  userMessage?: string;
  reason?: string;
  checkoutUrl?: string;
};

interface ToolCallContext {
  toolName: string;
  refusal?: ApiRefusal;
}

const toolCallContext = new AsyncLocalStorage<ToolCallContext>();

export function runToolCall<T>(toolName: string, fn: (context: ToolCallContext) => Promise<T>): Promise<T> {
  const context: ToolCallContext = { toolName };
  return toolCallContext.run(context, () => fn(context));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFailedBody(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.status === "failed";
}

export function getApiRefusal(value: unknown): ApiRefusal | undefined {
  const fromError = axios.isAxiosError(value);
  const body: unknown = fromError ? value.response?.data : value;
  if (!isRecord(body)) return undefined;

  const hasUserMessage = typeof body.userMessage === "string";
  if (body.status === "failed" && hasUserMessage) return body as ApiRefusal;

  const httpStatus = fromError ? value.response?.status : undefined;
  const isClientError = httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500;
  if (isClientError && (hasUserMessage || typeof body.reason === "string")) return body as ApiRefusal;

  return undefined;
}

export function formatRefusal(refusal: ApiRefusal): string {
  const lead =
    (typeof refusal.userMessage === "string" && refusal.userMessage) ||
    (typeof refusal.message === "string" && refusal.message) ||
    "The request was declined.";
  return typeof refusal.checkoutUrl === "string" && refusal.checkoutUrl
    ? `${lead}\nContinue here: ${refusal.checkoutUrl}`
    : lead;
}

const instrumentedClients = new WeakSet<object>();

export function instrumentSpeakClient<T extends AxiosInstance>(client: T): T {
  if (!client?.interceptors || instrumentedClients.has(client)) return client;
  instrumentedClients.add(client);

  client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const toolName = toolCallContext.getStore()?.toolName;
    if (toolName) config.headers.set(TOOL_NAME_HEADER, toolName);
    return config;
  });

  const keepRefusal = (value: unknown) => {
    const context = toolCallContext.getStore();
    const refusal = getApiRefusal(value);
    if (context && refusal) context.refusal = refusal;
  };

  client.interceptors.response.use(
    (response) => {
      if (!isFailedBody(response.data)) return response;
      keepRefusal(response.data);
      const message = getApiRefusal(response.data)
        ? formatRefusal(response.data)
        : String(response.data.message ?? "The API reported that the request failed.");
      return Promise.reject(
        new axios.AxiosError(message, "ERR_BAD_RESPONSE", response.config, response.request, response)
      );
    },
    (error) => {
      keepRefusal(error);
      return Promise.reject(error);
    }
  );

  return client;
}

// Read lazily so CLI config can set env vars before first use
function getBaseUrl(): string {
  return process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
}
function getApiKey(): string {
  return process.env.SPEAK_API_KEY ?? "";
}

/**
 * Token state — managed automatically.
 */
let accessToken = process.env.SPEAK_ACCESS_TOKEN ?? "";
let refreshToken = "";
let tokenExpiresAt = 0;

/**
 * Fetch a new access token using the API key.
 */
async function authenticate(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("SPEAK_API_KEY is not set. Run 'speakai-mcp config set-key' or set the environment variable.");
  }

  try {
    const res = await axios.post(
      `${getBaseUrl()}/v1/auth/accessToken`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": apiKey,
        },
      }
    );

    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? "";
      tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      process.stderr.write("[speakai-mcp] Authenticated successfully\n");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[speakai-mcp] Authentication failed: ${message}\n`);
    throw new Error(`Authentication failed: ${message}`);
  }
}

/**
 * Refresh the access token using the refresh token.
 */
async function refreshAccessToken(): Promise<void> {
  if (!refreshToken) {
    return authenticate();
  }

  try {
    const res = await axios.post(
      `${getBaseUrl()}/v1/auth/refreshToken`,
      { refreshToken },
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": getApiKey(),
          "x-access-token": accessToken,
        },
      }
    );

    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? refreshToken;
      tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      process.stderr.write("[speakai-mcp] Token refreshed\n");
    }
  } catch {
    return authenticate();
  }
}

/**
 * Ensure we have a valid access token before each request.
 */
async function ensureAuthenticated(): Promise<void> {
  if (!accessToken || Date.now() >= tokenExpiresAt) {
    if (accessToken && refreshToken) {
      await refreshAccessToken();
    } else {
      await authenticate();
    }
  }
}

/**
 * Default client — used in STDIO and CLI modes. Auto-manages tokens.
 * baseURL is set lazily on first request via interceptor.
 */
export const speakClient = axios.create({
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

// Interceptor: set baseURL + inject auth headers before every request
speakClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    config.baseURL = getBaseUrl();
    await ensureAuthenticated();
    config.headers.set("x-speakai-key", getApiKey());
    config.headers.set("x-access-token", accessToken);
    return config;
  }
);

// Interceptor: auto-retry on 401 (token expired) and 429 (rate limit), max 3 retries
speakClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }
    const retryCount = originalRequest._retryCount ?? 0;

    // 401 — token expired mid-flight, refresh and retry
    if (error.response?.status === 401 && retryCount < 2) {
      originalRequest._retryCount = retryCount + 1;
      tokenExpiresAt = 0;
      await ensureAuthenticated();
      originalRequest.headers["x-speakai-key"] = getApiKey();
      originalRequest.headers["x-access-token"] = accessToken;
      return speakClient(originalRequest);
    }

    // 429 — rate limited, exponential backoff with Retry-After support
    if (error.response?.status === 429 && retryCount < 3) {
      const retryAfter = error.response.headers["retry-after"];
      const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : Math.pow(2, retryCount + 1);
      const delayMs = (Number.isFinite(delaySeconds) ? delaySeconds : 2) * 1000;
      process.stderr.write(`[speakai-mcp] Rate limited, retrying in ${delayMs / 1000}s...\n`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      originalRequest._retryCount = retryCount + 1;
      return speakClient(originalRequest);
    }

    return Promise.reject(error);
  }
);

instrumentSpeakClient(speakClient);

/**
 * Create a client with pre-existing auth — used when embedded in the API server.
 */
export function createSpeakClient(options: {
  baseUrl: string;
  apiKey: string;
  accessToken: string;
}): AxiosInstance {
  return instrumentSpeakClient(
    axios.create({
      baseURL: options.baseUrl,
      headers: {
        "Content-Type": "application/json",
        "x-speakai-key": options.apiKey,
        "x-access-token": options.accessToken,
      },
      timeout: 60_000,
    })
  );
}

/**
 * Formats an Axios error into a human-readable string.
 *
 * Sensitive auth material (tokens, cookies, API keys) is redacted before
 * the message reaches MCP tool output — that text lands in the model's
 * context window and may be visible to the user, so it must never carry
 * Authorization headers, Set-Cookie values, or anything matching
 * common secret patterns.
 */
const SENSITIVE_KEY_PATTERN = /(token|secret|password|cookie|authorization|jwt|apikey|api[_-]?key|bearer|signature)/i;
const MAX_STRING_LEN = 500;

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") {
    return value.length > MAX_STRING_LEN ? value.slice(0, MAX_STRING_LEN) + "…" : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => redactValue(v, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY_PATTERN.test(k) ? "[redacted]" : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function formatAxiosError(error: unknown): string {
  const refusal = getApiRefusal(error);
  if (refusal) return formatRefusal(refusal);
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const safe = redactValue(data);
    const message =
      typeof safe === "object" && safe !== null
        ? JSON.stringify(safe, null, 2)
        : String(safe ?? error.message);
    return status ? `HTTP ${status}: ${message}` : `Request failed: ${message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
