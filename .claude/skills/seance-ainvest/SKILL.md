---
name: seance-ainvest
description: Méthode de travail d'une séance AInvest (compte-titres ordinaire français, horizon 3 à 18 mois). À lire au début de chaque séance AInvest, avant d'analyser le portefeuille : quels skills et outils utiliser pour lire une courbe, analyser une entreprise ou l'actualité, dimensionner une position et placer stop loss et take profit.
---

# Séance AInvest : méthode professionnelle

Tu prépares des propositions pour le compte-titres ordinaire (CTO) d'un particulier français, chez Trade Republic, sur un horizon de 3 à 18 mois. Tu ne passes jamais d'ordre. Les règles renvoyées par `get_session_context` priment sur tout ce qui suit : si un skill propose autre chose (risque, taille, nombre de lignes), applique la règle AInvest.

## Ordre de travail

1. **Contexte** : `get_session_context` (règles, décisions de la veille, carnet de notes, brief). Relis les notes dont l'échéance est arrivée.
2. **Portefeuille** : connecteur Finary, lecture seule.
3. **Environnement de marché** (une fois par séance) :
   - skill `market-environment-analysis` pour le régime risk-on / risk-off ;
   - pour les marchés US, les scores chiffrés de `market-breadth-analyzer` et `uptrend-analyzer` (données publiques, sans clé) ;
   - si les valorisations semblent tendues, `us-market-bubble-detector` ;
   - outil `get_economic_calendar` pour les publications macro de la semaine.
4. **Actualité** : skill `market-news-analyst` pour juger l'impact d'une nouvelle (ampleur, durée, effet de second ordre) et choisir des sources fiables. `scenario-analyzer` si un gros titre peut changer la donne (géopolitique, banque centrale, matières premières).
5. **Chaque ligne détenue, puis chaque idée d'achat** :
   - **courbe** : outil `get_price_history`, interprété avec le cadre du skill `technical-analyst` (`references/technical_analysis_framework.md`). Ce skill attend des images : ici, les moyennes mobiles, supports, résistances et bougies hebdomadaires de l'outil remplacent l'image. Travaille en hebdomadaire, cohérent avec l'horizon ;
   - **entreprise** : outils `get_company_fundamentals` et `get_earnings_calendar`, interprétés avec le skill `us-stock-analysis` (`references/fundamental-analysis.md`, `references/financial-metrics.md`). Valable aussi pour une valeur européenne ;
   - **idées** : outil `screen_stocks`, puis les deux étapes ci-dessus. Une idée n'est retenue que si fondamentaux, courbe et actualité vont dans le même sens.
6. **Risque, stop loss et take profit** : `references/stops-et-objectifs.md` de ce skill, et le skill `position-sizer` pour le calcul. Son script tourne avec la bibliothèque standard de Python, par exemple `python3 .claude/skills/position-sizer/scripts/position_sizer.py --account-size 4300 --entry 100 --stop 92 --risk-pct 1 --output-dir /tmp`. Chaque achat proposé a un stop, un objectif et un ratio gain/risque.
7. **Carnet** : avec `add_note`, note la raison de chaque proposition ou abstention, le niveau qui invaliderait la thèse et les dates à surveiller.
8. **Rapport** : `submit_report`, une seule fois.

Si les outils de données boursières sont absents (clé FMP non configurée), fais la même analyse par la recherche web en ouvrant les pages, par exemple Boursorama, Zonebourse, Yahoo Finance ou les rapports annuels, et dis-le dans le rapport.

## Adaptations au contexte (les skills sont écrits pour un trader américain)

- **Devise** : montants en euros. Convertis les cours en dollars au taux du jour et indique le taux.
- **Courtier** : Trade Republic. Ordres au marché, à cours limité et stop. Pas de vente à découvert, pas d'options, pas de futures. Frais de 1 € par ordre : évite les ordres de moins de 100 €.
- **Fiscalité** : prélèvement forfaitaire unique de 30 % sur les plus-values réalisées. Estime-le pour toute vente.
- **Horizon** : 3 à 18 mois. Ignore les setups intraday ou de quelques jours (momentum burst, gap du jour) et les règles « 5 minutes » des skills.
- **Taille du compte** : quelques milliers d'euros. Une fraction d'action est possible chez Trade Republic. Garde peu de lignes, bien suivies, plutôt que de disperser.
- **Données US uniquement** : les scores de breadth et d'uptrend décrivent le marché américain. Pour l'Europe, appuie-toi sur la recherche web (CAC 40, Stoxx 600, Euro Stoxx 50).
- **Fichiers** : les skills écrivent des rapports dans `reports/`. En séance, écris-les dans `/tmp` si besoin. Seul `submit_report` compte.

## Exigences de qualité

- Chaque chiffre a une source : l'outil, avec la mention « Financial Modeling Prep », ou une page ouverte. Croise les informations importantes.
- Sépare les faits des interprétations. Donne des scénarios avec des probabilités qui somment à 100 %, pas une certitude.
- Ne rien faire est souvent la meilleure décision : dis pourquoi.
