const $ = (id) => document.getElementById(id),
  map = L.map("map", { zoomControl: false }).setView([49.08, 2.1], 10);
L.control.zoom({ position: "bottomright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);
map.createPane("noise");
map.getPane("noise").style.zIndex = 410;
map.createPane("traffic");
map.getPane("traffic").style.zIndex = 420;
map.createPane("network");
map.getPane("network").style.zIndex = 430;
map.createPane("territoryMask");
map.getPane("territoryMask").style.zIndex = 440;
map.getPane("territoryMask").style.pointerEvents = "none";
const bounds = [
    [48.911488, 1.6035671],
    [49.248488, 2.5965671],
  ],
  state = {
    layers: {},
    stats: {},
    active: new Set(["roadNoise", "roads", "communes", "csRoad", "csRail"]),
    data: {},
  };
function openDetail(html) {
  $("detailContent").innerHTML = html;
  $("detailPanel").classList.add("open");
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function fmt(n, d = 0) {
  return Number(n || 0).toLocaleString("fr-FR", { maximumFractionDigits: d });
}
function noiseColor(v) {
  return v >= 70
    ? "#691635"
    : v >= 65
      ? "#ab202f"
      : v >= 60
        ? "#e05b31"
        : v >= 55
          ? "#f5a623"
          : v >= 50
            ? "#ffe05b"
            : v >= 45
              ? "#74c476"
              : "#57abd2";
}
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
function insideTerritory(lon, lat) {
  const geometry = state.data.buffer?.features?.[0]?.geometry;
  if (!geometry) return true;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(
    (polygon) =>
      pointInRing(lon, lat, polygon[0]) &&
      !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole)),
  );
}
function addTerritoryMask(buffer) {
  const geometry = buffer.features[0].geometry;
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const world = [
    [-85, -180],
    [-85, 180],
    [85, 180],
    [85, -180],
  ];
  const holes = polygons.map((polygon) =>
    polygon[0].map(([lon, lat]) => [lat, lon]),
  );
  state.layers.territoryMask = L.polygon([world, ...holes], {
    pane: "territoryMask",
    stroke: false,
    fillColor: "#eef1f4",
    fillOpacity: 1,
    fillRule: "evenodd",
    interactive: false,
  }).addTo(map);
}
const roadNoise = L.imageOverlay("data/noise-road.png", bounds, {
    pane: "noise",
    opacity: 0.76,
  }),
  railNoise = L.imageOverlay("data/noise-rail.png", bounds, {
    pane: "noise",
    opacity: 0.78,
  });
state.layers.roadNoise = roadNoise;
state.layers.railNoise = railNoise;
roadNoise.addTo(map);
const trafficLayer = L.layerGroup();
state.layers.traffic = trafficLayer;
async function loadTraffic() {
  try {
    const [sync, grid] = await Promise.all([
      fetch(`data/traffic-sync.json?v=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json()),
      fetch("data/sytadin-tiles.json").then((r) => r.json()),
    ]);
    trafficLayer.clearLayers();
    for (const t of grid.tiles)
      L.imageOverlay(
        `data/traffic/${grid.zoom}/${t.x}-${t.y}.png?v=${sync.dossier}`,
        t.bounds,
        { pane: "traffic", opacity: 0.95, interactive: false },
      ).addTo(trafficLayer);
    const stamp = new Date(Number(sync.date_bch) * 1000);
    $("trafficStatus").textContent =
      `Sytadin · ${stamp.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · actualisé ≤ 5 min`;
    $("mapStatus").textContent =
      "Trafic Sytadin chargé · vert fluide, orange ralenti, rouge saturé";
  } catch {
    $("trafficStatus").textContent =
      "Sytadin · flux momentanément indisponible";
  }
}
loadTraffic();
setInterval(loadTraffic, 120000);
const samplers = {};
for (const [key, url] of [
  ["roadNoise", "data/noise-road.png"],
  ["railNoise", "data/noise-rail.png"],
]) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    samplers[key] = { canvas: c, w: img.width, h: img.height };
  };
  img.src = url;
}
Promise.all(
  [
    "communes.geojson",
    "commune_stats.json",
    "roads.geojson",
    "rails.geojson",
    "valdoise-buffer-1km.geojson",
  ].map((f) => fetch("data/" + f).then((r) => r.json())),
).then(([communes, stats, roads, rails, buffer]) => {
  state.stats = stats;
  state.data.communes = communes;
  state.data.buffer = buffer;
  addTerritoryMask(buffer);
  state.layers.roads = L.geoJSON(roads, {
    pane: "network",
    style: (f) => ({
      color: f.properties.type === "motorway" ? "#d1495b" : "#c77b30",
      weight: f.properties.type === "motorway" ? 4 : 2.4,
      opacity: 0.9,
    }),
    onEachFeature: (f, l) =>
      l
        .bindTooltip(`<strong>${esc(f.properties.name)}</strong>`, {
          sticky: true,
        })
        .on("click", () => showRoad(f.properties)),
  }).addTo(map);
  state.layers.rails = L.geoJSON(rails, {
    pane: "network",
    style: { color: "#5c3a8c", weight: 2.5, opacity: 0.9, dashArray: "8 3" },
    onEachFeature: (f, l) =>
      l
        .bindTooltip(`<strong>${esc(f.properties.name)}</strong>`, {
          sticky: true,
        })
        .on("click", () => showRail(f.properties)),
  });
  state.layers.communes = L.geoJSON(communes, {
    style: { color: "#263b57", weight: 0.7, opacity: 0.62, fillOpacity: 0.01 },
    onEachFeature: (f, l) => {
      const code = String(
        f.properties.code || f.properties.insee || f.properties.INSEE_COM || "",
      );
      l.bindTooltip(stats[code]?.nom || f.properties.nom, { sticky: true });
      l.on("click", () => showCommune(code));
    },
  }).addTo(map);
  map.fitBounds(state.layers.communes.getBounds(), { padding: [16, 16] });
  setupSearch(communes);
  renderLiveAir();
  loadAircraft();
});
function showRoad(p) {
  openDetail(
    `<span class="detail-tag">AXE ROUTIER</span><h2>${esc(p.name)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>Référence</small><strong>${esc(p.ref || "—")}</strong></div><div class="kpi-tile warn"><small>Catégorie</small><strong>${esc(p.type)}</strong></div></div><h3>Lecture</h3><p>Activez « Niveaux sonores routiers » pour voir les classes acoustiques modélisées autour de cet axe. La carte nocturne commence à 40 dB(A).</p><a class="profile-link" href="https://www.sytadin.fr/" target="_blank">Voir la circulation en direct ↗</a>`,
  );
}
function showRail(p) {
  openDetail(
    `<span class="detail-tag">INFRASTRUCTURE FERROVIAIRE</span><h2>${esc(p.name)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>Référence</small><strong>${esc(p.ref || "—")}</strong></div><div class="kpi-tile warn"><small>Type</small><strong>Voie ferrée</strong></div></div><h3>Lecture</h3><p>Activez « Niveaux sonores ferroviaires » pour afficher les secteurs exposés à partir de 55 dB(A) Lden autour du réseau.</p>`,
  );
}
// --- Classement sonore routier (arrêté n°17-146) et ferroviaire (arrêté n°16249) ---
// Les couches sont synchronisées côté serveur (GitHub Actions, voir
// .github/workflows/sync-cs-route.yml) car le WFS de la DDT 95 ne renvoie
// pas d'en-tête CORS et ne peut donc pas être appelé depuis le navigateur.
function getProp(props, ...names) {
  const lower = {};
  for (const k in props) lower[k.toLowerCase()] = props[k];
  for (const n of names) {
    const v = lower[n.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
function csCategoryColor(cat) {
  const n = Number(cat);
  return n === 1
    ? "#691635"
    : n === 2
      ? "#ab202f"
      : n === 3
        ? "#e05b31"
        : n === 4
          ? "#f5a623"
          : n === 5
            ? "#ffe05b"
            : "#8a97a8";
}
// Largeurs de secteur communes à tous les modes (arrêté du 30 mai 1996, art. 3) ;
// les niveaux de référence dB(A) ci-dessous sont ceux publiés pour le routier
// (arrêté n°17-146, art. 2) — non confirmés à l’identique pour le ferroviaire.
const CATEGORY_INFO = {
  1: { width: 300, day: "> 81 dB(A)", night: "> 76 dB(A)" },
  2: { width: 250, day: "76 à 81 dB(A)", night: "71 à 76 dB(A)" },
  3: { width: 100, day: "70 à 76 dB(A)", night: "65 à 71 dB(A)" },
  4: { width: 30, day: "65 à 70 dB(A)", night: "60 à 65 dB(A)" },
  5: { width: 10, day: "60 à 65 dB(A)", night: "55 à 60 dB(A)" },
};
function categoryLegendNote(roadCat, railCat) {
  const parts = [];
  if (CATEGORY_INFO[roadCat])
    parts.push(
      `Catégorie ${roadCat} routière (arrêté n°17-146) : référence diurne ${CATEGORY_INFO[roadCat].day}, nocturne ${CATEGORY_INFO[roadCat].night}, secteur de ${CATEGORY_INFO[roadCat].width} m.`,
    );
  if (CATEGORY_INFO[railCat])
    parts.push(
      `Catégorie ${railCat} ferroviaire (arrêté n°16249) : secteur de ${CATEGORY_INFO[railCat].width} m.`,
    );
  if (!parts.length) return "";
  return `<p class="flag-note">${parts.join(" ")} Plus la catégorie est basse (1 = la plus sévère), plus l’isolement acoustique exigé pour une construction neuve y est renforcé (méthode forfaitaire, arrêté du 30 mai 1996).</p>`;
}
function csLineLayer(mode, operator) {
  return L.geoJSON(null, {
    pane: "network",
    style: (f) => ({
      color: csCategoryColor(getProp(f.properties, "categorie")),
      weight: 3,
      opacity: 0.9,
      dashArray: mode === "rail" ? "1 6" : null,
    }),
    onEachFeature: (f, l) => {
      if (operator) f.properties._operator = operator;
      // Pas de handler de clic dédié : un clic n'importe où sur la carte
      // ouvre le rapport combiné de toutes les nuisances à ce point (voir
      // plus bas), y compris quand on clique pile sur un tronçon.
      l.bindTooltip(
        `<strong>${esc(getProp(f.properties, "name", "nom", "codeligne", "ligneratp") ?? "Tronçon")}</strong> · catégorie ${esc(getProp(f.properties, "categorie") ?? "—")}`,
        { sticky: true },
      );
    },
  });
}
function csBufferLayer() {
  return L.geoJSON(null, {
    pane: "noise",
    style: () => ({
      color: "#8a97a8",
      weight: 1,
      fillColor: "#8a97a8",
      fillOpacity: 0.28,
    }),
  });
}
state.layers.csRoadLines = csLineLayer("road");
state.layers.csRoadBuffer = csBufferLayer();
state.layers.csRoad = L.layerGroup([
  state.layers.csRoadLines,
  state.layers.csRoadBuffer,
]).addTo(map);
const RAIL_OPERATORS = [
  { key: "sncf", label: "SNCF" },
  { key: "ratp", label: "RATP" },
  { key: "sgp", label: "SGP" },
];
const csRailSub = [];
for (const op of RAIL_OPERATORS) {
  op.linesLayer = csLineLayer("rail", op.label);
  op.bufferLayer = csBufferLayer();
  csRailSub.push(op.linesLayer, op.bufferLayer);
}
state.layers.csRail = L.layerGroup(csRailSub).addTo(map);
async function fetchGeoJSON(file) {
  const res = await fetch(`data/${file}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function loadCsRoute() {
  $("csRoadStatus").textContent = "Chargement…";
  $("csRailStatus").textContent = "Chargement…";
  const [roadLines, roadBuffer, ...railResults] = await Promise.allSettled([
    fetchGeoJSON("cs-lines.geojson"),
    fetchGeoJSON("cs-buffer.geojson"),
    ...RAIL_OPERATORS.flatMap((op) => [
      fetchGeoJSON(`cs-rail-${op.key}-lines.geojson`),
      fetchGeoJSON(`cs-rail-${op.key}-buffer.geojson`),
    ]),
  ]);
  if (roadLines.status === "fulfilled" && roadLines.value.features.length) {
    state.data.csRoadLines = roadLines.value;
    state.layers.csRoadLines.addData(roadLines.value);
  } else if (roadLines.status === "rejected") {
    console.warn("CS Route routier (lignes) indisponible :", roadLines.reason);
  }
  if (roadBuffer.status === "fulfilled" && roadBuffer.value.features.length) {
    state.layers.csRoadBuffer.addData(roadBuffer.value);
  } else if (roadBuffer.status === "rejected") {
    console.warn("CS Route routier (empreinte) indisponible :", roadBuffer.reason);
  }
  $("csRoadStatus").textContent = state.data.csRoadLines
    ? `${state.data.csRoadLines.features.length} tronçons classés · arrêté n°17-146`
    : "Synchronisation en cours, réessayez plus tard";
  const railFeatures = [];
  RAIL_OPERATORS.forEach((op, i) => {
    const linesResult = railResults[i * 2];
    const bufferResult = railResults[i * 2 + 1];
    if (linesResult.status === "fulfilled" && linesResult.value.features.length) {
      linesResult.value.features.forEach((f) => (f.properties._operator = op.label));
      railFeatures.push(...linesResult.value.features);
      op.linesLayer.addData(linesResult.value);
    } else if (linesResult.status === "rejected") {
      console.warn(`CS Rail ${op.label} (lignes) indisponible :`, linesResult.reason);
    }
    if (bufferResult.status === "fulfilled" && bufferResult.value.features.length) {
      op.bufferLayer.addData(bufferResult.value);
    } else if (bufferResult.status === "rejected") {
      console.warn(`CS Rail ${op.label} (empreinte) indisponible :`, bufferResult.reason);
    }
  });
  if (railFeatures.length) {
    state.data.csRailLines = { type: "FeatureCollection", features: railFeatures };
    $("csRailStatus").textContent =
      `${railFeatures.length} tronçons classés (SNCF/RATP/SGP) · arrêté n°16249`;
  } else {
    $("csRailStatus").textContent = "Synchronisation en cours, réessayez plus tard";
  }
}
loadCsRoute();
// --- Vérifier un logement : géocodage BAN + nuisances sonores au point ---
function distPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax,
    dy = by - ay,
    len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function toMeters(lon, lat, lat0) {
  const rad = Math.PI / 180,
    R = 6371000;
  return [lon * rad * R * Math.cos(lat0 * rad), lat * rad * R];
}
function distToLineFeature(lon, lat, geometry) {
  const [px, py] = toMeters(lon, lat, lat);
  const lines =
    geometry.type === "MultiLineString"
      ? geometry.coordinates
      : [geometry.coordinates];
  let min = Infinity;
  for (const line of lines)
    for (let i = 0; i < line.length - 1; i++) {
      const [ax, ay] = toMeters(line[i][0], line[i][1], lat);
      const [bx, by] = toMeters(line[i + 1][0], line[i + 1][1], lat);
      min = Math.min(min, distPointToSegment(px, py, ax, ay, bx, by));
    }
  return min;
}
function regulatoryMatches(lon, lat, geojson) {
  if (!geojson) return [];
  const matches = [];
  for (const f of geojson.features) {
    const es = Number(getProp(f.properties, "es", "tampon"));
    if (!es || !f.geometry) continue;
    if (distToLineFeature(lon, lat, f.geometry) <= es)
      matches.push({
        props: f.properties,
        cat: Number(getProp(f.properties, "categorie")) || 9,
      });
  }
  return matches.sort((a, b) => a.cat - b.cat);
}
function matchTile(m) {
  const name = esc(
    getProp(m.props, "name", "nom", "codeligne", "ligneratp") ?? "Tronçon",
  );
  const operator = getProp(m.props, "_operator");
  const cat = esc(getProp(m.props, "categorie") ?? "—");
  const width = esc(getProp(m.props, "es", "tampon") ?? "—");
  return `<div class="kpi-tile warn"><small>${operator ? esc(operator) + " · " : ""}${name}</small><strong>Catégorie ${cat}</strong><em>Secteur ${width} m</em></div>`;
}
function communeAt(lon, lat) {
  const communes = state.data.communes;
  if (!communes) return null;
  for (const f of communes.features) {
    const geom = f.geometry;
    if (!geom) continue;
    const polygons =
      geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : null;
    if (!polygons) continue;
    for (const polygon of polygons) {
      if (
        pointInRing(lon, lat, polygon[0]) &&
        !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole))
      )
        return f;
    }
  }
  return null;
}
function showNuisancesAt(lon, lat) {
  if (state.layers.clickMarker) map.removeLayer(state.layers.clickMarker);
  state.layers.clickMarker = L.marker([lat, lon]).addTo(map);
  const roadReady = !!state.data.csRoadLines,
    railReady = !!state.data.csRailLines;
  const road = regulatoryMatches(lon, lat, state.data.csRoadLines);
  const rail = regulatoryMatches(lon, lat, state.data.csRailLines);
  const hasMatch = road.length || rail.length;
  const latlng = L.latLng(lat, lon);
  const roadDb = sampleNoise("roadNoise", latlng);
  const railDb = sampleNoise("railNoise", latlng);

  let regHtml;
  if (!roadReady && !railReady) {
    regHtml = `<p class="flag-note">Le service de classement sonore n’a pas pu être chargé. Réessayez dans quelques instants.</p>`;
  } else if (hasMatch) {
    regHtml =
      `<div class="kpi-grid">${[...road.slice(0, 2), ...rail.slice(0, 2)].map(matchTile).join("")}</div>` +
      categoryLegendNote(road[0]?.cat, rail[0]?.cat);
  } else {
    regHtml = `<p>Aucun tronçon routier (arrêté n°17-146) ou ferroviaire (arrêté n°16249) classé ne place ce point dans un secteur affecté par le bruit.</p>`;
  }
  const noiseHtml =
    roadDb || railDb
      ? `<h3>Bruit · carte stratégique</h3><div class="kpi-grid">${
          roadDb
            ? `<div class="kpi-tile"><small>Routier · Ln</small><strong>${roadDb} à ${roadDb + 5} dB(A)</strong></div>`
            : ""
        }${
          railDb
            ? `<div class="kpi-tile"><small>Ferroviaire · Lden</small><strong>${railDb} à ${railDb + 5} dB(A)</strong></div>`
            : ""
        }</div>`
      : "";
  const commune = communeAt(lon, lat);
  const communeCode = commune
    ? String(
        commune.properties.code || commune.properties.insee || commune.properties.INSEE_COM || "",
      )
    : null;
  const s = communeCode ? state.stats[communeCode] : null;
  const a = communeCode ? state.data.liveAir?.[communeCode] : null;
  const airHtml = s
    ? `<h3>Air · ${esc(s.nom)}</h3><div class="kpi-grid">${
        a ? `<div class="kpi-tile"><small>Indice ATMO aujourd’hui</small><strong>${esc(a.lib_qual)}</strong></div>` : ""
      }<div class="kpi-tile"><small>Air très dégradé (2024)</small><strong>${fmt(s.air_degrade_pct, 1)} %</strong><em>part de la population communale</em></div></div>`
    : "";
  openDetail(
    `<span class="detail-tag">NUISANCES · CE POINT</span><h2>${hasMatch ? "Dans un secteur affecté par le bruit" : "Hors secteur classé"}</h2>${regHtml}${noiseHtml}${airHtml}<p class="flag-note">Vérification indicative à partir des géométries officielles, sans la demi-largeur de chaussée ou de voie. Le bruit aérien n’est pas couvert ici. En cas de doute (isolement acoustique, permis de construire…), consultez le service instructeur de la DDT 95.</p>`,
  );
}
function showCommune(code) {
  const s = state.stats[code];
  if (!s) return;
  openDetail(
    `<span class="detail-tag">PORTRAIT COMMUNAL · 2024</span><h2>${esc(s.nom)}</h2><p><strong>${fmt(s.population)}</strong> habitants dans la statistique d’exposition.</p><div class="kpi-grid"><div class="kpi-tile warn"><small>Bruit très dégradé</small><strong>${fmt(s.bruit_degrade_pct, 1)} %</strong><em>ce n’est pas « tout bruit »</em></div><div class="kpi-tile"><small>Air très dégradé</small><strong>${fmt(s.air_degrade_pct, 1)} %</strong><em>ce n’est pas « toute pollution »</em></div><div class="kpi-tile warn"><small>Cumul maximal</small><strong>${fmt(s.cumul_tres_degrade_pct, 1)} %</strong></div><div class="kpi-tile"><small>Population</small><strong>${fmt(s.population)}</strong></div></div><p class="flag-note">0 % signifie : aucune population dans la classe « très dégradée » concernée. Cela ne signifie jamais absence de route, de train, d’avion, de bruit ou de pollution.</p>`,
  );
}
function sampleNoise(key, latlng) {
  const s = samplers[key];
  if (!s) return null;
  const x = Math.floor(
      ((latlng.lng - 1.6035671) / (2.5965671 - 1.6035671)) * s.w,
    ),
    y = Math.floor(((49.248488 - latlng.lat) / (49.248488 - 48.911488)) * s.h);
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return null;
  const d = s.canvas.getContext("2d").getImageData(x, y, 1, 1).data;
  if (d[3] < 20) return null;
  const palette = [
    [87, 171, 210, 40],
    [116, 196, 118, 45],
    [255, 224, 91, 50],
    [245, 166, 35, 55],
    [224, 91, 49, 60],
    [171, 32, 47, 65],
    [105, 22, 53, 70],
    [66, 11, 36, 75],
  ];
  return palette.sort(
    (a, b) =>
      (a[0] - d[0]) ** 2 +
      (a[1] - d[1]) ** 2 +
      (a[2] - d[2]) ** 2 -
      ((b[0] - d[0]) ** 2 + (b[1] - d[1]) ** 2 + (b[2] - d[2]) ** 2),
  )[0][3];
}
map.on("click", (e) => showNuisancesAt(e.latlng.lng, e.latlng.lat));
function setupSearch(geo) {
  const items = geo.features
    .map((f) => {
      const code = String(
        f.properties.code || f.properties.insee || f.properties.INSEE_COM || "",
      );
      return { code, name: state.stats[code]?.nom || f.properties.nom, f };
    })
    .filter((x) => x.name);
  function run() {
    const q = $("searchInput").value.trim().toLowerCase(),
      hits = items.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 8);
    $("searchResults").innerHTML = hits
      .map((x) => `<button data-code="${x.code}">${esc(x.name)}</button>`)
      .join("");
    $("searchResults").hidden = !q || !hits.length;
    $("searchResults")
      .querySelectorAll("button")
      .forEach(
        (b) =>
          (b.onclick = () => {
            const x = items.find((i) => i.code === b.dataset.code);
            map.fitBounds(L.geoJSON(x.f).getBounds(), { maxZoom: 13 });
            showCommune(x.code);
            $("searchResults").hidden = true;
          }),
      );
  }
  $("searchInput").oninput = run;
  $("searchButton").onclick = run;
}
const aircraft = L.layerGroup();
state.layers.aircraft = aircraft;
let movingAircraft = [];

function projectedPosition(item, now) {
  const elapsed = Math.min((now - item.seenAt) / 1000, 75);
  const speedKmh = Number(item.data.gs) * 1.852;
  const heading = Number(item.data.track);
  if (
    !Number.isFinite(speedKmh) ||
    !Number.isFinite(heading) ||
    speedKmh < 15 ||
    elapsed <= 0
  )
    return [item.data.lat, item.data.lon];
  const distanceKm = (speedKmh * elapsed) / 3600;
  const angularDistance = distanceKm / 6371.0088;
  const bearing = (heading * Math.PI) / 180;
  const lat1 = (item.data.lat * Math.PI) / 180;
  const lon1 = (item.data.lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function animateAircraft(now) {
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    movingAircraft.forEach((item) => {
      const position = projectedPosition(item, now);
      item.marker.setLatLng(position);
      item.circle.setLatLng(position);
    });
  }
  requestAnimationFrame(animateAircraft);
}
requestAnimationFrame(animateAircraft);

function band(ft) {
  if (!Number.isFinite(ft))
    return { label: "Altitude inconnue", color: "#718096", radius: 500 };
  if (ft < 3000) return { label: "Survol bas", color: "#b21f35", radius: 3500 };
  if (ft < 7000)
    return { label: "Survol intermédiaire", color: "#db6b2f", radius: 2200 };
  if (ft < 12000)
    return { label: "Survol élevé", color: "#d5a42d", radius: 1200 };
  return { label: "Haute altitude", color: "#66758b", radius: 450 };
}
async function loadAircraft() {
  try {
    let d;
    try {
      const r = await fetch(
        "https://api.adsb.lol/v2/lat/49.08/lon/2.10/dist/45",
      );
      if (!r.ok) throw Error();
      d = await r.json();
    } catch {
      d = await fetch(`data/aircraft-live.json?v=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json());
    }
    const planes = (d.ac || []).filter(
      (p) =>
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lon) &&
        insideTerritory(p.lon, p.lat),
    );
    aircraft.clearLayers();
    movingAircraft = [];
    const seenAt = performance.now();
    planes.forEach((p) => {
      const ft = Number(p.alt_baro),
        b = band(ft);
      const circle = L.circle([p.lat, p.lon], {
        radius: b.radius,
        color: b.color,
        weight: 1,
        fillOpacity: 0.07,
        interactive: false,
      }).addTo(aircraft);
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          html: `<div class="plane-marker" style="transform:rotate(${Number(p.track) || 0}deg)">✈</div>`,
          className: "",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      })
        .addTo(aircraft)
        .bindTooltip(
          `${esc((p.flight || p.r || "Aéronef").trim())} · ${Number.isFinite(ft) ? fmt(ft) + " ft" : "altitude inconnue"}`,
        )
        .on("click", () =>
          openDetail(
            `<span class="detail-tag">AÉRONEF · DIRECT</span><h2>${esc((p.flight || p.r || p.hex || "Aéronef").trim())}</h2><div class="kpi-grid"><div class="kpi-tile warn"><small>Altitude</small><strong>${Number.isFinite(ft) ? fmt(ft) + " ft" : "—"}</strong><em>${Number.isFinite(ft) ? fmt(ft * 0.3048) + " m" : ""}</em></div><div class="kpi-tile"><small>Vitesse sol</small><strong>${Number.isFinite(Number(p.gs)) ? fmt(Number(p.gs) * 1.852) + " km/h" : "—"}</strong></div><div class="kpi-tile"><small>Type</small><strong>${esc(p.t || "—")}</strong></div><div class="kpi-tile warn"><small>Lecture</small><strong>${b.label}</strong></div></div><p class="flag-note">Position ADS-B en direct. L’anneau traduit uniquement l’altitude : ce n’est pas un niveau en dB(A).</p>`,
          ),
        );
      movingAircraft.push({ data: p, marker, circle, seenAt });
    });
    $("aircraftMenuStatus").textContent =
      `${planes.length} avions en mouvement · ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch {
    $("aircraftMenuStatus").textContent = "Dernier flux indisponible";
  }
}
loadAircraft();
setInterval(loadAircraft, 60000);
function renderAir() {
  if (state.layers.air) map.removeLayer(state.layers.air);
  if (!state.active.has("air")) return;
  state.layers.air = L.geoJSON(state.data.communes, {
    style: (f) => {
      const c = String(
          f.properties.code ||
            f.properties.insee ||
            f.properties.INSEE_COM ||
            "",
        ),
        v = state.stats[c]?.air_degrade_pct || 0;
      return {
        color: "#fff",
        weight: 0.7,
        fillColor:
          v >= 20
            ? "#612a4c"
            : v >= 10
              ? "#9d597f"
              : v > 0
                ? "#d7a9c1"
                : "#edf0f4",
        fillOpacity: 0.78,
      };
    },
    onEachFeature: (f, l) => {
      const c = String(
          f.properties.code ||
            f.properties.insee ||
            f.properties.INSEE_COM ||
            "",
        ),
        s = state.stats[c];
      l.bindTooltip(
        `${esc(s?.nom || f.properties.nom)} · ${fmt(s?.air_degrade_pct, 1)} % très dégradé`,
        { sticky: true },
      ).on("click", () => showCommune(c));
    },
  }).addTo(map);
}
const atmoColors = {
  Bon: "#50a654",
  Moyen: "#a8c956",
  Dégradé: "#f0e641",
  Mauvais: "#e89b38",
  "Très mauvais": "#d94b41",
  "Extrêmement mauvais": "#7d2048",
};
function renderLiveAir() {
  if (state.layers.liveAir) map.removeLayer(state.layers.liveAir);
  if (
    !state.active.has("liveAir") ||
    !state.data.communes ||
    !state.data.liveAir
  )
    return;
  state.layers.liveAir = L.geoJSON(state.data.communes, {
    style: (f) => {
      const c = String(
          f.properties.code ||
            f.properties.insee ||
            f.properties.INSEE_COM ||
            "",
        ),
        a = state.data.liveAir[c];
      return {
        color: "#fff",
        weight: 0.8,
        fillColor: a?.coul_qual || atmoColors[a?.lib_qual] || "#dfe5e8",
        fillOpacity: a?.lib_qual ? 0.55 : 0,
      };
    },
    onEachFeature: (f, l) => {
      const c = String(
          f.properties.code ||
            f.properties.insee ||
            f.properties.INSEE_COM ||
            "",
        ),
        a = state.data.liveAir[c];
      if (!a) return;
      l.bindTooltip(`${esc(a.lib_zone)} · air ${esc(a.lib_qual)}`, {
        sticky: true,
      }).on("click", () =>
        openDetail(
          `<span class="detail-tag">QUALITÉ DE L’AIR · AUJOURD’HUI</span><h2>${esc(a.lib_zone)}</h2><div class="kpi-grid"><div class="kpi-tile"><small>Indice ATMO</small><strong>${esc(a.lib_qual)}</strong></div><div class="kpi-tile"><small>Date</small><strong>${new Date(a.date_ech).toLocaleDateString("fr-FR")}</strong></div><div class="kpi-tile"><small>NO₂</small><strong>${esc(a.code_no2)}</strong></div><div class="kpi-tile"><small>O₃</small><strong>${esc(a.code_o3)}</strong></div><div class="kpi-tile"><small>PM10</small><strong>${esc(a.code_pm10)}</strong></div><div class="kpi-tile"><small>PM2,5</small><strong>${esc(a.code_pm25)}</strong></div></div><p class="flag-note">Indice quotidien officiel Atmo France produit par Airparif. Les sous-indices vont de 1 (bon) à 6 (extrêmement mauvais).</p>`,
        ),
      );
    },
  }).addTo(map);
}
async function loadLiveAir() {
  try {
    const d = await fetch(`data/air-live.json?v=${Date.now()}`, {
        cache: "no-store",
      }).then((r) => r.json()),
      features = d.features || [];
    state.data.liveAir = Object.fromEntries(
      features.map((f) => [String(f.properties.code_zone), f.properties]),
    );
    const latest = features[0]?.properties;
    $("liveAirStatus").textContent = latest
      ? `Airparif · indice du ${new Date(latest.date_ech).toLocaleDateString("fr-FR")}`
      : "Airparif · aucune donnée";
    renderLiveAir();
  } catch {
    $("liveAirStatus").textContent = "Airparif · dernier indice indisponible";
  }
}
loadLiveAir();
setInterval(loadLiveAir, 3600000);
function toggle(name, on) {
  state.active[on ? "add" : "delete"](name);
  const layer = state.layers[name];
  if (name === "air") renderAir();
  else if (name === "liveAir") renderLiveAir();
  else if (layer) {
    if (on) layer.addTo(map);
    else map.removeLayer(layer);
  }
  updateLegend();
}
document.querySelectorAll(".layer-card").forEach(
  (b) =>
    (b.onclick = () => {
      b.classList.toggle("active");
      toggle(b.dataset.layer, b.classList.contains("active"));
    }),
);
function updateLegend() {
  const parts = [];
  if (state.active.has("traffic"))
    parts.push(
      '<span class="traffic-key"><i></i><b>fluide</b><i></i><b>ralenti</b><i></i><b>saturé</b></span>',
    );
  if (state.active.has("liveAir"))
    parts.push('<span><i class="air-ramp"></i>Indice ATMO du jour</span>');
  if (state.active.has("roadNoise"))
    parts.push(
      '<span><i class="noise-ramp"></i>Bruit routier · Ln 40–75 dB(A)</span>',
    );
  if (state.active.has("railNoise"))
    parts.push(
      '<span><i class="noise-ramp"></i>Bruit ferroviaire · Lden 55–75 dB(A)</span>',
    );
  if (state.active.has("csRoad"))
    parts.push(
      '<span><i class="cs-line-swatch"></i>Classement sonore routier (1 à 5)</span>',
    );
  if (state.active.has("csRail"))
    parts.push(
      '<span><i class="cs-line-swatch"></i>Classement sonore ferroviaire (1 à 5)</span>',
    );
  if (state.active.has("roads"))
    parts.push('<span><i class="road-line"></i>Axes routiers</span>');
  if (state.active.has("rails"))
    parts.push('<span><i class="rail-line"></i>Voies ferrées</span>');
  if (state.active.has("aircraft"))
    parts.push('<span><i class="plane-dot"></i>Avions maintenant</span>');
  if (state.active.has("air"))
    parts.push(
      '<span><i class="air-ramp"></i>Air très dégradé · population</span>',
    );
  $("legendContent").innerHTML =
    parts.join("") || "<small>Aucune couche active</small>";
}
function openSynthesis() {
  const pop = 1221750,
    air = 374724.29,
    noise = 26794.99,
    both = 17079.79;
  const communes = Object.values(state.stats || {});
  const noiseRanking = communes
    .map((commune) => ({
      ...commune,
      exposed: (commune.population * commune.bruit_degrade_pct) / 100,
    }))
    .sort((a, b) => b.exposed - a.exposed)
    .slice(0, 5);
  const bothRanking = communes
    .map((commune) => ({
      ...commune,
      exposed: (commune.population * commune.cumul_tres_degrade_pct) / 100,
    }))
    .sort((a, b) => b.exposed - a.exposed)
    .slice(0, 5);
  $("synthesisContent").innerHTML =
    `<div class="synthesis-dashboard-head"><span class="detail-tag">SYNTHÈSE DÉPARTEMENTALE</span><h2>Où se concentrent les nuisances ?</h2><p>Population estimée dans les classes les plus dégradées · Airparif–Bruitparif 2024.</p></div><div class="synthesis-dashboard-kpis"><div class="kpi-tile"><small>Population étudiée</small><strong>${fmt(pop)}</strong><em>habitants</em></div><div class="kpi-tile"><small>Air très dégradé</small><strong>${fmt(air)}</strong><em>${fmt((100 * air) / pop, 1)} % des habitants</em></div><div class="kpi-tile warn"><small>Bruit très dégradé</small><strong>${fmt(noise)}</strong><em>${fmt((100 * noise) / pop, 1)} % des habitants</em></div><div class="kpi-tile warn"><small>Cumul air + bruit</small><strong>${fmt(both)}</strong><em>${fmt((100 * both) / pop, 1)} % des habitants</em></div><div class="kpi-tile"><small>Communes concernées</small><strong>${communes.filter((c) => c.bruit_degrade_pct > 0).length}</strong><em>par le bruit très dégradé</em></div></div><section class="synthesis-viz"><strong>Poids départemental</strong>${bar("Air très dégradé", (100 * air) / pop, "#8b4b73")}${bar("Bruit très dégradé", (100 * noise) / pop, "#d66b32")}${bar("Cumul air + bruit", (100 * both) / pop, "#6b243e")}</section><section class="synthesis-viz"><strong>Plus grands effectifs exposés au bruit</strong><small class="synthesis-caption">Habitants estimés · part de la commune</small>${rankingBars(noiseRanking, "bruit_degrade_pct", "#d66b32")}</section><section class="synthesis-viz"><strong>Plus grands effectifs en cumul</strong><small class="synthesis-caption">Air et bruit très dégradés · habitants estimés</small>${rankingBars(bothRanking, "cumul_tres_degrade_pct", "#6b243e")}</section>`;
  $("synthesisDialog").showModal();
}
function rankingBars(rows, percentageKey, color) {
  const maximum = Math.max(...rows.map((row) => row.exposed), 1);
  return rows
    .map(
      (row) =>
        `<div class="synthesis-bar-row"><div><span>${esc(row.nom)}</span><b>${fmt(row.exposed)} hab. · ${fmt(row[percentageKey], 1)} %</b></div><div class="synthesis-bar-track"><i style="--bar-width:${(100 * row.exposed) / maximum}%;--bar-color:${color}"></i></div></div>`,
    )
    .join("");
}
function bar(label, v, color) {
  return `<div class="synthesis-bar-row"><div><span>${label}</span><b>${fmt(v, 1)} %</b></div><div class="synthesis-bar-track"><i style="--bar-width:${Math.min(100, v)}%;--bar-color:${color}"></i></div></div>`;
}
$("clearAll").onclick = () => {
  document.querySelectorAll(".layer-card.active").forEach((button) => {
    button.classList.remove("active");
    toggle(button.dataset.layer, false);
  });
  $("detailPanel").classList.remove("open");
};
$("resetView").onclick = () =>
  state.layers.communes &&
  map.fitBounds(state.layers.communes.getBounds(), { padding: [16, 16] });
$("closeDetail").onclick = () => $("detailPanel").classList.remove("open");
$("openData").onclick = $("openDataTop").onclick = openSynthesis;
$("openMethod").onclick = () => $("methodDialog").showModal();
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
$("mobileLayers").onclick = () => $("layerSidebar").classList.toggle("open");
updateLegend();
