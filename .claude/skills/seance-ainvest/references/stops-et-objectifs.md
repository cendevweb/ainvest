# Gestion du risque : taille, stop loss, take profit

Synthèse adaptée à un CTO de particulier, horizon 3 à 18 mois. Sources : skill `position-sizer` (`references/sizing_methodologies.md`), règles de Minervini et O'Neil reprises du dépôt claude-trading-skills (licence MIT), et règles AInvest. En cas de conflit, la règle AInvest l'emporte.

## 1. Le risque se fixe avant la taille

- **Risque par position** : perte maximale acceptée si le stop est touché, entre 0,5 et 1 % du CTO. Avec un CTO de 4 300 €, c'est 20 à 45 €. Au-delà de 2 %, le risque de ruine augmente vite.
- **Risque total ouvert** (« portfolio heat ») : la somme des pertes si tous les stops sont touchés. Plafond de 6 % du CTO.
- **Taille** = risque en euros ÷ (prix d'entrée − stop). Plafonne ensuite par les règles AInvest : montant maximum par ordre, poids maximum par ligne et par secteur, liquidités minimum après achat.
- Calcul avec `position-sizer` (méthode « fixed fractional », ou « ATR-based » avec `--atr`). Mode `--fractional` possible, Trade Republic acceptant les fractions.

## 2. Placer le stop loss

Le stop se place là où la thèse est invalidée, pas à un pourcentage arbitraire.

1. **Niveau technique** : juste sous le support hebdomadaire le plus proche (outil `get_price_history`, `supports_proches`), ou sous la moyenne mobile de 20 ou 40 semaines si le titre s'y appuie. Laisse une marge d'environ 1 % ou 0,5 ATR.
2. **Volatilité** : au moins 2 ATR quotidiens sous l'entrée (`atr_14j`). Un stop plus serré se fait déclencher par le bruit.
3. **Plafond** : jamais plus de 8 à 10 % sous l'entrée, comme O'Neil (7-8 %) et le stop par défaut des règles AInvest. Si le niveau technique est plus bas, réduis la taille ou renonce.
4. **Ligne déjà détenue en plus-value** : stop suiveur (« trailing stop ») sous le dernier creux hebdomadaire ou à 3 ATR du plus haut. Remonte-le, ne le baisse jamais.

## 3. Fixer l'objectif (take profit)

- **Ratio gain/risque** d'au moins 2 pour 1 (2R) sur l'objectif principal, sinon le trade ne vaut pas le risque. Exemple : entrée 100 €, stop 92 €, R = 8 €, objectif 116 € ou plus.
- **Objectif technique** : sous la prochaine résistance hebdomadaire (`resistances_proches`) ou le plus haut sur 52 semaines. Si la résistance est à moins de 2R, n'achète pas.
- **Objectif fondamental** : comparer avec l'objectif de cours consensuel des analystes (`get_company_fundamentals`, `objectif_de_cours`) et une valorisation raisonnable.
- **Sortie progressive** : vendre une partie (un tiers à la moitié) à 2R ou à l'objectif, puis laisser courir le reste avec un stop suiveur.

## 4. Quand revoir une position

Revue forcée (statut à noter dans le carnet), sans vente automatique :
- cours sous la moyenne mobile de 40 semaines, avec une pente qui se retourne ;
- résultats ou prévisions nettement sous les attentes, ou baisse du dividende ;
- la thèse notée à l'achat n'est plus vraie (perte d'un contrat clé, changement de direction, enquête) ;
- poids de la ligne au-dessus de la règle AInvest après une forte hausse : alléger.

## 5. Ce qu'il faut écrire dans une proposition d'achat

Prix d'entrée et type d'ordre, stop et sa justification, objectif et sa justification, ratio gain/risque, perte maximale en euros si le stop est touché, et ce qui invaliderait la thèse. Le même contenu va dans le carnet de notes.
