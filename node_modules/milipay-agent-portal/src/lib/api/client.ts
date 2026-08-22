const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  authToken?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, authToken } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(message || "Request failed", res.status);
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, authToken?: string | null) =>
    request<T>(path, { method: "GET", authToken }),
  post: <T>(path: string, body?: unknown, authToken?: string | null) =>
    request<T>(path, { method: "POST", body, authToken }),
  patch: <T>(path: string, body?: unknown, authToken?: string | null) =>
    request<T>(path, { method: "PATCH", body, authToken }),
  del: <T>(path: string, authToken?: string | null) =>
    request<T>(path, { method: "DELETE", authToken }),
};