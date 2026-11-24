import { getLocale } from "./i18n";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  /** body: the whole error answer, for the few errors that carry details (e.g. which parts are protected). */
  constructor(public readonly status: number, message: string, public readonly body: unknown = null) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Wakes the sleeping API from the visitor's browser. The host wakes a free service for a browser request but did not for the
 * site server's own requests, so the proxy passes the address and the browser asks it once, without reading the answer.
 */
let waking: Promise<void> | null = null;
function wake(url: string): Promise<void> {
  if (typeof window === "undefined" || !/^https:\/\//.test(url)) return Promise.resolve();
  waking ??= fetch(url, { mode: "no-cors", cache: "no-store", credentials: "omit" }).then(() => undefined, () => undefined).finally(() => { setTimeout(() => { waking = null; }, 30_000); });
  return waking;
}

export async function api<T>(path: string, init: RequestInit = {}, wakeTries = 3): Promise<T> {
  return (await request<T>(path, init, wakeTries))?.data as T;
}

/** For list endpoints with a cursor: the data and the meta of a { data, meta } response. */
export async function apiPage<T>(path: string, init: RequestInit = {}): Promise<{ data: T; meta: { nextCursor: string | null } }> {
  const payload = await request<T>(path, init, 3);
  return { data: payload?.data as T, meta: { nextCursor: payload?.meta?.nextCursor ?? null } };
}

type Payload<T> = { data?: T; meta?: { nextCursor?: string | null }; message?: string; code?: string; wake?: string } | null;

async function request<T>(path: string, init: RequestInit, wakeTries: number): Promise<Payload<T>> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept-Language")) headers.set("Accept-Language", getLocale());
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => null) as Payload<T>;
  if (response.status === 503 && payload?.message === "API_WAKING_UP" && typeof payload.wake === "string") {
    await wake(payload.wake);
    // A read is asked again once the API is up; a write is not, as the person decides whether to repeat it.
    const method = (init.method ?? "GET").toUpperCase();
    if (wakeTries > 0 && (method === "GET" || method === "HEAD")) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      return request<T>(path, init, wakeTries - 1);
    }
  }
  if (!response.ok) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.code === "string"
        ? payload.code
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, payload);
  }
  return payload;
}
