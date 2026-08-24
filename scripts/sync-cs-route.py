#!/usr/bin/env python3
"""Synchronise les couches du classement sonore routier (arrêté n°17-146) et
ferroviaire (arrêté n°16249) depuis les flux WFS publiés par la DDT du
Val-d'Oise sur data.gouv.fr.

Exécuté côté serveur (GitHub Actions) car ces services WFS ne renvoient pas
d'en-tête CORS et ne peuvent donc pas être appelés depuis un navigateur.

Le service ne sait produire que du GML (aucun outputFormat JSON déclaré dans
GetCapabilities, confirmé par des tentatives réelles renvoyant des erreurs
400/corps vides) : on demande donc du GML 3.2 (WFS 2.0.0) et on le convertit
nous-mêmes en GeoJSON.
"""
import json
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET


def _wfs(map_id):
    base = f"https://ogc.geo-ide.developpement-durable.gouv.fr/wxs?map=/opt/data/stack/mapfiles/1.4/org_38124/{map_id}.internet.map"
    return {"capabilities": f"{base}&SERVICE=WFS&REQUEST=GetCapabilities", "base": base}


SOURCES = {
    "data/cs-lines.geojson": _wfs("8adeaaa4-6d6a-4f32-b53c-30b8a3eee9af"),
    "data/cs-buffer.geojson": _wfs("5e133a97-f7ac-4c8b-91ad-eb81023cd863"),
    "data/cs-rail-sncf-lines.geojson": _wfs("10ae6ec4-0108-477a-804f-48e6218780b2"),
    "data/cs-rail-sncf-buffer.geojson": _wfs("eddc3d7c-3912-4c48-b1ba-5f5187fd9364"),
    "data/cs-rail-ratp-lines.geojson": _wfs("85838f81-b9d0-4290-b005-0040d2e0b5bb"),
    "data/cs-rail-ratp-buffer.geojson": _wfs("242b75bd-8ffb-4604-9ea7-f6e73aca58da"),
    "data/cs-rail-sgp-lines.geojson": _wfs("cd577140-1f8c-4fd0-9bc2-ea9de788baaf"),
    "data/cs-rail-sgp-buffer.geojson": _wfs("a04d96c8-9a23-4e72-a966-61458752c998"),
}

GML_OUTPUT_FORMAT = "application/gml+xml; version=3.2"
GEOM_TAGS = {
    "Point",
    "LineString",
    "Curve",
    "MultiCurve",
    "Polygon",
    "Surface",
    "MultiSurface",
    "MultiPoint",
}


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "val-doise-nuisances-sync/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def local(tag):
    return tag.rsplit("}", 1)[-1]


def discover_type_name(capabilities_url):
    root = ET.fromstring(fetch(capabilities_url))
    for elem in root.iter():
        if local(elem.tag) == "FeatureType":
            for child in elem:
                if local(child.tag) == "Name" and child.text:
                    return child.text.strip()
    raise RuntimeError("Aucune couche trouvée dans GetCapabilities : " + capabilities_url)


def parse_coord_list(elem):
    """gml:posList (une suite plate de coordonnées) -> liste de [x, y]."""
    dim = int(elem.get("srsDimension", "2"))
    nums = [float(x) for x in (elem.text or "").split()]
    return [nums[i : i + dim][:2] for i in range(0, len(nums), dim)]


def parse_pos(elem):
    """gml:pos (un seul point) -> [x, y]."""
    nums = [float(x) for x in (elem.text or "").split()]
    return nums[:2]


def geom_from_gml(elem):
    tag = local(elem.tag)
    if tag == "Point":
        pos = elem.find("{*}pos")
        return {"type": "Point", "coordinates": parse_pos(pos)} if pos is not None else None
    if tag in ("LineString", "Curve"):
        pos_list = elem.find(".//{*}posList")
        if pos_list is None:
            return None
        return {"type": "LineString", "coordinates": parse_coord_list(pos_list)}
    if tag == "MultiCurve":
        lines = []
        for member in elem.findall(".//{*}curveMember"):
            for child in member:
                g = geom_from_gml(child)
                if g:
                    lines.append(g["coordinates"])
        return {"type": "MultiLineString", "coordinates": lines} if lines else None
    if tag in ("Polygon", "Surface"):
        rings = []
        exterior = elem.find(".//{*}exterior")
        if exterior is not None:
            pos_list = exterior.find(".//{*}posList")
            if pos_list is not None:
                rings.append(parse_coord_list(pos_list))
        for interior in elem.findall(".//{*}interior"):
            pos_list = interior.find(".//{*}posList")
            if pos_list is not None:
                rings.append(parse_coord_list(pos_list))
        return {"type": "Polygon", "coordinates": rings} if rings else None
    if tag == "MultiSurface":
        polys = []
        for member in elem.findall(".//{*}surfaceMember"):
            for child in member:
                g = geom_from_gml(child)
                if g and g["type"] == "Polygon":
                    polys.append(g["coordinates"])
        return {"type": "MultiPolygon", "coordinates": polys} if polys else None
    return None


