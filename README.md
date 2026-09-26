# Elite Turf — service indépendant des bases Quinté+

Version 0.3 : collecte prospective, sélecteur de trois bases et quatrième
conditionnelle, historique privé, bilan par édition et comparaison aux arrivées officielles.
**Modèle pilote entraîné sur cinq courses : ses performances ne sont pas validées.
Les propositions restent des essais privés, sans publication aux abonnés.**

## Sélecteur et mesure des résultats

Le modèle de classement Plackett–Luce utilise les cotes du peloton complet,
la correction apportée par les probabilités du Moteur, la musique récente,
les incidents de course et l'évolution des cotes depuis la cote de référence.
Il examine les 56 trios et 70 quatuors possibles parmi les huit candidats.
Il ne reprend pas automatiquement les trois ou quatre premiers du Moteur.

Les coefficients sont ajustés par vraisemblance pénalisée avec un a priori
fort, nécessaire sur ce très petit échantillon. Les règles et seuils du pilote
ont été fixés avant d'examiner le résultat de son test ; ils ne constituent
pas des niveaux de confiance validés. Les scores de probabilité du modèle
sont explicitement non calibrés et ne sont pas affichés comme taux de réussite.

Une proposition nécessite huit candidats actifs, un marché complet exploitable,
des observations reçues depuis moins de douze minutes et un départ à plus d'une
minute. Le trio doit être suffisamment soutenu par le modèle et résister à un
test de sensibilité des corrections hors marché. Le quatuor exige en plus un
score conditionnel d'au moins 0,75, une séparation entre les quatrième et cinquième
candidats et une stabilité du groupe. À défaut, seules trois bases sont émises.

Chaque modèle et chaque décision, y compris l'abstention, sont archivés de manière
immuable. La dernière observation remplace l'ancienne pour l'affichage ; une
observation non admissible n'autorise pas à réafficher des bases précédentes.
Les bases périmées ou proches du départ sont retirées de l'affichage actif.

Le bilan prospectif utilise une référence unique par course à T−5 minutes :
la dernière décision réellement enregistrée avant cet instant et encore fraîche.
Il compte séparément trios et quatuors complets, abstentions et courses en attente.
Les arrivées provisoires, annulations et non-partants non vérifiés sont exclus.
Une base devenue non partante exclut la course de son score. Les comparatifs
Moteur et Marché utilisent la même observation et les mêmes huit candidats.
La fenêtre affichée est de trente jours ; l'export conserve chaque proposition.

Le test chronologique initial sur les archives des 21–25 septembre comporte deux
courses d'amorçage et trois courses testées : un trio complet sur trois, contre
zéro pour les trois premiers du Moteur et un pour les trois favoris du marché.
Aucun quatuor n'a franchi les critères. Ce test rétrospectif exploratoire ne
démontre aucun avantage sur le marché. Voir `reports/pilot-evaluation.json`.
Le modèle déployé a ensuite été ajusté sur les cinq courses terminées pour être
mesuré sur les courses futures, qui restent distinctes de l'apprentissage.

## Archives et bilan par édition

Toutes les décisions successives étaient déjà archivées avec l'édition du Moteur,
les huit candidats, les bases, les données sources, les heures et le modèle.
La version 0.3 ajoute `edition_references` : une référence immuable par course et
par édition Matin / T90 / T30 / T15. La règle `FIRST_RECORDED_EDITION_V1` retient
la **première décision réellement enregistrée**, même s'il s'agit d'une abstention.
Les recalculs restent dans `proposals` et ne remplacent jamais cette référence.

Un déclencheur SQLite inscrit la référence dans la même transaction que la première
proposition. La migration reprend les premières décisions déjà présentes, sans
entraîner de modèle, générer de pronostic historique ni modifier une proposition.
Les journées de collecte sans sélecteur ne deviennent donc pas des résultats de bases.

