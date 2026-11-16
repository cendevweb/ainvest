import "server-only";
import { cookies } from "next/headers";
import { requireEnv } from "./env";
import { safeEqual, sign } from "./crypto";

export const SESSION_COOKIE = "ainvest_session";
const MAX_AGE_S = 60 * 60 * 24 * 14; // 14 jours

function makeToken(expiresAt: number): string {
  const body = `v1.${expiresAt}`;
  return `${body}.${sign(body)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const body = `${parts[0]}.${parts[1]}`;
  if (!safeEqual(sign(body), parts[2])) return false;
  return Number(parts[1]) > Date.now();
}

export function checkPassword(candidate: string): boolean {
  return safeEqual(candidate, requireEnv("APP_PASSWORD"));
}

export async function startSession(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, makeToken(Date.now() + MAX_AGE_S * 1000), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_S,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function isLoggedIn(): Promise<boolean> {
  return verifyToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** À appeler en tête de chaque route API protégée. */
export async function assertLoggedIn(): Promise<Response | null> {
  if (await isLoggedIn()) return null;
  return Response.json({ error: "Non connecté" }, { status: 401 });
}
