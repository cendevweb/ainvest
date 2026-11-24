import { NextResponse, type NextRequest } from "next/server";

// Le middleware tourne sur l'edge runtime : il ne vérifie que la présence du cookie.
// La signature est vérifiée côté serveur (pages et routes API) via lib/auth.
const PUBLIC = ["/login", "/api/login", "/api/cron/daily"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // /api/mcp/<jeton> vérifie lui-même son jeton secret.
  if (PUBLIC.some((p) => pathname === p) || pathname.startsWith("/api/mcp/") || pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/apple-icon.png") {
    return NextResponse.next();
  }
  if (!req.cookies.get("ainvest_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
