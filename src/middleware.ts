import { NextResponse, type NextRequest } from "next/server";

// Le middleware tourne sur l'edge runtime : il ne vérifie que la présence du cookie.
// La signature est vérifiée côté serveur (pages et routes API) via lib/auth.
const PUBLIC = ["/login", "/api/login", "/api/cron/daily", "/oauth/client-metadata.json"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p) || pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }
  if (!req.cookies.get("ainvest_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
