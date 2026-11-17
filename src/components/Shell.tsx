import Link from "next/link";
import { NavLinks } from "./NavLinks";

export function Shell({ children }: { children: React.ReactNode }) {
  const connectorReady = (process.env.INGEST_TOKEN?.length ?? 0) >= 24;
  return (
    <>
      <header className="top">
        <div className="wrap">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M2 12l4-4 3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            AInvest
          </Link>
          <NavLinks />
          <div className="top-right">
            {connectorReady ? (
              <span className="chip ok"><span className="dot" />Connecteur prêt</span>
            ) : (
              <Link href="/parametres" className="chip warn"><span className="dot" />Configurer le connecteur</Link>
            )}
            <form action="/api/logout" method="post">
              <button className="btn ghost" type="submit">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>
      <main className="wrap">
        {children}
        <p className="disclaimer">
          AInvest produit des recommandations, pas des conseils en investissement. Tu restes seul à décider et à passer les ordres.
        </p>
      </main>
    </>
  );
}
