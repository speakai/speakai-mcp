import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

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

// Interceptor: auto-retry on 401 (token expired mid-flight), max 2 retries
speakClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) {
      return Promise.reject(error);
    }
    const retryCount = originalRequest._retryCount ?? 0;

    if (error.response?.status === 401 && retryCount < 2) {
      originalRequest._retryCount = retryCount + 1;
      tokenExpiresAt = 0;
      await ensureAuthenticated();
      originalRequest.headers["x-speakai-key"] = getApiKey();
      originalRequest.headers["x-access-token"] = accessToken;
      return speakClient(originalRequest);
    }
    return Promise.reject(error);
  }
);

/**
 * Create a client with pre-existing auth — used when embedded in speak-server.
 */
export function createSpeakClient(options: {
  baseUrl: string;
  apiKey: string;
  accessToken: string;
}): AxiosInstance {
  return axios.create({
    baseURL: options.baseUrl,
    headers: {
      "Content-Type": "application/json",
      "x-speakai-key": options.apiKey,
      "x-access-token": options.accessToken,
    },
    timeout: 60_000,
  });
}

/**
 * Formats an Axios error into a human-readable string.
 */
export function formatAxiosError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const data = error.response?.data;
    const message =
      typeof data === "object" && data !== null
        ? JSON.stringify(data, null, 2)
        : String(data ?? error.message);
    return status ? `HTTP ${status}: ${message}` : `Request failed: ${message}`;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
