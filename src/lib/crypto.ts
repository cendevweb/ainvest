import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requireEnv } from "./env";

function key(name: "APP_SECRET"): Buffer {
  const raw = Buffer.from(requireEnv(name), "base64");
  if (raw.length !== 32) throw new Error(`${name} doit faire 32 octets encodés en base64 (openssl rand -base64 32).`);
  return raw;
}

export function sign(value: string): string {
  return createHmac("sha256", key("APP_SECRET")).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Comparaison à longueur constante pour ne rien révéler.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
