import { getToken, sessionExpired } from "@/lib/session";

/** Defaults to "/api" on the page's own host, which Next proxies to the backend (see next.config.ts). */
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

/**
 * Calls the backend (be-realtime-urc) with the session token. Errors carry the backend's `{ error }`
 * message; a rejected session signs the user out.
 */
export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error(`Cannot reach backend at ${API_URL}`);
  }

  const body = await res.json().catch(() => null);
  if (res.status === 401 && token && path !== "/auth/login") sessionExpired();
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

/** Downloads a file from the backend with the session token and saves it under the server's file name. */
export async function apiDownload(path: string, fallbackName: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    if (res.status === 401 && token) sessionExpired();
    throw new Error(body?.error ?? `Download failed (${res.status})`);
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return name;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}
