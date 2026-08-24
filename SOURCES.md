# Sources, traitements et limites

## Cartes stratégiques de bruit du Val-d’Oise

- Bruit routier, type A, indicateur nocturne Ln, troisième échéance : https://www.data.gouv.fr/datasets/carte-strategique-du-bruit-infrastructures-routiere-type-a-lden
- Bruit ferroviaire SNCF, type A, indicateur Lden, troisième échéance : https://www.data.gouv.fr/datasets/carte-strategique-du-bruit-infrastructures-ferroviaire-sncf-type-a-lden
- Producteur et diffuseur : DDT du Val-d’Oise.
- Licence : Licence Ouverte 2.0.

Les couches sont rasterisées à 100 mètres pour la consultation web. La valeur de classe reste interrogeable sur la carte. Les routes principales et voies ferrées nommées proviennent d’OpenStreetMap, extraction du 16 août 2026, ODbL.

## Classement sonore routier (arrêté préfectoral n°17-146)

- Tronçons classés : https://www.data.gouv.fr/datasets/classement-sonore-des-infrastructures-routieres-3
- Empreinte sonore (secteurs affectés par le bruit) : https://www.data.gouv.fr/datasets/empreinte-sonore-du-classement-des-infrastructures-routieres
- Producteur et diffuseur : DDT du Val-d'Oise.
- Licence : Licence Ouverte 2.0.

Ces deux couches sont synchronisées une fois par jour par une action GitHub
(`.github/workflows/sync-cs-route.yml`, script `scripts/sync-cs-route.py`),
sur le même principe que les flux Sytadin/ADS-B/Airparif de ce dépôt : le
serveur appelle `GetCapabilities` pour découvrir le nom technique de chaque
couche puis `GetFeature` en sortie GeoJSON, et le résultat est commité dans
`data/cs-lines.geojson` et `data/cs-buffer.geojson`. Cet appel ne peut pas se
faire directement depuis le navigateur des visiteurs : le WFS de la DDT 95 ne
renvoie pas d'en-tête CORS (`Access-Control-Allow-Origin`), une tentative
d'appel client a échoué en pratique avant ce choix d'architecture. Si la
synchronisation échoue, le site l'indique au lieu d'afficher une donnée
périmée ou inventée.

Le widget « Vérifier un logement » géocode l'adresse saisie via l'API Adresse
nationale (https://api-adresse.data.gouv.fr/, sans clé, licence ouverte), puis
calcule la distance du point à chaque tronçon classé et la compare à la
largeur réglementaire du secteur affecté (colonne « es », identique à la
colonne « Secteur (m) » de l'annexe 3 de l'arrêté). C'est une lecture
indicative : elle ignore la demi-largeur de la chaussée (quelques mètres,
prévue par la méthodologie DDT 95 mais non reconstituable depuis les couches
publiées) et ne couvre pas le bruit ferroviaire ni aérien. Pour toute
démarche réglementaire (isolement acoustique, permis de construire),
consulter l'arrêté n°17-146 et le service instructeur de la DDT 95.

## Circulation routière directe

- Service officiel francilien : https://www.sytadin.fr/
- Données ouvertes nationales Bison Futé : https://www.data.gouv.fr/datasets/etat-de-circulation-en-temps-reel-sur-le-reseau-national-routier-non-concede

Le flux Bison Futé est mis à jour toutes les six minutes, mais son référentiel public ne contient actuellement pas les stations de la DiRIF nécessaires pour cartographier correctement le Val-d’Oise. La carte renvoie donc vers Sytadin et n’invente ni vitesse ni débit local.

## Coexposition air-bruit 2024

- Producteurs : Airparif et Bruitparif.
- Source : https://www.bruitparif.fr/opendata-air-bruit/
- Fichiers : `Couches SIG air-bruit 2024_9_classes.zip` et `Statistiques air-bruit 2024.xlsx`.
- Citation demandée : « Source des données : Cartographie air-bruit établie par Airparif et Bruitparif – http://carto.airparif.bruitparif.fr ».
- Licence : Licence Ouverte pour les données SIG Bruitparif ; données Airparif sous ODbL.
- Méthode : https://www.bruitparif.fr/la-methodologie-d-elaboration-de-la-cartographie-air-bruit/

La carte stratégique de l’air agrège les moyennes annuelles de NO₂, PM₁₀ et PM₂,₅. La carte stratégique globale du bruit agrège les transports routier, ferroviaire et aérien. Le millésime de publication est 2024 ; hors périphérique parisien, les données acoustiques reposent principalement sur les conditions de trafic 2019 et les cartes de quatrième échéance 2022.

### Traitement local

1. Découpage de la couche régionale à l’emprise du Val-d’Oise.
2. Rasterisation à 100 m pour une consultation web légère, sans réinterprétation des neuf classes officielles.
3. Extraction des lignes du département 95 dans le tableur communal.
4. Calcul des parts de population par addition des classes officielles : air très dégradé = classes 31, 32, 33 ; bruit très dégradé = 13, 23, 33 ; cumul maximal = 33.

## Aéronefs en direct

- Producteur : réseau communautaire ADSB.lol.
- API : https://api.adsb.lol/
- Licence des données : ODbL 1.0.
- Requête : aéronefs dans un rayon de 45 milles nautiques autour du centre du Val-d’Oise, renouvelée toutes les 60 secondes.

Les positions dépendent de la réception ADS-B/MLAT. Des aéronefs peuvent manquer, avoir une altitude absente ou une position retardée.

### Signal de proximité acoustique

Le score affiché est une convention visuelle, non réglementaire : 90 sous 3 000 ft, 65 entre 3 000 et 7 000 ft, 38 entre 7 000 et 12 000 ft, 15 au-delà. Il traduit seulement que la distance verticale influence fortement le niveau reçu. Il ne calcule pas de dB(A) et ne remplace ni ECAC Doc 29, ni CNOSSOS, ni une mesure Bruitparif.

## Limites assumées

- La coexposition structurelle ne décrit pas le bruit minute par minute.
- Le flux aérien direct ne décrit pas à lui seul l’exposition acoustique.
- Le trafic routier direct n’est pas superposé : sans composition des véhicules, vitesse, revêtement, météorologie et propagation, sa transformation en niveau sonore serait trompeuse.
- Les pourcentages communaux sont des estimations de population exposée, non des mesures individuelles.
