import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { getRules } from "@/lib/sessions";
import { Shell } from "@/components/Shell";
import { RulesForm } from "@/components/RulesForm";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  if (!(await isLoggedIn())) redirect("/login");
  const rules = await getRules();
  return (
    <Shell>
      <div className="page-head">
        <div>
          <div className="eyebrow">Garde-fous</div>
          <h1>Règles d&apos;investissement</h1>
          <p>Claude lit ces règles à chaque séance, et du code vérifie chaque proposition avant de te la montrer. Une proposition qui en enfreint une apparaît comme bloquée.</p>
        </div>
      </div>
      <RulesForm initial={rules} />
    </Shell>
  );
}
