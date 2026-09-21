# Elite Turf — service indépendant des bases Quinté+

Première version : collecte prospective et tableau de contrôle privé. Elle
prépare le futur sélecteur de trois ou quatre bases parmi les huit du Moteur.
**Aucun modèle de bases n'est encore entraîné ni validé. Aucune base n'est diffusée.**

## Isolation

- Worker et base D1 dédiés : `elite-turf-bases-independent`.
- Aucune route sur `elite-turf.fr` ou `prono.elite-turf.fr`, aucun changement DNS.
- Aucun import, appel de synchronisation, écriture ou migration dans les producteurs.
- Seulement des requêtes GET vers les sorties publiques existantes et PMU.
- Aucun identifiant du Moteur ou de Radar. Radar est explicitement `NOT_CONNECTED`.
- Le service peut être arrêté sans restauration des sites ou moteurs existants.

## Ce qui est collecté

Le site prono expose ses sélections récentes dans un tableau JSON embarqué dans
son HTML. L'adaptateur extrait ce JSON sans exécuter de JavaScript. Le programme
PMU identifie les courses Quinté+ par leurs codes de paris officiels. Les partants
et cotes sont lus auprès de PMU pour ces seules courses.

Le service conserve les données avant le départ, la sélection originale de huit,
l'édition effectivement affichée, les cotes et caractéristiques disponibles,
l'heure locale de réception et l'empreinte des réponses. Il ne reconstitue pas les
paramètres internes des moteurs. Un export découvert après la course ne devient
pas une observation prédictive historique.

Le refus d'une observation est explicite : sélection absente ou ambiguë, course
partie ou annulée, NO_BET ou état inconnu, identité incohérente, cheval sélectionné
non partant, cotes insuffisantes ou source reçue après la clôture des entrées.
Les données refusées avant départ restent conservées avec leurs raisons. Après
départ, seules les arrivées sont enregistrées, dans une table séparée.

Les champs prédictifs utilisent une liste d'autorisation explicite. Les arrivées,
couvertures et évaluations éventuellement présentes dans un export ne sont jamais
copiées parmi ces variables. Les réponses brutes par course sont stockées à part,
compressées et dédupliquées ; leur présence sert à l'audit, pas à l'entraînement.

## Stockage

- `source_blobs` : réponses par course, compression gzip et empreinte SHA-256.
- `observations` : instant, huit candidats, variables admises et qualification.
- `results` : arrivées officielles, finalité et versions réellement différentes.
- `runs` : état de chaque tentative de collecte.
- `leases`, `control` : verrou d'exécution et limitation de fréquence du service.

Les observations, sources et résultats refusent UPDATE, DELETE et REPLACE.
L'écriture d'une observation et de ses sources est atomique avec D1 batch.
Les empreintes sont contrôlées à la lecture des observations. Il s'agit d'une
protection applicative contre les erreurs et corruptions, pas d'une attestation
externe empêchant un administrateur de réécrire la base.

Les résultats des sept jours précédents sont relus une fois par jour UTC pour
relever les corrections. Les corrections plus anciennes demandent une extension
explicite de cette fenêtre. Les ex æquo sont évaluables selon leur rang de
classement, sans inventer un ordre entre chevaux à égalité.

## Tableau privé

Le Worker expose `/health` sans données de courses. Tous les autres chemins exigent
le secret `ADMIN_TOKEN`, sous forme d'authentification HTTP Basic (identifiant
`elite`) ou d'un Bearer token. Un secret absent ferme l'accès ; les pages privées
ne sont pas mises en cache et les requêtes de collecte d'une autre origine sont refusées.

- `/` : tableau de contrôle privé.
- `GET /api/status` : derniers passages et qualifications.
- `GET /api/export?date=AAAA-MM-JJ` : observations du jour et résultats séparés.
- `POST /api/collect` : collecte manuelle, soumise au même verrou et délai minimal.

Les observations exportées ne sont pas encore un jeu d'apprentissage validé.
Il faudra choisir une heure de décision, éviter de compter plusieurs observations
d'une même course comme des courses indépendantes, qualifier les labels et réserver
des courses futures pour l'évaluation. Le moteur devra être comparé aux trois/quatre
premiers du Moteur et aux favoris du marché parmi les mêmes huit.

## Développement et vérification

Node 24 ou ultérieur. Les dépendances de développement sont épinglées dans le lockfile.
Aucune dépendance npm d'exécution n'est ajoutée au Worker.

```sh
npm ci
# Pour le développement seulement, créer .dev.vars avec un ADMIN_TOKEN fictif >=32 caractères.
npm run types
npm test
npm run typecheck
npm run lint
npm run build
```

Les tests utilisent SQLite en mémoire et des réponses simulées, sans réseau et sans
accès aux bases des moteurs. La compilation utilise Wrangler en mode dry-run.

## Exploitation

La configuration activée est un passage toutes les dix minutes, aux minutes
7, 17, 27, 37, 47 et 57 de 06 h à 22 h 57 UTC. Les déclenchements Cloudflare ne
constituent pas une garantie d'exécution à la seconde. La vérification du départ
repose toujours sur l'heure effective de réception, pas sur le nom de l'édition.
La première collecte réelle a réussi le 21 septembre 2026 à 08:38 UTC :
une observation admissible du Quinté+ de La Capelle, avant départ, et sept
arrivées précédentes enregistrées séparément. Le calendrier est activé ensuite.
Adresse du tableau privé : https://elite-turf-bases-independent.manuel-conti2008.workers.dev/

Une panne amont donne un état ERROR ou DEGRADED dans ce service. Il ne pilote jamais
un redémarrage ou une modification des producteurs. Une absence de données n'est
pas interprétée comme une observation réussie.

Pour arrêter la collecte : retirer les crons de ce Worker et passer uniquement
sa variable `COLLECTION_ENABLED` à `false`, puis redéployer. Conserver la base D1.
Les secrets doivent être transmis avec `wrangler secret put ADMIN_TOKEN`, jamais
ajoutés au dépôt. Export de sauvegarde :

```sh
npx wrangler d1 export elite-turf-bases-independent --remote --output sauvegarde.sql
```

Ce nom désigne exclusivement la base du nouveau service. La modification de
`wrangler.jsonc` doit toujours préserver cette séparation.

## Références techniques

- [Pratiques Cloudflare Workers](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Transactions D1 par batch](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Déclenchements programmés](https://developers.cloudflare.com/workers/configuration/cron-triggers/)

Les preuves de déploiement et de validation sont livrées séparément. Le mot de
passe d'administration n'est inclus ni dans ce dépôt ni dans son archive.
