import { notFound, redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { getRules, getSession } from "@/lib/sessions";
import { Shell } from "@/components/Shell";
import { SessionView } from "@/components/SessionView";

export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isLoggedIn())) redirect("/login");
  const [session, rules] = await Promise.all([getSession((await params).id), getRules()]);
  if (!session) notFound();
  return (
    <Shell>
      <SessionView session={session} rules={rules} isLatest={false} />
    </Shell>
  );
}
