import { jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/setup"];

/** Lichte toegangscontrole voor pagina's; API-routes controleren zelf (requireUser) en blijven 401 teruggeven. */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p)) return NextResponse.next();
  const token = req.cookies.get("adh_session")?.value;
  let ok = false;
  if (token && process.env.APP_SECRET) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.APP_SECRET), { algorithms: ["HS256"] });
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)"] };
