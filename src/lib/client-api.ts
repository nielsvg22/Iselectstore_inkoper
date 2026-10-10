"use client";

export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: Array<{ path: string; message: string }>) {
    super(message);
  }
}

/** fetch-wrapper voor client components: JSON in/uit, nette foutmeldingen. */
export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: init.method ?? (init.body !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json" }, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  } catch {
    throw new ApiError("Geen verbinding met de server", 0);
  }
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth")) {
    window.location.href = "/login";
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* geen JSON */
  }
  if (!res.ok) {
    const d = data as { error?: string; issues?: Array<{ path: string; message: string }> } | null;
    const detail = d?.issues?.length ? ` (${d.issues.map((i) => `${i.path}: ${i.message}`).join("; ")})` : "";
    throw new ApiError((d?.error ?? `Fout ${res.status}`) + detail, res.status, d?.issues);
  }
  return data as T;
}
