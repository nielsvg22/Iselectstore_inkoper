import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError, requireUser, type SessionUser } from "./auth";
import { errMsg, log } from "./log";
import { NotifyError } from "./notify/senders";
import { SsrfError } from "./security/ssrf";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

type Ctx<P> = { params: Promise<P> };

type Handler<P> = (req: Request, ctx: { user: SessionUser; params: P }) => Promise<Response | unknown>;
type RouteOpts = { admin?: boolean; public?: boolean };

function wrap<P>(fn: Handler<P>, opts: RouteOpts) {
  return async (req: Request, ctx?: Ctx<P>): Promise<Response> => {
    try {
      const user = opts.public ? (null as unknown as SessionUser) : await requireUser(req, { admin: opts.admin });
      const params = ctx?.params ? await ctx.params : ({} as P);
      const out = await fn(req, { user, params });
      return out instanceof Response ? out : json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

/** Route zonder dynamische segmenten: authenticatie + uniforme foutafhandeling. */
export function route(fn: Handler<Record<string, never>>, opts: RouteOpts = {}): (req: Request) => Promise<Response> {
  return wrap(fn, opts);
}

/** Route met dynamische segmenten (bijv. [id]). */
export function routeP<P>(fn: Handler<P>, opts: RouteOpts = {}): (req: Request, ctx: Ctx<P>) => Promise<Response> {
  return wrap(fn, opts) as (req: Request, ctx: Ctx<P>) => Promise<Response>;
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof ZodError) return json({ error: "Ongeldige invoer", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  if (e instanceof SsrfError) return json({ error: e.message }, 400);
  if (e instanceof NotifyError) return json({ error: e.message }, 400);
  if (e instanceof SyntaxError) return json({ error: "Ongeldige JSON" }, 400);
  log("error", "API-fout", { error: errMsg(e) });
  return json({ error: "Interne fout" }, 500);
}

export async function readJson<T>(req: Request, schema: { parse: (v: unknown) => T }): Promise<T> {
  const text = await req.text();
  if (text.length > 6_000_000) throw new HttpError(413, "Verzoek te groot");
  return schema.parse(text ? JSON.parse(text) : {});
}
