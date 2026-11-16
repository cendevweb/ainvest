import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { appUrl, FINARY_MCP_URL } from "./env";
import { decrypt, encrypt, randomToken } from "./crypto";
import { keys, redis } from "./store";

/*
 * Client OAuth pour le serveur MCP de Finary, selon la spécification d'autorisation MCP :
 * 1. découverte des métadonnées de la ressource protégée (RFC 9728),
 * 2. découverte du serveur d'autorisation (RFC 8414 / OpenID),
 * 3. identification du client : document de métadonnées hébergé par l'instance (CIMD)
 *    si le serveur le permet, sinon enregistrement dynamique (RFC 7591),
 * 4. code d'autorisation + PKCE S256, paramètre `resource` (RFC 8707),
 * 5. jetons chiffrés en AES-256-GCM dans Redis, rafraîchis automatiquement.
 * Aucun secret client : l'instance est un client public.
 */

const ProtectedResource = z.object({
  resource: z.string().optional(),
  authorization_servers: z.array(z.string()).min(1),
  scopes_supported: z.array(z.string()).optional(),
});

const AuthServer = z.object({
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string().optional(),
  scopes_supported: z.array(z.string()).optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
  client_id_metadata_document_supported: z.boolean().optional(),
});
type AuthServer = z.infer<typeof AuthServer>;

const StoredClient = z.object({ client_id: z.string(), issuer: z.string(), mode: z.enum(["cimd", "dcr"]) });
type StoredClient = z.infer<typeof StoredClient>;

const TokenResponse = z.object({
  access_token: z.string(),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

const StoredTokens = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_at: z.number().nullable(),
  scope: z.string().optional(),
  token_endpoint: z.string(),
  client_id: z.string(),
  connected_at: z.number(),
});
type StoredTokens = z.infer<typeof StoredTokens>;

export function redirectUri(): string {
  return `${appUrl()}/api/finary/callback`;
}

export function clientMetadataUrl(): string {
  return `${appUrl()}/oauth/client-metadata.json`;
}

export function clientMetadata() {
  return {
    client_id: clientMetadataUrl(),
    client_name: "AInvest (instance personnelle)",
    client_uri: appUrl(),
    redirect_uris: [redirectUri()],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

async function getJson(url: string): Promise<unknown | null> {
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

function wellKnownCandidates(base: string, suffix: string): string[] {
  const u = new URL(base);
  const path = u.pathname.replace(/\/$/, "");
  const origin = u.origin;
  return path && path !== "/"
    ? [`${origin}/.well-known/${suffix}${path}`, `${origin}${path}/.well-known/${suffix}`, `${origin}/.well-known/${suffix}`]
    : [`${origin}/.well-known/${suffix}`];
}

async function discoverProtectedResource() {
  // 1) Le serveur MCP répond 401 avec un en-tête WWW-Authenticate qui pointe vers ses métadonnées.
  const probe = await fetch(FINARY_MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    cache: "no-store",
  }).catch(() => null);
  const header = probe?.headers.get("www-authenticate") ?? "";
  const match = header.match(/resource_metadata="([^"]+)"/);
  const candidates = [...(match ? [match[1]] : []), ...wellKnownCandidates(FINARY_MCP_URL, "oauth-protected-resource")];
  for (const url of candidates) {
    const parsed = ProtectedResource.safeParse(await getJson(url));
    if (parsed.success) return parsed.data;
  }
  throw new Error("Impossible de découvrir les métadonnées OAuth du serveur MCP Finary.");
}

async function discoverAuthServer(issuer: string): Promise<AuthServer> {
  const candidates = [
    ...wellKnownCandidates(issuer, "oauth-authorization-server"),
    ...wellKnownCandidates(issuer, "openid-configuration"),
  ];
  for (const url of candidates) {
    const parsed = AuthServer.safeParse(await getJson(url));
    if (parsed.success) return parsed.data;
  }
  throw new Error(`Serveur d'autorisation Finary introuvable (${issuer}).`);
}

async function ensureClient(as: AuthServer): Promise<StoredClient> {
  const existing = StoredClient.safeParse(await redis().get(keys.finaryClient));
  if (existing.success && existing.data.issuer === as.issuer) return existing.data;

  let client: StoredClient;
  if (as.client_id_metadata_document_supported) {
    client = { client_id: clientMetadataUrl(), issuer: as.issuer, mode: "cimd" };
  } else if (as.registration_endpoint) {
    const { client_id: _ignored, ...meta } = clientMetadata();
    const res = await fetch(as.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(meta),
    });
    if (!res.ok) throw new Error(`Enregistrement du client refusé par Finary (${res.status}).`);
    const body = z.object({ client_id: z.string() }).parse(await res.json());
    client = { client_id: body.client_id, issuer: as.issuer, mode: "dcr" };
  } else {
    throw new Error("Finary ne propose ni document de métadonnées client ni enregistrement dynamique.");
  }
  await redis().set(keys.finaryClient, client);
  return client;
}

