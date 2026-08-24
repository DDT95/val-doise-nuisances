#!/usr/bin/env python3
"""Synchronise les couches du classement sonore routier (arrêté n°17-146)
depuis les flux WFS publiés par la DDT du Val-d'Oise sur data.gouv.fr.

Exécuté côté serveur (GitHub Actions) car ces services WFS ne renvoient pas
d'en-tête CORS et ne peuvent donc pas être appelés depuis un navigateur.
"""
import json
import os
import re
import sys
import urllib.error
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

WFS_VERSIONS = [
    ("2.0.0", "TYPENAMES"),
    ("1.1.0", "TYPENAME"),
    ("1.0.0", "TYPENAME"),
]
OUTPUT_FORMATS = ["application/json", "geojson", "GEOJSON", "json"]


def fetch(url, timeout=90):
    req = urllib.request.Request(url, headers={"User-Agent": "val-doise-nuisances-sync/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def discover_type_name(capabilities_url):
    raw = fetch(capabilities_url)
    root = ET.fromstring(raw)
    type_name = None
    for elem in root.iter():
        if elem.tag.rsplit("}", 1)[-1] == "FeatureType":
            for child in elem:
                if child.tag.rsplit("}", 1)[-1] == "Name" and child.text:
                    type_name = child.text.strip()
                    break
        if type_name:
            break
    formats = sorted(set(re.findall(rb'outputFormat"[^>]*>\s*<[^>]*>([^<]+)<', raw, re.I)))
    print(f"outputFormat déclarés (parsing strict) : {[f.decode() for f in formats]}")
    for i, m in enumerate(re.finditer(rb"outputFormat", raw, re.I)):
        if i >= 6:
            break
        start = max(0, m.start() - 20)
        print(f"contexte outputFormat #{i} : {raw[start:m.start()+200]!r}")
    if not type_name:
        raise RuntimeError("Aucune couche trouvée dans GetCapabilities : " + capabilities_url)
    return type_name


def first_coord(geometry):
    if not geometry:
        return None
    c = geometry.get("coordinates")
    while isinstance(c, list) and c and isinstance(c[0], list):
        c = c[0]
    if isinstance(c, list) and c and isinstance(c[0], (int, float)):
        return c
    return None


def swap_coords(c):
    if isinstance(c[0], (int, float)):
        return [c[1], c[0]]
    return [swap_coords(x) for x in c]


def fix_axis_order(geojson):
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


def fetch_geojson(source, verbose=False):
    type_name = discover_type_name(source["capabilities"])
    last_error = None
    for version, type_param in WFS_VERSIONS:
        for output_format in OUTPUT_FORMATS:
            url = (
                f"{source['base']}&SERVICE=WFS&VERSION={version}&REQUEST=GetFeature"
                f"&{type_param}={urllib.parse.quote(type_name)}"
                f"&SRSNAME=EPSG:4326&OUTPUTFORMAT={urllib.parse.quote(output_format)}"
            )
            try:
                raw = fetch(url)
                data = json.loads(raw)
                if isinstance(data.get("features"), list):
                    return fix_axis_order(data), type_name
                if verbose:
                    print(f"{version}/{output_format} : réponse JSON sans 'features' -> {raw[:200]!r}")
                last_error = f"{version}/{output_format} : pas de 'features' dans la réponse"
            except urllib.error.HTTPError as exc:
                body = exc.read()[:1500]
                print(f"{version}/{output_format} : HTTP {exc.code} -> {body!r}")
                last_error = f"{version}/{output_format} : HTTP {exc.code}"
            except Exception as exc:  # on tente la combinaison suivante
                if verbose:
                    print(f"{version}/{output_format} : {type(exc).__name__} {exc}")
                last_error = f"{version}/{output_format} : {exc}"
    raise RuntimeError(f"Aucun format accepté pour la couche {type_name} ({last_error})")


def main():
    changed = False
    for path, source in SOURCES.items():
        try:
            geojson, type_name = fetch_geojson(source, verbose=True)
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