def gml_to_geojson(raw_bytes):
    root = ET.fromstring(raw_bytes)
    features = []
    for member in root.iter():
        if local(member.tag) not in ("member", "featureMember"):
            continue
        feat_elems = list(member)
        if not feat_elems:
            continue
        feat_elem = feat_elems[0]
        props, geometry = {}, None
        for child in feat_elem:
            name = local(child.tag)
            if name == "boundedBy":
                continue
            geom_elem = child if name in GEOM_TAGS else next(
                (d for d in child.iter() if local(d.tag) in GEOM_TAGS), None
            )
            if geom_elem is not None:
                geometry = geometry or geom_from_gml(geom_elem)
                continue
            if len(child) == 0:  # élément simple porteur de texte, pas un conteneur
                props[name] = child.text
        features.append({"type": "Feature", "properties": props, "geometry": geometry})
    return fix_axis_order({"type": "FeatureCollection", "features": features})


def first_coord(geometry):
    if not geometry:
        return None
    c = geometry.get("coordinates")
    while isinstance(c, list) and c and isinstance(c[0], list):
        c = c[0]
    return c if isinstance(c, list) and c and isinstance(c[0], (int, float)) else None


def swap_coords(c):
    return [c[1], c[0]] if isinstance(c[0], (int, float)) else [swap_coords(x) for x in c]


def fix_axis_order(geojson):
    """Le WFS 2.0.0 sert EPSG:4326 en ordre lat,lon strict (norme d'axes) ;
    GeoJSON impose lon,lat, donc on permute si besoin."""
    features = geojson.get("features") or []
    if not features:
        return geojson
    coord = first_coord(features[0].get("geometry"))
    if not coord or abs(coord[0]) <= 45:
        return geojson
    for f in features:
        geom = f.get("geometry")
        if geom and geom.get("coordinates") is not None:
            geom["coordinates"] = swap_coords(geom["coordinates"])
    return geojson


PAGE_SIZE = 300
MAX_PAGES = 60  # garde-fou : jusqu'à 18 000 entités


def fetch_page(base, type_name, count, start_index):
    url = (
        f"{base}&SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
        f"&TYPENAMES={urllib.parse.quote(type_name)}"
        f"&SRSNAME=EPSG:4326&OUTPUTFORMAT={urllib.parse.quote(GML_OUTPUT_FORMAT)}"
        f"&COUNT={count}&STARTINDEX={start_index}"
    )
    return fetch(url)


def fetch_geojson(source):
    type_name = discover_type_name(source["capabilities"])
    all_features = []
    start_index = 0
    page_size = PAGE_SIZE
    for page in range(MAX_PAGES):
        raw = fetch_page(source["base"], type_name, page_size, start_index)
        if not raw.strip() and page == 0:
            # Réponse vide dès la première page : une entité trop volumineuse
            # (géométrie à très forte densité de points) peut faire échouer le
            # rendu GML côté serveur même pour un lot réduit. On réessaie avec
            # des lots de plus en plus petits avant d'abandonner.
            for smaller in (50, 10, 1):
                print(f"{type_name} : réponse vide avec COUNT={page_size}, nouvel essai avec COUNT={smaller}")
                raw = fetch_page(source["base"], type_name, smaller, start_index)
                if raw.strip():
                    page_size = smaller
                    break
        if not raw.strip():
            if page == 0:
                raise RuntimeError(f"Réponse vide pour la couche {type_name}")
            print(
                f"::warning::{type_name} : page {page} vide, arrêt avec {len(all_features)} entités déjà récupérées"
            )
            break
        page_features = gml_to_geojson(raw)["features"]
        all_features.extend(page_features)
        print(f"{type_name} : page {page} -> {len(page_features)} entités (total {len(all_features)})")
        if len(page_features) < page_size:
            break
        start_index += page_size
    else:
        print(f"::warning::{type_name} : plafond de {MAX_PAGES} pages atteint, données potentiellement incomplètes")
    geojson = {"type": "FeatureCollection", "features": all_features}
    if not geojson["features"]:
        raise RuntimeError(f"Aucune entité renvoyée pour la couche {type_name}")
    return geojson, type_name


def main():
    changed = False
    for path, source in SOURCES.items():
        try:
            geojson, type_name = fetch_geojson(source)
        except Exception as exc:
            print(f"::warning::{path} non synchronisé : {exc}", file=sys.stderr)
            continue
        new_content = json.dumps(geojson, ensure_ascii=False, separators=(",", ":"))
        try:
            with open(path, "r", encoding="utf-8") as f:
                old_content = f.read()
        except FileNotFoundError:
            old_content = None
        if new_content != old_content:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
            print(f"{path} mis à jour ({len(geojson['features'])} entités, couche {type_name})")
            changed = True
        else:
            print(f"{path} inchangé ({len(geojson['features'])} entités)")
    gh_output = os.environ.get("GITHUB_OUTPUT")
    if gh_output:
        with open(gh_output, "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed else 'false'}\n")


if __name__ == "__main__":
    main()
