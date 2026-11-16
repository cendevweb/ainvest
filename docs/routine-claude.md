# Séance quotidienne par une routine Claude dans le cloud

Finary n'ouvre son serveur MCP qu'aux clients qu'il a approuvés, dont Claude. Ton instance AInvest ne se connecte donc pas à Finary elle-même : c'est **ton Claude**, avec son connecteur Finary, qui lit ton patrimoine puis dépose le rapport dans l'app via le **connecteur AInvest**. La routine tourne dans le cloud d'Anthropic : rien ne tourne sur ton ordinateur. Elle est facturée sur ton abonnement Claude.

Le **brief marché** (macro, marchés, actualité de tes lignes) est préparé plus tôt par la tâche planifiée Vercel avec ta clé API. La routine le reçoit dans `get_session_context` et n'a plus qu'à lire Finary et décider.

```
Vercel, 6 h 15 (7 h 15 en été) → brief marché avec ta clé API

Routine Claude (cloud), 7 h 30
 ├─ connecteur AInvest → get_session_context : règles, décisions de la veille, méthode, brief du matin
 ├─ connecteur Finary  → vue d'ensemble, comptes, positions (lecture seule)
 ├─ recherche web      → seulement ce que le brief ne couvre pas
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

## 3. Créer la routine

Sur claude.ai/code, crée une tâche planifiée (routine) avec les connecteurs **Finary** et **AInvest** activés, un dépôt quelconque (par exemple ce repo) et :

- **Planification** : jours ouvrés à 7 h 30, heure de Paris (en cron UTC : `30 6 * * 1-5` en hiver, `30 5 * * 1-5` en été).
- **Consigne** :

```text
Lance la séance AInvest du jour.
1. Appelle get_session_context (connecteur AInvest) et suis exactement ses consignes.
2. Lis mon patrimoine avec le connecteur Finary, en lecture seule. N'utilise aucun outil Finary qui modifie des données.
3. Appuie-toi sur le brief marché fourni par get_session_context ; ne cherche sur le web que ce qui manque.
4. Termine en appelant submit_report (connecteur AInvest) une seule fois. Si le rapport est refusé, corrige-le et renvoie-le.
Ne passe jamais d'ordre.
```

Tu peux aussi lancer une séance à la main : colle la même consigne dans une conversation claude.ai où les deux connecteurs sont actifs.

## Ce que l'app garantit

- Le rapport est validé par schéma, puis **chaque proposition est revérifiée par le code** contre tes règles (poids par ligne et secteur, liquidités, montant par ordre, nombre de propositions). Une proposition hors règles apparaît comme bloquée.
- Rien n'est exécuté : tu approuves, passes l'ordre chez ton courtier et le marques comme passé.
- La tâche planifiée Vercel ne fait rien tant que l'app n'a pas sa propre clé API et sa propre connexion Finary.
