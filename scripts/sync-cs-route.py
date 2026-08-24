#!/usr/bin/env python3
"""Synchronise les couches du classement sonore routier (arrêté n°17-146)
depuis les flux WFS publiés par la DDT du Val-d'Oise sur data.gouv.fr.

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

SOURCES = {
    "data/cs-lines.geojson": {
        "capabilities": "https://ogc.geo-ide.developpement-durable.gouv.fr/wxs?map=/opt/data/stack/mapfiles/1.4/org_38124/8adeaaa4-6d6a-4f32-b53c-30b8a3eee9af.internet.map&SERVICE=WFS&REQUEST=GetCapabilities",
        "base": "https://ogc.geo-ide.developpement-durable.gouv.fr/wxs?map=/opt/data/stack/mapfiles/1.4/org_38124/8adeaaa4-6d6a-4f32-b53c-30b8a3eee9af.internet.map",
    },
    "data/cs-buffer.geojson": {
        "capabilities": "https://ogc.geo-ide.developpement-durable.gouv.fr/wxs?map=/opt/data/stack/mapfiles/1.4/org_38124/5e133a97-f7ac-4c8b-91ad-eb81023cd863.internet.map&SERVICE=WFS&REQUEST=GetCapabilities",
        "base": "https://ogc.geo-ide.developpement-durable.gouv.fr/wxs?map=/opt/data/stack/mapfiles/1.4/org_38124/5e133a97-f7ac-4c8b-91ad-eb81023cd863.internet.map",
    },
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
            geom_elem = child if local(child.tag) in GEOM_TAGS else next(
                (d for d in child.iter() if local(d.tag) in GEOM_TAGS), None
            )
            if geom_elem is not None:
                geometry = geometry or geom_from_gml(geom_elem)
                continue
            props[local(child.tag)] = child.text
        features.append({"type": "Feature", "properties": props, "geometry": geometry})
    return {"type": "FeatureCollection", "features": features}


PAGE_SIZE = 300
MAX_PAGES = 60  # garde-fou : jusqu'à 18 000 entités


def fetch_geojson(source):
    type_name = discover_type_name(source["capabilities"])
    all_features = []
    start_index = 0
    for page in range(MAX_PAGES):
        url = (
            f"{source['base']}&SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature"
            f"&TYPENAMES={urllib.parse.quote(type_name)}"
            f"&SRSNAME=EPSG:4326&OUTPUTFORMAT={urllib.parse.quote(GML_OUTPUT_FORMAT)}"
            f"&COUNT={PAGE_SIZE}&STARTINDEX={start_index}"
        )
        raw = fetch(url)
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
        if len(page_features) < PAGE_SIZE:
            break
        start_index += PAGE_SIZE
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
