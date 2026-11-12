import { getLocale } from "./i18n";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  /** body: the whole error answer, for the few errors that carry details (e.g. which parts are protected). */
  constructor(public readonly status: number, message: string, public readonly body: unknown = null) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept-Language")) headers.set("Accept-Language", getLocale());
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null) as { data?: T; message?: string; code?: string } | null;
  if (!response.ok) {
    const message = typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.code === "string"
        ? payload.code
        : `Request failed (${response.status})`;
    throw new ApiError(response.status, message, payload);
  }
  return payload?.data as T;
}
