#!/usr/bin/env python3
"""Refresh thanksgiving/data.js from NYC Open Data.

Pulls FDNY Fire Incident Dispatch Data (8m42-w767) for apartment-building
stove fires and writes the daily and hourly aggregates the page draws.
Run from the repository root:  python3 thanksgiving/refresh_data.py
"""

import datetime as dt
import json
import pathlib
import statistics
import urllib.parse
import urllib.request

API = "https://data.cityofnewyork.us/resource/8m42-w767.json"
CLASS = "Multiple Dwelling 'A' - Food on the stove fire"
# Daily counts run about 50% higher before 2014 (likely a change in how calls are
# coded), which would swamp the color scale. Thanksgiving was the worst day in
# every one of those years too; the page says so in a note.
FIRST_YEAR = 2014
OUT = pathlib.Path(__file__).with_name("data.js")


def soql(query):
    url = API + "?" + urllib.parse.urlencode({"$query": query})
    with urllib.request.urlopen(url, timeout=300) as r:
        return json.load(r)


def thanksgiving(year):
    d = dt.date(year, 11, 1)
    d += dt.timedelta((3 - d.weekday()) % 7)
    return d + dt.timedelta(21)


def main():
    where = f"incident_classification = '{CLASS.replace(chr(39), chr(39) * 2)}'"
    daily_rows = soql(
        f"SELECT date_trunc_ymd(incident_datetime) AS d, count(*) AS n "
        f"WHERE {where} GROUP BY d ORDER BY d LIMIT 50000"
    )
    hourly_rows = soql(
        f"SELECT date_trunc_ymd(incident_datetime) AS d, date_extract_hh(incident_datetime) AS h, "
        f"count(*) AS n WHERE {where} AND date_extract_m(incident_datetime) = 11 "
        f"GROUP BY d, h ORDER BY d, h LIMIT 50000"
    )

    daily = {dt.date.fromisoformat(r["d"][:10]): int(r["n"]) for r in daily_rows}
    last = max(daily)
    years = list(range(FIRST_YEAR, last.year + 1))

    # One array per year, Jan 1 to Dec 31; days after the last record are null.
    counts = {}
    for y in years:
        day, row = dt.date(y, 1, 1), []
        while day.year == y:
            row.append(daily.get(day, 0) if day <= last else None)
            day += dt.timedelta(1)
        counts[y] = row

    # Average stove fires per hour: Thanksgiving vs the other November Thursdays.
    by_day_hour = {}
    for r in hourly_rows:
        by_day_hour[(r["d"][:10], int(r["h"]))] = int(r["n"])
    complete = [y for y in years if dt.date(y, 12, 31) <= last]
    tg_days = [thanksgiving(y) for y in complete]
    other_thu = [
        dt.date(y, 11, d) for y in complete for d in range(1, 31)
        if dt.date(y, 11, d).weekday() == 3 and dt.date(y, 11, d) != thanksgiving(y)
    ]

    def hourly_avg(days):
        return [round(sum(by_day_hour.get((d.isoformat(), h), 0) for d in days) / len(days), 2)
                for h in range(24)]

    medians = {y: statistics.median([c for c in counts[y] if c is not None]) for y in complete}
    data = {
        "source": "FDNY Fire Incident Dispatch Data, NYC Open Data (8m42-w767)",
        "classification": CLASS,
        "lastDate": last.isoformat(),
        "fetched": dt.date.today().isoformat(),
        "firstYear": FIRST_YEAR,
        "counts": {str(y): counts[y] for y in years},
        "median": {str(y): medians[y] for y in complete},
        "hourly": {
            "thanksgiving": hourly_avg(tg_days),
            "otherThursdays": hourly_avg(other_thu),
            "years": [complete[0], complete[-1]],
            "otherThursdayCount": len(other_thu),
        },
    }
    OUT.write_text("window.STOVE_FIRES = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"wrote {OUT} through {last} ({len(daily)} days)")


if __name__ == "__main__":
    main()
