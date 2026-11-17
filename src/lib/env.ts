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



/** URL du connecteur MCP d'AInvest, ou null si INGEST_TOKEN n'est pas défini. */
export function connectorUrl(): string | null {
  const token = process.env.INGEST_TOKEN;
  return token && token.length >= 24 ? `${appUrl()}/api/mcp/${token}` : null;
}

/** La clé API Claude sert au brief marché du matin. */
export function apiModeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
