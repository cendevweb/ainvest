# AInvest

Copilote Claude pour ton compte-titres ordinaire (CTO). Chaque jour ouvré avant l'ouverture de la Bourse, Claude lit ton patrimoine via le connecteur officiel Finary, parcourt l'actualité de tes lignes et du marché, puis te propose quelques actions argumentées (achat, vente, protection, ou ne rien faire). **Rien n'est exécuté automatiquement** : tu approuves, tu passes l'ordre toi-même chez ton courtier, puis tu le marques comme passé.

> AInvest produit des recommandations, pas des conseils en investissement. Tu restes seul responsable de tes décisions.

## Le principe : une instance par personne

Le code est public, mais chaque personne déploie **sa propre instance** sur son propre compte Vercel. Personne ne détient les accès des autres :

| Donnée | Où elle vit |
| --- | --- |
| Clé API Claude | Variables d'environnement de *ton* projet Vercel. Jamais envoyée au navigateur. |
| Jeton Finary (OAuth) | *Ta* base Redis, chiffré en AES-256-GCM avec `ENCRYPTION_KEY`. |
| Séances, propositions, décisions | *Ta* base Redis. |
| Code, prompts, règles par défaut | Ce repo public. Aucun secret. |

L'URL Vercel étant publique, l'accès à l'app est protégé par un mot de passe (`APP_PASSWORD`).

## Déployer ton instance

1. **Forke ce repo**, puis importe-le dans Vercel (*Add New → Project*).
2. **Ajoute une base Redis** : dans le projet Vercel, *Storage → Marketplace → Upstash Redis*. Les variables `KV_REST_API_URL` et `KV_REST_API_TOKEN` sont ajoutées automatiquement.
3. **Renseigne les variables d'environnement** (voir `.env.example`) :
   - `ANTHROPIC_API_KEY` : une clé dédiée créée sur console.anthropic.com, idéalement avec une limite de dépense mensuelle.
   - `APP_PASSWORD` : le mot de passe de ton instance.
   - `APP_SECRET` et `ENCRYPTION_KEY` : deux valeurs différentes, générées chacune avec `openssl rand -base64 32`.
   - `CRON_SECRET` : une longue valeur aléatoire ; Vercel l'envoie à la tâche planifiée.
   - `APP_URL` : l'URL de ton instance, par exemple `https://mon-ainvest.vercel.app`.
   - `FINARY_CLIENT_ID` (facultatif) : le client OAuth que Finary a autorisé pour ton instance (voir *Limites connues*).
   - `AINVEST_MODEL` (facultatif) : `claude-opus-5-5` par défaut, `claude-sonnet-5-5` pour réduire le coût.
4. **Déploie**, ouvre ton URL, entre ton mot de passe, puis va dans **Paramètres → Connecter Finary**.

## Comment se déroule une séance

1. Claude lit ton patrimoine avec les outils du MCP Finary (vue d'ensemble, comptes, positions) et repère ton CTO.
2. Il cherche l'actualité des 7 derniers jours sur chaque ligne et le contexte macro (recherche et lecture web côté API Claude).
3. Il remet un rapport structuré : instantané du CTO, synthèse, actualités, propositions avec arguments, sources, niveau d'abandon et raisonnement complet.
4. **Du code, pas le modèle**, vérifie chaque proposition contre tes règles (poids max par ligne et par secteur, liquidités minimum, montant max par ordre, nombre de propositions). Les ventes sont simulées avant les achats. Une proposition qui enfreint une règle est affichée comme bloquée.
5. À ta prochaine connexion, une notification dans l'app t'indique les propositions en attente.

La tâche planifiée tourne à 6 h 45 UTC du lundi au vendredi (`vercel.json`), soit 7 h 45 en hiver et 8 h 45 en été à Paris, avant l'ouverture d'Euronext. Tu peux aussi lancer une séance à la main.

## Limites connues

- **Durée d'une séance** : plusieurs minutes. Les routes demandent `maxDuration = 800` ; Vercel plafonne selon ton offre et la configuration Fluid Compute. Si ta séance est coupée, baisse `max_uses` des outils web ou passe sur Sonnet.
- **Exécution des ordres** : non branchée. Trade Republic n'a pas d'API d'ordres publique ; les bibliothèques non officielles exposent à un blocage de compte.
- **Connexion Finary** : le serveur MCP de Finary n'accepte que des clients OAuth pré-approuvés. Une instance auto-hébergée reçoit donc `invalid_client` tant que Finary ne l'a pas autorisée. Pour l'obtenir, contacte Finary (support ou fil du MCP sur le forum communautaire) en donnant l'URL de retour affichée dans **Paramètres** (`https://ton-instance/api/finary/callback`), puis renseigne le `client_id` reçu dans `FINARY_CLIENT_ID` et redéploie. En attendant, tu peux interroger ton patrimoine directement dans Claude en ajoutant `https://public-api.finary.com/mcp` comme connecteur personnalisé sur claude.ai.
- **Chiffres du CTO** : les règles sont vérifiées sur l'instantané que Claude relaie depuis Finary. Une lecture directe des positions par le serveur est prévue.

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
