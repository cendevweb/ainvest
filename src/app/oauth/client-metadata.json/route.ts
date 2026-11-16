import { clientMetadata } from "@/lib/finary-oauth";

// Document de métadonnées client (CIMD) : son URL sert d'identifiant OAuth auprès de Finary.
export async function GET() {
  return Response.json(clientMetadata(), { headers: { "cache-control": "public, max-age=3600" } });
}
