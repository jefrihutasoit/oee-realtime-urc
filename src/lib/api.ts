/** Defaults to "/api" on the page's own host, which Next proxies to the backend (see next.config.ts). */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

/** Calls the backend (be-realtime-urc). Errors carry the backend's `{ error }` message. */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error(`Cannot reach backend at ${API_URL}`);
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `API error ${res.status}: ${path}`);
  return body as T;
}

/**
 * Turns a backend file path such as "/uploads/skus/x.jpg" into a URL on the backend host,
 * or leaves it relative when the backend is proxied on this host.
 */
export function assetUrl(path: string | null): string | null {
  if (!path || !/^https?:/.test(API_URL) || /^(data:|https?:)/.test(path)) return path;
  return new URL(path, API_URL).toString();
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}
