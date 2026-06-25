export class ServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

const cache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function apiGet<T>(path: string, bustCache = false): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;

  if (!bustCache) {
    const hit = cache.get(url);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ServiceError(message, response.status);
  }

  const data = await response.json() as T;
  cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export function bustApiCache(path?: string) {
  if (path) {
    cache.delete((process.env.NEXT_PUBLIC_API_BASE_URL ?? "") + path);
  } else {
    cache.clear();
  }
}

async function apiMutate<T>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path}`;

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const parsed = await response.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // ignore parse errors
    }
    throw new ServiceError(message, response.status);
  }

  return response.json() as Promise<T>;
}

export const apiPost = <T>(path: string, body: unknown) => apiMutate<T>("POST", path, body);
export const apiPatch = <T>(path: string, body: unknown) => apiMutate<T>("PATCH", path, body);
export const apiDelete = <T>(path: string) => apiMutate<T>("DELETE", path);
