# Sélecteur des bases — livraison du 26 septembre 2026

Le service indépendant est passé en version **0.2.0**, mode **EXPERIMENTAL**.
Il produit désormais des trios, et des quatuors lorsque les critères supplémentaires
sont satisfaits. Les propositions restent dans l'espace privé.

Tableau : https://elite-turf-bases-independent.manuel-conti2008.workers.dev/

## Première proposition réellement émise

Le 26 septembre à **07:56:17 UTC**, le service a enregistré **6 – 2 – 1** pour
**Auteuil R1C3**, départ annoncé à **13:15 UTC**. Les huit du Moteur étaient
6 – 4 – 2 – 1 – 8 – 12 – 7 – 9 : le sélecteur a donc retenu le quatrième candidat
à la place du deuxième. Aucune quatrième base n'a franchi les critères.

Cette proposition matinale expire à 08:08:17 UTC et peut évoluer avec les prochains
passages. Elle n'est pas la référence définitive du bilan, qui sera fixée à
13:10 UTC, soit cinq minutes avant le départ. **Aucune arrivée n'était disponible
au moment de la vérification ; aucun succès réel n'est encore revendiqué.**

## Test historique exploratoire

Les observations avaient été recueillies avant les départs. Une seule observation
par course est utilisée, la dernière disponible à T−5, âgée de douze minutes au
plus. Chaque modèle testé n'est ajusté qu'avec des arrivées déjà connues à l'heure
de la course testée. Les deux premières courses servent d'amorçage.

| Course testée | Trio du sélecteur | Arrivée officielle | Trois présents ? | Trois premiers Moteur | Trois favoris Marché parmi les huit |
|---|---|---|---|---|---|
| 23 septembre, Argentan | 13 – 8 – 12 | 13 – 6 – 5 – 12 – 18 | Non | Non | Non |
| 24 septembre, Compiègne | 8 – 16 – 4 | 13 – 8 – 10 – 4 – 16 | Oui | Non | Oui |
| 25 septembre, Vincennes | 9 – 18 – 13 | 13 – 11 – 12 – 10 – 15 | Non | Non | Non |

Résultat : **1 trio complet sur 3**, contre **0/3** pour le Moteur et **1/3** pour
le Marché. Aucun quatuor émis : son taux de réussite n'est donc pas mesurable.
Ces trois essais ne démontrent aucune supériorité sur le marché. La méthode a été
conçue après les courses : ce bilan est rétrospectif et exploratoire, même si le
découpage chronologique empêche les labels futurs d'entrer dans les ajustements.
La vérification détaillée des non-partants après course n'était pas disponible
dans ces anciennes archives ; elle est exigée pour les bilans prospectifs.

Le modèle actif a ensuite été ajusté sur les cinq courses terminées du 21 au
25 septembre. Il est figé pour l'évaluation des prochaines courses et ne se
réentraîne pas automatiquement. Les courses à venir n'entrent pas dans ce modèle.

## Fonctionnement du sélecteur

- Modèle Plackett–Luce avec régularisation forte sur un a priori explicite.
- Cotes de tous les partants, correction du Moteur, forme récente, incidents et
  variation depuis les cotes de référence.
- Comparaison des 56 trios et 70 quatuors parmi les huit candidats.
- Refus en cas de données incomplètes, non-partant sélectionné, observation âgée
  de plus de douze minutes, départ proche, modèle invalide ou sélection instable.
- Quatrième base conditionnée à des critères supplémentaires ; aucune obligation
  de produire quatre chevaux sur chaque course.
- Scores du modèle non calibrés : ils ne sont pas présentés comme des taux de
  réussite établis. Aucun bilan financier n'est déduit de ces scores.

Le bilan futur prend une seule référence par course à T−5 et affiche séparément
trios, quatuors, abstentions et arrivées attendues. Les comparatifs utilisent la
même observation et les mêmes huit candidats. Une arrivée provisoire, une course
annulée ou une base non partante ne devient pas un succès ou un échec artificiel.

## Fiabilisation et contrôles

**37 tests réussis**, contrôle TypeScript, lint et compilation Wrangler réussis.
Les tests couvrent notamment le calcul des probabilités conjointes, le gradient
d'apprentissage, l'absence de labels futurs, les abstentions, les non-partants,
l'immuabilité, le choix de la référence à T−5 et les pannes des sources.

Les erreurs de délai et de réseau déclenchent au maximum trois essais bornés.
Les journaux distinguent la source en défaut. Une indisponibilité de prono
n'empêche plus la récupération des arrivées PMU.

L'arrivée de Compiègne est maintenant reconnue définitive grâce aux indicateurs
explicites PMU associés à `FIN_COURSE`. Une fin de course sans preuve de finalité
reste provisoire. La correction ajoute une version et ne remplace pas l'archive.

Vérifications après déploiement :

- API publique de santé : version 0.2.0 ; accès privé sans authentification : 401.
- Collecte réelle : une observation admissible, une proposition, sept versions
  d'arrivées récupérées, aucune erreur.
- Proposition enregistrée avant départ, incluse dans l'export du jour.
- Script HTML réellement livré exécuté dans un test DOM : compteurs, bases et
  historique affichés ; nonce du script conforme à la politique CSP. Ce contrôle
  n'est pas une inspection visuelle dans un navigateur complet.
- Les empreintes des **190 observations présentes avant la migration** sont
  identiques après ; une nouvelle observation a été ajoutée.
- Calendrier Cloudflare conservé : toutes les dix minutes, minutes 7/17/27/37/47/57,
  de 06 h à 22 h 57 UTC. Le bouton manuel utilise le même collecteur et le même délai
  minimal de cinq minutes ; un passage trop rapproché ne double pas la collecte.

Ces vérifications prouvent le fonctionnement technique au déploiement, pas une
fiabilité de collecte à long terme ni la performance prédictive du modèle.

## Traçabilité et périmètre

- Worker/D1 : `elite-turf-bases-independent` uniquement.
- D1 : `519db9e9-5609-4f9d-8e89-76750da074f0`.
- Version Cloudflare : `a2815b38-fad4-4c0d-8777-d712e8bbc6a3`.
- Modèle : `pl-v1-86256ab03e7e66b7a87b`, entraîné à 07:46:09 UTC.
- Empreinte du jeu d'entraînement :
  `6c0c4c0bb5004bad4e4cfe016f84f59e94bb55b271525aabf7b5604e98eb682e`.
- Migration ajoutée : `0002_proposals.sql`, tables propres `models` et `proposals`.
- Sauvegarde SQL préalable conservée localement dans `work`, hors dépôt.
- Code : dossier `bases-quinte-service` ; bilan détaillé :
  `bases-quinte-service/reports/pilot-evaluation.json`.

Aucune écriture de cette intervention ne cible le site, les moteurs Moteur/Radar,
leurs bases, leurs dépôts ou leurs paramètres Cloudflare. Radar reste débranché.
Les autres développeurs peuvent poursuivre leurs déploiements indépendamment.

Pour suspendre les propositions tout en conservant la collecte, remettre
`SERVICE_MODE=COLLECT_ONLY` dans ce seul Worker et le redéployer. Les données
archivées sont conservées. Le modèle reste expérimental jusqu'à une évaluation
suffisante sur des courses futures indépendantes.

Références : [modèle Plackett–Luce](https://hturner.github.io/PlackettLuce/),
[pratiques Cloudflare Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
