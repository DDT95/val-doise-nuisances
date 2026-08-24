# Sources, traitements et limites

## Cartes stratégiques de bruit du Val-d’Oise

- Bruit routier, type A, indicateur nocturne Ln, troisième échéance : https://www.data.gouv.fr/datasets/carte-strategique-du-bruit-infrastructures-routiere-type-a-lden
- Bruit ferroviaire SNCF, type A, indicateur Lden, troisième échéance : https://www.data.gouv.fr/datasets/carte-strategique-du-bruit-infrastructures-ferroviaire-sncf-type-a-lden
- Producteur et diffuseur : DDT du Val-d’Oise.
- Licence : Licence Ouverte 2.0.

Les couches sont rasterisées à 100 mètres pour la consultation web. La valeur de classe reste interrogeable sur la carte. Les routes principales et voies ferrées nommées proviennent d’OpenStreetMap, extraction du 16 août 2026, ODbL.

## Classement sonore routier (arrêté préfectoral n°17-146) et ferroviaire (arrêté préfectoral n°16249)

- Tronçons routiers classés : https://www.data.gouv.fr/datasets/classement-sonore-des-infrastructures-routieres-3
- Empreinte sonore routière : https://www.data.gouv.fr/datasets/empreinte-sonore-du-classement-des-infrastructures-routieres
- Tronçons ferroviaires classés et empreintes, par exploitant : SNCF, RATP, Société du Grand Paris (jeux « Classement sonore des infrastructures ferroviaires (SNCF/RATP/SGP) » et « Empreinte sonore … » correspondants sur data.gouv.fr).
- Producteur et diffuseur : DDT du Val-d'Oise.
- Licence : Licence Ouverte 2.0.

Ces huit couches (2 routières + 3 exploitants ferroviaires × 2) sont
synchronisées une fois par jour par une action GitHub
(`.github/workflows/sync-cs-route.yml`, script `scripts/sync-cs-route.py`),
sur le même principe que les flux Sytadin/ADS-B de ce dépôt : le
serveur appelle `GetCapabilities` pour découvrir le nom technique de chaque
couche puis `GetFeature` en sortie GeoJSON, et le résultat est commité dans
`data/cs-*.geojson`. Cet appel ne peut pas se faire directement depuis le
navigateur des visiteurs : le WFS de la DDT 95 ne renvoie pas d'en-tête CORS
(`Access-Control-Allow-Origin`), une tentative d'appel client a échoué en
pratique avant ce choix d'architecture. Si la synchronisation échoue, le
site l'indique au lieu d'afficher une donnée périmée ou inventée.

Les cinq catégories du classement sonore partagent la même largeur de
secteur affecté quel que soit le mode de transport (arrêté du 30 mai 1996,
art. 3) : 1 = 300 m, 2 = 250 m, 3 = 100 m, 4 = 30 m, 5 = 10 m. Pour le
routier, l'arrêté n°17-146 publie en plus les niveaux sonores de référence
LAeq associés à chaque catégorie (ex. catégorie 1 : jour > 81 dB(A), nuit
> 76 dB(A)) ; ces valeurs précises n'ont pas été confirmées à l'identique
pour le ferroviaire à partir des sources consultées, donc le site n'affiche
que la largeur de secteur pour ce mode. Dans un secteur affecté, toute
construction neuve à usage sensible (habitation, enseignement, santé,
hôtellerie) doit respecter un isolement acoustique renforcé, calculé selon
la méthode forfaitaire de l'arrêté du 30 mai 1996 (catégorie 1 = isolement
le plus renforcé).

Un clic n'importe où sur la carte calcule la distance du point au tronçon
classé le plus proche (route et rail) et la compare à la largeur
réglementaire du secteur affecté (colonne « es » côté route, « tampon » côté
rail — identique à la colonne « Secteur (m) » de l'annexe 3 de l'arrêté
routier). Le panneau affiche aussi, quand elle est disponible, la classe de
bruit modélisée par les cartes stratégiques (Ln routier, Lden ferroviaire),
dans le même panneau. C'est une lecture indicative : elle ignore la demi-largeur de la chaussée ou
de la voie (quelques mètres, prévue par la méthodologie DDT 95 mais non
reconstituable depuis les couches publiées) et ne couvre pas le bruit
aérien. Pour toute démarche réglementaire (isolement acoustique, permis de
construire), consulter l'arrêté n°17-146 (routier), l'arrêté n°16249
(ferroviaire) et le service instructeur de la DDT 95.

