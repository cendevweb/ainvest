import "server-only";

/** Lit une variable d'environnement obligatoire, avec un message clair si elle manque. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name}. Voir .env.example.`);
  }
  return value;
}

export function appUrl(): string {
  return requireEnv("APP_URL").replace(/\/$/, "");
}

export function model(): string {
  return process.env.AINVEST_MODEL || "claude-opus-5-5";
}

export const FINARY_MCP_URL = "https://public-api.finary.com/mcp";
