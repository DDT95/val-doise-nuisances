# Nuisances dans le Val-d’Oise

Décryptage cartographique de l’Atlas territorial de la DDT 95 consacré à la coexposition au bruit des transports et à la pollution de l’air, avec observation des aéronefs en direct.

Application statique sans compilation : ouvrir `index.html` via un serveur HTTP local.

```bash
python3 -m http.server 8000
```

Les traitements, millésimes, licences et limites sont documentés dans [SOURCES.md](SOURCES.md).

## Principe acoustique

La couche structurelle utilise la cartographie officielle Airparif–Bruitparif. Les positions ADS-B en direct servent uniquement à montrer les survols. Le « signal de proximité » varie par classes d’altitude et n’est jamais présenté comme un niveau sonore en dB(A). Une modélisation acoustique réglementaire nécessiterait notamment le type moteur, la poussée, la trajectoire 3D, la météo, le terrain et le bâti.