Ce site s'adresse à un public professionnel (agents instructeurs,
collectivités, bureaux d'études) : la lecture des couches et du panneau de
clic suppose une familiarité avec le classement sonore. Il n'y a pas de
recherche d'adresse dédiée — seule la recherche de commune, en haut du menu,
reste disponible pour se déplacer sur la carte.

## Circulation routière directe

- Service officiel francilien : https://www.sytadin.fr/
- Données ouvertes nationales Bison Futé : https://www.data.gouv.fr/datasets/etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede

Le flux Bison Futé est mis à jour toutes les six minutes, mais son référentiel public ne contient actuellement pas les stations de la DiRIF nécessaires pour cartographier correctement le Val-d’Oise. La carte renvoie donc vers Sytadin et n’invente ni vitesse ni débit local.

## Bruit très dégradé par commune (synthèse départementale)

- Producteur : Bruitparif (à partir du jeu air-bruit co-produit avec Airparif).
- Source : https://www.bruitparif.fr/opendata-air-bruit/
- Fichiers : `Couches SIG air-bruit 2024_9_classes.zip` et `Statistiques air-bruit 2024.xlsx` — seule la composante bruit est utilisée par ce site.
- Citation demandée : « Source des données : Cartographie air-bruit établie par Airparif et Bruitparif – http://carto.airparif.bruitparif.fr ».
- Licence : Licence Ouverte pour les données SIG Bruitparif.
- Méthode : https://www.bruitparif.fr/la-methodologie-d-elaboration-de-la-cartographie-air-bruit/

La carte stratégique globale du bruit agrège les transports routier, ferroviaire et aérien. Le millésime de publication est 2024 ; hors périphérique parisien, les données acoustiques reposent principalement sur les conditions de trafic 2019 et les cartes de quatrième échéance 2022. Ce site n'affiche que la composante bruit de ce jeu de données ; la qualité de l'air est traitée sur un autre support et n'est pas reprise ici.

### Traitement local

1. Découpage de la couche régionale à l’emprise du Val-d’Oise.
2. Extraction des lignes du département 95 dans le tableur communal.
3. Calcul de la part de population en bruit très dégradé par addition des classes officielles 13, 23, 33.

## Aéronefs en direct

- Producteur : réseau communautaire ADSB.lol.
- API : https://api.adsb.lol/
- Licence des données : ODbL 1.0.
- Requête : aéronefs dans un rayon de 45 milles nautiques autour du centre du Val-d’Oise, renouvelée toutes les 60 secondes.

Les positions dépendent de la réception ADS-B/MLAT. Des aéronefs peuvent manquer, avoir une altitude absente ou une position retardée.

### Signal de proximité acoustique

Le score affiché est une convention visuelle, non réglementaire : 90 sous 3 000 ft, 65 entre 3 000 et 7 000 ft, 38 entre 7 000 et 12 000 ft, 15 au-delà. Il traduit seulement que la distance verticale influence fortement le niveau reçu. Il ne calcule pas de dB(A) et ne remplace ni ECAC Doc 29, ni CNOSSOS, ni une mesure Bruitparif.

## Limites assumées

- Les statistiques de bruit très dégradé décrivent une exposition structurelle, pas le bruit minute par minute.
- Le flux aérien direct ne décrit pas à lui seul l’exposition acoustique.
- Le trafic routier direct n’est pas superposé : sans composition des véhicules, vitesse, revêtement, météorologie et propagation, sa transformation en niveau sonore serait trompeuse.
- Les pourcentages communaux sont des estimations de population exposée, non des mesures individuelles.
