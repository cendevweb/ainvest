import "server-only";
import { Redis } from "@upstash/redis";

let client: Redis | null = null;

/** Client Redis (Upstash). Accepte les noms de variables de l'intégration Vercel ou d'Upstash. */
export function redis(): Redis {
  if (client) return client;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Base Redis non configurée : renseigne KV_REST_API_URL et KV_REST_API_TOKEN.");
  }
  client = new Redis({ url, token });
  return client;
}

export const keys = {
  rules: "rules",
  sessionIndex: "sessions:index",
  session: (id: string) => `session:${id}`,
  brief: (day: string) => `brief:${day}`,
  briefLatest: "brief:latest",
  budget: (month: string) => `budget:${month}`,
};
