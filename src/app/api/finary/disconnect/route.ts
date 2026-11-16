import { assertLoggedIn } from "@/lib/auth";
import { disconnectFinary } from "@/lib/finary-oauth";

export async function POST(req: Request) {
  const denied = await assertLoggedIn();
  if (denied) return denied;
  await disconnectFinary();
  return Response.redirect(new URL("/parametres", req.url), 303);
}
