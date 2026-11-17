# AInvest

Copilote Claude pour ton compte-titres ordinaire (CTO). Chaque jour ouvré avant l'ouverture de la Bourse, une routine Claude dans le cloud lit ton patrimoine via le connecteur officiel Finary, parcourt l'actualité de tes lignes et du marché, puis te propose quelques actions argumentées (achat, vente, protection, ou ne rien faire). **Rien n'est exécuté automatiquement** : tu approuves, tu passes l'ordre toi-même chez ton courtier, puis tu le marques comme passé.

> AInvest produit des recommandations, pas des conseils en investissement. Tu restes seul responsable de tes décisions.

## Le principe : une instance par personne

Le code est public, mais chaque personne déploie **sa propre instance** sur son propre compte Vercel. Personne ne détient les accès des autres :

| Donnée | Où elle vit |
| --- | --- |
| Clé API Claude (brief marché) | Variables d'environnement de *ton* projet Vercel. Jamais envoyée au navigateur. |
| Accès Finary | Uniquement dans tes connecteurs claude.ai. L'app n'en détient aucun. |
| Secret du connecteur AInvest | `INGEST_TOKEN`, dans les variables de *ton* projet Vercel. |
| Séances, propositions, décisions | *Ta* base Redis. |
| Code, prompts, règles par défaut | Ce repo public. Aucun secret. |

L'URL Vercel étant publique, l'accès à l'app est protégé par un mot de passe (`APP_PASSWORD`).

## Déployer ton instance

1. **Forke ce repo**, puis importe-le dans Vercel (*Add New → Project*).
2. **Ajoute une base Redis** : dans le projet Vercel, *Storage → Marketplace → Upstash Redis*. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement.
3. **Renseigne les variables d'environnement** (voir `.env.example`) :
   - `INGEST_TOKEN` : le secret du connecteur AInvest (voir [docs/routine-claude.md](docs/routine-claude.md)).
   - `ANTHROPIC_API_KEY` : une clé dédiée créée sur console.anthropic.com, idéalement avec une limite de dépense mensuelle. Elle paie le brief marché du matin.
   - `AINVEST_BRIEF_MODEL` (facultatif) : modèle du brief, `claude-sonnet-5-5` par défaut.
   - `AINVEST_MONTHLY_BUDGET_USD` (facultatif) : budget mensuel de la clé API, 100 $ par défaut. Chaque exécution est comptée (jetons et recherches web au prix catalogue) et refusée si elle risque de le dépasser.
   - `ROUTINE_FIRE_URL` et `ROUTINE_FIRE_TOKEN` (facultatifs) : le déclencheur API de ta routine Claude, pour le bouton « Lancer une séance » (voir [docs/routine-claude.md](docs/routine-claude.md)).
   - `APP_PASSWORD` : le mot de passe de ton instance.
   - `APP_SECRET` : une valeur générée avec `openssl rand -base64 32`.
   - `CRON_SECRET` : une longue valeur aléatoire ; Vercel l'envoie à la tâche planifiée.
   - `APP_URL` : l'URL de ton instance, par exemple `https://mon-ainvest.vercel.app`.
   - `FMP_API_KEY` (facultatif, recommandé) : clé [Financial Modeling Prep](https://site.financialmodelingprep.com/developer/docs). Elle donne à ton Claude, pendant la séance, un screener et les chiffres des entreprises (ratios, résultats, bilan, consensus d'analystes, agenda des résultats). Ces outils ne sont pas dans l'interface : seul Claude s'en sert, via le connecteur AInvest.
4. **Déploie**, ouvre ton URL et entre ton mot de passe.
5. **Mets en place la routine Claude** : ajoute les connecteurs Finary et AInvest sur claude.ai puis crée la tâche planifiée, en suivant [docs/routine-claude.md](docs/routine-claude.md).

## Comment se déroule une séance

Finary n'ouvre son serveur MCP qu'aux clients qu'il a approuvés, dont Claude. La séance est donc menée par **ta routine Claude** dans le cloud, qui dépose son rapport dans l'app via le connecteur MCP d'AInvest (`/api/mcp/<INGEST_TOKEN>`).

1. Claude appelle `get_session_context` : tes règles, tes décisions de la veille, la méthode.
2. Il lit ton patrimoine avec le connecteur Finary (vue d'ensemble, comptes, positions) et repère ton CTO.
3. Il cherche l'actualité des 7 derniers jours sur chaque ligne et le contexte macro, ouvre les pages et croise les sources. Avec `FMP_API_KEY`, il consulte aussi les fondamentaux chiffrés des entreprises et peut lancer un screener pour trouver des idées (outils `search_security`, `get_company_fundamentals`, `screen_stocks`, `get_earnings_calendar` du connecteur AInvest).
4. Il dépose un rapport structuré avec `submit_report` : instantané du CTO, synthèse, actualités, propositions argumentées et sources.
5. **Du code, pas le modèle**, vérifie chaque proposition contre tes règles (poids max par ligne et par secteur, liquidités minimum, montant max par ordre, nombre de propositions). Les ventes sont simulées avant les achats. Une proposition qui enfreint une règle est affichée comme bloquée.
6. À ta prochaine connexion, une notification dans l'app t'indique les propositions en attente.

**Brief marché avec ta clé API.** La tâche planifiée Vercel tourne à 5 h 15 UTC du lundi au vendredi (6 h 15 en hiver, 7 h 15 en été à Paris). Avec `ANTHROPIC_API_KEY`, elle prépare le brief du matin : macro, marchés, agenda et actualité de chaque ligne connue, avec sources. Ta routine Claude le récupère dans `get_session_context` et ne fait plus que lire Finary et décider. Le brief s'affiche aussi sur le tableau de bord, avec la dépense du mois. Compte environ 0,50 à 1 $ par brief avec Sonnet, soit 10 à 25 $ par mois.

**Lancer une séance à la main.** Le bouton « Lancer une séance » démarre ta routine Claude par son déclencheur API, sans ouvrir claude.ai. La séance tourne dans le cloud sur ton abonnement, avec tes connecteurs Finary et AInvest. Pendant qu'elle tourne, l'app affiche en direct le **journal de Claude** : lectures Finary, recherches importantes et décisions majeures de son raisonnement (outil `log_step` du connecteur). Le rapport s'affiche dès qu'il est déposé, et le journal reste consultable sur chaque séance.

**Approfondir une proposition sur ton abonnement.** Le bouton « Creuser avec Claude » de chaque proposition ouvre claude.ai avec une consigne préremplie. Ton Claude relit la séance avec l'outil `get_session` du connecteur AInvest, vérifie ta position avec Finary et approfondit. Rien n'est facturé sur la clé API.

## Limites connues

- **Exécution des ordres** : non branchée. Trade Republic n'a pas d'API d'ordres publique ; les bibliothèques non officielles exposent à un blocage de compte.
- **Chiffres du CTO** : les règles sont vérifiées sur l'instantané que ta routine relaie depuis Finary, l'app n'ayant pas d'accès direct à Finary (Finary réserve son serveur MCP aux clients qu'il a approuvés, dont Claude).

## Développement

```bash
npm install
cp .env.example .env.local   # puis remplis les valeurs
npm run dev
npm test        # tests des règles
npm run typecheck
```

La CI vérifie les types, les tests, le build et l'absence de secrets (gitleaks).

## Licence

MIT
