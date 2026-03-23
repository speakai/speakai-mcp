import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";

const BASE_URL = process.env.SPEAK_BASE_URL ?? "https://api.speakai.co";
const API_KEY = process.env.SPEAK_API_KEY ?? "";

if (!API_KEY && !process.env.SPEAK_MCP_LIBRARY_MODE) {
  process.stderr.write(
    "[speak-mcp] Warning: SPEAK_API_KEY is not set. All requests will fail.\n"
  );
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
  try {
    const res = await axios.post(
      `${BASE_URL}/v1/auth/accessToken`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": API_KEY,
        },
      }
    );

    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? "";
      // Tokens typically expire in 1 hour — refresh at 50 minutes
      tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      process.stderr.write("[speak-mcp] Authenticated successfully\n");
    }
  } catch (err) {
    process.stderr.write(
      `[speak-mcp] Authentication failed: ${err instanceof Error ? err.message : err}\n`
    );
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
      `${BASE_URL}/v1/auth/refreshToken`,
      { refreshToken },
      {
        headers: {
          "Content-Type": "application/json",
          "x-speakai-key": API_KEY,
          "x-access-token": accessToken,
        },
      }
    );

    if (res.data?.data?.accessToken) {
      accessToken = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken ?? refreshToken;
      tokenExpiresAt = Date.now() + 50 * 60 * 1000;
      process.stderr.write("[speak-mcp] Token refreshed\n");
    }
  } catch {
    // Refresh token expired — re-authenticate from scratch
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
 * Default client — used in STDIO mode. Auto-manages tokens using the API key.
 */
export const speakClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60_000,
});

// Interceptor: inject fresh auth headers before every request
speakClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    await ensureAuthenticated();
    config.headers.set("x-speakai-key", API_KEY);
    config.headers.set("x-access-token", accessToken);
    return config;
  }
);

// Interceptor: auto-retry on 401 (token expired mid-flight)
speakClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      error.response?.status === 401 &&
      !originalRequest._retried
    ) {
      originalRequest._retried = true;
      tokenExpiresAt = 0; // force re-auth
      await ensureAuthenticated();
      originalRequest.headers["x-speakai-key"] = API_KEY;
      originalRequest.headers["x-access-token"] = accessToken;
      return speakClient(originalRequest);
    }
    return Promise.reject(error);
  }
);

/**
 * Create a client with pre-existing auth — used when embedded in speak-server
 * where auth is already validated by middleware.
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