Le libellé désigne l'édition observée du Moteur : il ne garantit pas une capture
exactement 90, 30 ou 15 minutes avant départ. L'heure réelle de calcul et le nombre
de minutes avant départ sont conservés et exportés. L'analyse peut ainsi contrôler
les retards de collecte et l'heure effective d'utilisation par les abonnés.

Le bilan affiche les références, les trios/quatuors complets avec leurs dénominateurs,
les abstentions, les arrivées attendues et les exclusions. Les courses absentes
d'une édition ne sont pas considérées comme des échecs. Une comparaison séparée
utilise uniquement les courses évaluables dans **les quatre éditions** ; trios
et quatuors ont chacun leur ensemble de courses communes. Les agrégats par version
de modèle sont disponibles dans l'export afin de ne pas confondre un changement
de modèle avec l'effet de l'édition.

Le tableau couvre par défaut les 365 derniers jours et montre les 40 références
les plus récentes. L'export accepte une plage de dates de 366 jours au maximum,
avec un plafond explicite de 2 000 références par requête. Aucune purge des archives
n'est programmée ; les périodes antérieures restent accessibles avec leurs dates.
Le bilan T−5 reste affiché séparément et suit sa règle de dernière proposition
fraîche avant T−5. Il ne remplace pas le bilan des premières décisions par édition.

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
- `models`, `proposals` : modèles figés et décisions horodatées, sources et empreintes.
- `edition_references` : première décision par course/édition, liée à la proposition archivée.
- `runs` : état de chaque tentative de collecte.
- `leases`, `control` : verrou d'exécution et limitation de fréquence du service.

Les observations, sources, résultats, modèles, propositions et références d'édition refusent UPDATE, DELETE et REPLACE.
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
- `GET /api/status` : propositions actives, derniers passages, qualifications et bilan prospectif.
- `GET /api/editions?from=AAAA-MM-JJ&to=AAAA-MM-JJ` : références, bilan par édition, courses communes et ventilation par modèle.
- `GET /api/export?date=AAAA-MM-JJ` : toutes les observations et propositions du jour, références, modèles utilisés et résultats séparés.
- `POST /api/collect` : collecte manuelle, soumise au même verrou et délai minimal.

Les observations exportées ne sont pas automatiquement un jeu d'apprentissage
valide. Le script d'entraînement choisit une seule observation à T−5 par course,
contrôle les arrivées et leurs empreintes, puis effectue un test chronologique.
Les ex æquo restent évaluables en production mais sont exclus de l'entraînement
de ce premier modèle, dont la vraisemblance exige un ordre strict.

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
# Exports nommés AAAA-MM-JJ.json ; produit model.ts/model.json/evaluation.json.
npm run train -- CHEMIN_EXPORTS CHEMIN_SORTIE
```

Les tests utilisent SQLite en mémoire et des réponses simulées, sans réseau et sans
accès aux bases des moteurs. La compilation utilise Wrangler en mode dry-run.
Le modèle n'est pas réentraîné en arrière-plan. Un nouveau modèle demande une
nouvelle évaluation, le remplacement explicite de `src/model.ts`, les contrôles
ci-dessus et un déploiement de ce seul Worker. Conserver chaque version émise.

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
Les erreurs réseau et délais dépassés donnent au plus trois essais, bornés par un
délai global. La source et le code d'erreur sont journalisés. Une panne de prono
n'empêche pas de récupérer les arrivées PMU. `FIN_COURSE` n'est reconnu définitif
qu'avec un indicateur officiel explicite et non contradictoire ; les participants
sont relus pour vérifier les non-partants.

Pour revenir à la seule collecte, passer `SERVICE_MODE` à `COLLECT_ONLY` et
redéployer ce Worker. Cela masque les propositions actives et conserve l'historique.

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
- [Modèle Plackett–Luce](https://hturner.github.io/PlackettLuce/)

Les preuves de déploiement et de validation sont livrées séparément. Le mot de
passe d'administration n'est inclus ni dans ce dépôt ni dans son archive.
