import { notFound, redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { finaryStatus } from "@/lib/finary-oauth";
import { getRules, getSession } from "@/lib/sessions";
import { Shell } from "@/components/Shell";
import { SessionView } from "@/components/SessionView";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) redirect("/login");
  const [session, finary, rules] = await Promise.all([getSession((await params).id), finaryStatus(), getRules()]);
  if (!session) notFound();
  return (
    <Shell finaryConnected={finary.connected}>
      <SessionView session={session} rules={rules} isLatest={false} />
    </Shell>
  );
}
