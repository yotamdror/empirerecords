#!/usr/bin/env python3
"""Rebuild cuisines/data.json from NYC Open Data (no dependencies).

    python3 cuisines/build_data.py

Sources:
  43nn-pn8j  DOHMH restaurant inspection results (one row per violation)
  swpk-hqdp  NTA (2010) code -> name, matching the inspection data's `nta` codes

boroughs.json is a static asset: borough boundaries (gthc-hcne) simplified
with `mapshaper -simplify 5% keep-shapes -o format=geojson gj2008` (gj2008
keeps the clockwise rings d3 expects). It does not need rebuilding.
"""
import collections
import json
import os
import urllib.parse
import urllib.request

API = "https://data.cityofnewyork.us/resource/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")

# Shorter display names for the DOHMH cuisine list.
RENAME = {
    "Bakery Products/Desserts": "Bakery",
    "Juice, Smoothies, Fruit Salads": "Juice",
    "Jewish/Kosher": "Kosher",
    "Sandwiches/Salads/Mixed Buffet": "Deli Buffet",
    "Soups/Salads/Sandwiches": "Soups & Sandwiches",
    "Hotdogs/Pretzels": "Hotdogs",
    "Bagels/Pretzels": "Bagels",
    "Pancakes/Waffles": "Pancakes",
    "Nuts/Confectionary": "Confectionery",
    "Fruits/Vegetables": "Produce",
    "Creole/Cajun": "Creole",
    "Asian/Asian Fusion": "Pan-Asian",
    "Not Listed/Not Applicable": "Other",
    "Chinese/Japanese": "Chinese-Japanese",
    "Chinese/Cuban": "Chinese-Cuban",
}


def fetch(dataset, params, page=50000):
    rows, offset = [], 0
    while True:
        q = dict(params, **{"$limit": page, "$offset": offset})
        url = API + dataset + ".json?" + urllib.parse.urlencode(q)
        with urllib.request.urlopen(url, timeout=120) as r:
            batch = json.load(r)
        rows += batch
        if len(batch) < page:
            return rows
        offset += page


def main():
    places = fetch("43nn-pn8j", {
        "$select": "camis,dba,cuisine_description,nta,latitude,longitude,"
                   "max(inspection_date) as last",
        "$group": "camis,dba,cuisine_description,nta,latitude,longitude",
        "$order": "camis",
    })
    grades = fetch("43nn-pn8j", {
        "$select": "camis,grade,grade_date",
        "$where": "grade in('A','B','C')",
        "$group": "camis,grade,grade_date",
        "$order": "camis",
    })
    names = {r["nta_code"]: r["nta_name"] for r in fetch("swpk-hqdp", {
        "$select": "nta_code,nta_name", "$group": "nta_code,nta_name"})}

    latest = {}
    for g in grades:
        if g["camis"] not in latest or g["grade_date"] > latest[g["camis"]][0]:
            latest[g["camis"]] = (g["grade_date"], g["grade"])

    # Keep restaurants that have been inspected, have a cuisine, and are mapped.
    seen, kept = set(), []
    for p in places:
        if p["camis"] in seen or p["last"].startswith("1900"):
            continue
        if not p.get("cuisine_description") or not p.get("nta"):
            continue
        lat, lon = float(p.get("latitude") or 0), float(p.get("longitude") or 0)
        if not lat or not lon:
            continue
        seen.add(p["camis"])
        kept.append((p, lat, lon))

    cuisines = sorted({RENAME.get(c, c) for c in
                       (p["cuisine_description"] for p, _, _ in kept)})
    ntas = sorted({p["nta"] for p, _, _ in kept})
    ci = {c: i for i, c in enumerate(cuisines)}
    ni = {n: i for i, n in enumerate(ntas)}

    # Columnar, integer-coded to keep the file small. Coordinates are stored
    # as 1e-5 degree offsets (~1 m) from the city's south-west corner.
    lon0, lat0 = -74.26, 40.49
    cols = collections.defaultdict(list)
    for p, lat, lon in kept:
        cols["x"].append(round((lon - lon0) * 1e5))
        cols["y"].append(round((lat - lat0) * 1e5))
        cols["c"].append(ci[RENAME.get(p["cuisine_description"], p["cuisine_description"])])
        cols["n"].append(ni[p["nta"]])
        cols["g"].append("ABC".find(latest.get(p["camis"], ("", "-"))[1]) + 1)
        cols["name"].append(p["dba"].title().strip())

    asof = max(p["last"] for p, _, _ in kept)[:10]
    data = {
        "asof": asof,
        "origin": [lon0, lat0],
        "cuisines": cuisines,
        "ntas": [names.get(n, n) for n in ntas],
        "grades": ["", "A", "B", "C"],
        **cols,
    }
    with open(OUT, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"{len(kept)} restaurants, {len(cuisines)} cuisines, "
          f"{len(ntas)} NTAs, as of {asof} -> {OUT}")


if __name__ == "__main__":
    main()
