# Séance quotidienne par une routine Claude dans le cloud

Finary n'ouvre son serveur MCP qu'aux clients qu'il a approuvés, dont Claude. Ton instance AInvest ne se connecte donc pas à Finary elle-même : c'est **ton Claude**, avec son connecteur Finary, qui lit ton patrimoine puis dépose le rapport dans l'app via le **connecteur AInvest**. La routine tourne dans le cloud d'Anthropic : rien ne tourne sur ton ordinateur. Elle est facturée sur ton abonnement Claude.

Le **brief marché** (macro, marchés, actualité de tes lignes) est préparé plus tôt par la tâche planifiée Vercel avec ta clé API. La routine le reçoit dans `get_session_context` et n'a plus qu'à lire Finary et décider.

```
Vercel, 6 h 15 (7 h 15 en été) → brief marché avec ta clé API

Routine Claude (cloud), 7 h 20
 ├─ connecteur AInvest → get_session_context : règles, décisions de la veille, méthode, brief du matin
 ├─ connecteur Finary  → vue d'ensemble, comptes, positions (lecture seule)
 ├─ recherche web      → recherches libres, pages ouvertes, sources croisées
 ├─ connecteur AInvest → log_step : journal en direct (lectures, recherches, décisions)
 ├─ connecteur AInvest → fondamentaux, screener, agenda des résultats (si FMP_API_KEY)
 ├─ connecteur AInvest → carnet de notes entre séances (dates, raisons, pistes)
 ├─ skills du dépôt    → .claude/skills : méthode (seance-ainvest), courbe, risque, actualité
 └─ connecteur AInvest → submit_report : l'app revérifie tes règles et affiche les propositions
```

## 1. Activer le connecteur AInvest

1. Dans Vercel, ajoute la variable `INGEST_TOKEN` (au moins 24 caractères, sans `/` ni `+`) :
   ```bash
   openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
   ```
2. Redéploie, puis ouvre **Paramètres** dans l'app : l'URL du connecteur s'affiche (`https://ton-instance/api/mcp/<secret>`). Ne la partage pas : elle donne le droit de déposer des rapports.

## 2. Ajouter les deux connecteurs sur claude.ai

Dans claude.ai, **Paramètres → Connecteurs → Ajouter un connecteur personnalisé** :

| Nom | URL | Connexion |
| --- | --- | --- |
| Finary | `https://public-api.finary.com/mcp` | Connecte-toi à Finary et accorde la lecture du patrimoine. |
| AInvest | l'URL affichée dans Paramètres | Aucune : le secret est dans l'URL. |

Tu peux vérifier dans une conversation : « Donne-moi la répartition de mon patrimoine par classe d'actifs ».

## 3. Ouvrir le réseau de l'environnement cloud

La routine tourne dans un environnement cloud (claude.ai/code, réglages de l'environnement). En réseau « limité », elle peut chercher sur le web mais **pas ouvrir les pages** trouvées : elle ne travaille alors que sur des extraits. Mets l'accès réseau de l'environnement sur **complet** (ou ajoute les sites d'actualité que tu veux autoriser) pour qu'elle lise les articles, communiqués et rapports.

## 4. Créer la routine

Sur claude.ai/code, crée une tâche planifiée (routine) avec les connecteurs **Finary** et **AInvest** activés et :

- **Planification** : jours ouvrés vers 7 h 20, heure de Paris, après le brief (6 h 15 en hiver, 7 h 15 en été : décale à 7 h 35 l'été).
- **Consigne** :

```text
Lance la séance AInvest du jour.
1. Appelle get_session_context (connecteur AInvest) et suis exactement ses consignes. Si ce message contient une ligne « Identifiant de séance AInvest : … », passe cet identifiant en session_id.
2. Lis mon patrimoine avec le connecteur Finary, en lecture seule. N'utilise aucun outil Finary qui modifie des données.
3. Pars du brief marché fourni par get_session_context, puis fais tes propres recherches : ouvre les pages, croise les sources, et utilise les outils de données boursières du connecteur AInvest pour les chiffres des entreprises.
4. Journalise tes étapes et décisions majeures avec log_step, comme l'indiquent les consignes.
5. Termine en appelant submit_report (connecteur AInvest) une seule fois, avec le session_id. Si le rapport est refusé, corrige-le et renvoie-le.
Ne passe jamais d'ordre.
```

## 5. Lancer une séance depuis l'app

Le bouton « Lancer une séance » démarre cette même routine sans ouvrir claude.ai :

1. Sur claude.ai/code/routines, ouvre la routine AInvest, puis **Ajouter un déclencheur → API → Générer un jeton**. Le jeton ne s'affiche qu'une fois.
2. Dans Vercel, renseigne `ROUTINE_FIRE_URL` (l'URL du déclencheur, `https://api.anthropic.com/v1/claude_code/routines/trig_…/fire`) et `ROUTINE_FIRE_TOKEN` (le jeton), puis redéploie.

L'app crée la séance, déclenche la routine en lui passant l'identifiant de séance, puis affiche le journal en direct jusqu'au rapport. Le jeton permet seulement de lancer cette routine, et chaque lancement compte dans ton abonnement (30 lancements par heure au plus). Une séance sans rapport au bout de 45 minutes s'affiche comme interrompue.

## Ce que l'app garantit

- Le rapport est validé par schéma, puis **chaque proposition est revérifiée par le code** contre tes règles (poids par ligne et secteur, liquidités, montant par ordre, nombre de propositions). Une proposition hors règles apparaît comme bloquée.
- Rien n'est exécuté : tu approuves, passes l'ordre chez ton courtier et le marques comme passé.
- La tâche planifiée Vercel ne prépare le brief que si `ANTHROPIC_API_KEY` est renseignée, et jamais au-delà du budget mensuel.
