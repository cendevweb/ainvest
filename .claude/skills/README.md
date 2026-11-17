# Skills de séance

Ces skills sont chargés automatiquement par Claude Code quand la routine « Séance AInvest » tourne sur ce dépôt. Ils servent à Claude pendant la séance et n'ont aucun effet sur l'app.

- `seance-ainvest/` : méthode propre à AInvest (ordre de travail, adaptations au CTO français, stops et objectifs). C'est le point d'entrée.
- Les autres viennent de [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills), sous licence MIT (voir `LICENSE-claude-trading-skills`), commit `60399452891edf47c1da5ce93c7664b31e3b001e`. Ils sont copiés sans modification, tests retirés.

| Skill | Usage en séance | Clé API |
| --- | --- | --- |
| `technical-analyst` | Cadre de lecture de courbe (tendance, supports et résistances, moyennes mobiles, volume, scénarios) | Aucune pour le cadre |
| `position-sizer` | Taille de position selon le risque, stop par ATR, script Python sans dépendance | Aucune |
| `us-stock-analysis` | Analyse fondamentale et grille de ratios | Aucune |
| `market-news-analyst` | Impact d'une actualité, sources fiables, corrélations matières premières et géopolitique | Aucune |
| `scenario-analyzer` | Scénarios à partir d'un gros titre, sensibilité des secteurs | Aucune |
| `market-environment-analysis` | Régime de marché risk-on / risk-off | Aucune |
| `us-market-bubble-detector` | Risque de bulle (cadre de Minsky et Kindleberger) | Aucune |
| `market-breadth-analyzer` | Score 0-100 de participation du marché US, données CSV publiques | Aucune |
| `uptrend-analyzer` | Score 0-100 de la part d'actions US en tendance haussière | Aucune |

## Écartés, et pourquoi

- **Screeners US à court terme** (Stockbee, VCP, CANSLIM, PEAD, momentum, parabolic short, earnings-trade-analyzer, ftd-detector, distribution days) : horizon de quelques jours, actions US seulement, des centaines d'appels FMP par passage. Ils ne sont pas adaptés à un CTO à 3-18 mois, et le quota gratuit ne suffit pas.
- **Options, futures, COT, crypto, MetaTrader, Alpaca** (portfolio-manager, breakout-trade-planner, parabolic-short) : non disponibles chez Trade Republic, ou exécution d'ordres hors du principe d'AInvest. Les règles de stop et d'objectif de Minervini sont reprises dans `seance-ainvest/references/stops-et-objectifs.md`.
- **Pipeline de recherche d'edge, backtests, outils de création de skills** : outils de développement de stratégies, pas d'aide à la décision en séance.
- **Dividendes Kanchi** : méthode et fiscalité japonaises ou américaines. L'idée des revues forcées est reprise dans `stops-et-objectifs.md`.
- **trader-memory-core, journaux de trades** : remplacés par le carnet de notes du connecteur AInvest.
- **Screeners FMP utiles mais lourds** (macro-regime-detector, market-top-detector, value-dividend-screener, institutional-flow-tracker) : ils demandent `FMP_API_KEY` dans l'environnement de la routine et beaucoup d'appels. À ajouter plus tard si l'offre FMP le permet. En attendant, `screen_stocks` et `get_economic_calendar` couvrent l'essentiel.
