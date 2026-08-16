# Sources, traitements et limites

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