function pkce() {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Prépare la redirection vers l'écran d'autorisation Finary. */
export async function startAuthorization(): Promise<string> {
  const prm = await discoverProtectedResource();
  const as = await discoverAuthServer(prm.authorization_servers[0]);
  if (as.code_challenge_methods_supported && !as.code_challenge_methods_supported.includes("S256")) {
    throw new Error("Le serveur Finary ne supporte pas PKCE S256.");
  }
  const client = await ensureClient(as);
  const { verifier, challenge } = pkce();
  const state = randomToken(24);
  await redis().set(
    keys.oauthState(state),
    encrypt(JSON.stringify({ verifier, token_endpoint: as.token_endpoint, client_id: client.client_id })),
    { ex: 600 },
  );
  const url = new URL(as.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("resource", prm.resource ?? FINARY_MCP_URL);
  const scopes = prm.scopes_supported ?? as.scopes_supported;
  if (scopes?.length) url.searchParams.set("scope", scopes.join(" "));
  return url.toString();
}

async function saveTokens(raw: unknown, token_endpoint: string, client_id: string, previous?: StoredTokens) {
  const t = TokenResponse.parse(raw);
  const stored: StoredTokens = {
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previous?.refresh_token,
    expires_at: t.expires_in ? Date.now() + t.expires_in * 1000 : null,
    scope: t.scope ?? previous?.scope,
    token_endpoint,
    client_id,
    connected_at: previous?.connected_at ?? Date.now(),
  };
  await redis().set(keys.finaryTokens, encrypt(JSON.stringify(stored)));
  return stored;
}

/** Échange le code reçu sur l'URL de retour contre des jetons. */
export async function completeAuthorization(code: string, state: string): Promise<void> {
  const saved = await redis().getdel<string>(keys.oauthState(state));
  if (!saved) throw new Error("Lien d'autorisation expiré ou déjà utilisé. Recommence la connexion.");
  const { verifier, token_endpoint, client_id } = JSON.parse(decrypt(saved));
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      client_id,
      code_verifier: verifier,
      resource: FINARY_MCP_URL,
    }),
  });
  if (!res.ok) throw new Error(`Échange du code refusé par Finary (${res.status}).`);
  await saveTokens(await res.json(), token_endpoint, client_id);
}

async function readTokens(): Promise<StoredTokens | null> {
  const raw = await redis().get<string>(keys.finaryTokens);
  if (!raw) return null;
  return StoredTokens.parse(JSON.parse(decrypt(raw)));
}

/** Jeton d'accès valide, rafraîchi si besoin. Null si Finary n'est pas connecté. */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await readTokens();
  if (!tokens) return null;
  const expiring = tokens.expires_at !== null && tokens.expires_at - Date.now() < 120_000;
  if (!expiring) return tokens.access_token;
  if (!tokens.refresh_token) throw new Error("Session Finary expirée : reconnecte Finary dans Paramètres.");
  const res = await fetch(tokens.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: tokens.client_id,
      resource: FINARY_MCP_URL,
    }),
  });
  if (!res.ok) throw new Error(`Rafraîchissement Finary refusé (${res.status}) : reconnecte Finary dans Paramètres.`);
  return (await saveTokens(await res.json(), tokens.token_endpoint, tokens.client_id, tokens)).access_token;
}

export async function finaryStatus(): Promise<{ connected: boolean; connectedAt?: number; expiresAt?: number | null }> {
  try {
    const t = await readTokens();
    return t ? { connected: true, connectedAt: t.connected_at, expiresAt: t.expires_at } : { connected: false };
  } catch {
    return { connected: false };
  }
}

export async function disconnectFinary(): Promise<void> {
  await redis().del(keys.finaryTokens);
}
