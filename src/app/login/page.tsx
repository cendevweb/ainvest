export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const { erreur } = await searchParams;
  return (
    <div className="login">
      <form className="panel" action="/api/login" method="post">
        <div className="brand" style={{ marginBottom: 18 }}>
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 12l4-4 3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          AInvest
        </div>
        <label className="field" htmlFor="password">
          Mot de passe de ton instance
          <input id="password" name="password" type="password" autoComplete="current-password" required autoFocus />
        </label>
        {erreur && <p role="alert" style={{ color: "var(--loss)", fontSize: 13, margin: "10px 0 0" }}>Mot de passe incorrect.</p>}
        <button className="btn primary" type="submit" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}>Entrer</button>
      </form>
    </div>
  );
}
