// Small fetch wrapper. Cookies are HttpOnly so the session is never exposed to page scripts.
export class ApiFail extends Error {
  constructor(public status: number, public code: string, message: string, public data: any) {
    super(message);
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: body !== undefined ? { "content-type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFail(0, "OFFLINE", "No internet connection", null);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFail(res.status, data.error || "ERROR", data.message || "Something went wrong", data);
  return data as T;
}

export const get = <T = any>(p: string) => api<T>("GET", p);
export const post = <T = any>(p: string, b?: unknown) => api<T>("POST", p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>("PUT", p, b ?? {});
export const del = <T = any>(p: string) => api<T>("DELETE", p);
