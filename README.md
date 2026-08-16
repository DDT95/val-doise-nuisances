# Nuisances dans le Val-d’Oise

Décryptage cartographique de l’Atlas territorial de la DDT 95 consacré aux nuisances routières, ferroviaires et aériennes ainsi qu’à la qualité de l’air.

La carte sépare les sources : cartes stratégiques de bruit routier et ferroviaire, axes nommés, voies ferrées nommées, aéronefs ADS-B en direct, indicateurs communaux Airparif et accès au trafic Sytadin.

Application statique sans compilation : ouvrir `index.html` via un serveur HTTP local.

```bash
python3 -m http.server 8000
```

Les traitements, millésimes, licences et limites sont documentés dans [SOURCES.md](SOURCES.md).

## Principe acoustique

Les positions ADS-B en direct servent uniquement à montrer les survols. L’anneau varie par classes d’altitude et n’est jamais présenté comme un niveau sonore en dB(A). Une modélisation acoustique réglementaire nécessiterait notamment le type moteur, la poussée, la trajectoire 3D, la météo, le terrain et le bâti.
