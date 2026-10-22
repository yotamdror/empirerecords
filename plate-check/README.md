# Plate Check

Mobile-first web prototype at `/plate-check/` in the Empire Records static site.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/plate-check/`. Camera access requires localhost or HTTPS. The browser downloads Tesseract.js and its OCR model on first use, then recognizes frames locally. No API key or build step is needed. The normal flow does not upload camera frames. Direct NYC Open Data requests send the plate text and, when selected, a state. Fast prefetch may send a stable candidate before a tap.

The service worker caches only this page's shell. Live NYC lookups require a network connection. Camera/OCR availability and speed vary by phone and browser; this prototype has not been validated on a physical phone yet.

## Data and score

The page checks plate text against NYC's [Open Parking and Camera Violations](https://data.cityofnewyork.us/d/nc67-uf89), [NYPD Moving Violation B Summons (Year to Date)](https://data.cityofnewyork.us/d/57p3-pdcj), and [historic moving summonses](https://data.cityofnewyork.us/d/bme5-7ty4). `AUTO` searches all states present in those datasets, including NJ. If the same text has records in multiple states, the user must choose the plate state before a score appears. A two-letter state can also be entered up front to narrow the query. The query uses a rolling 24-month window. The parking dataset stores its issue date as `MM/DD/YYYY` text, so the request filters relevant years and the browser applies the exact date cutoff. A row cap or source failure withholds the score.

The score is deterministic editorial commentary on the selected plate and state's records. It excludes parking rows explicitly marked dismissed or not guilty, deduplicates moving summonses by event key, and never identifies a driver. See `data.mjs` for the formula and `docs/plate-check-plan.md` for design and data caveats. The NYC crash datasets do not publish a plate key, so crashes are not included.

## Verify

```sh
node --test plate-check/data.test.mjs
git diff --check
```

The local browser check on 2026-10-22 used an actual NJ plate from NYC's 2026 parking rows. `AUTO` resolved it to NJ and showed source-linked records; no console errors were observed. This check does not establish live camera recognition speed or accuracy on a physical phone.

## Beta follow-up checks

- Test live recognition and tap boxes on actual iOS Safari and Android Chrome devices, including blurry, angled, vanity, and out-of-state plates. Measure first-load model time, candidate accuracy, and tap-to-verdict latency.
- Verify anonymous Socrata limits under real traffic and move to a tokenized proxy or indexed lookup service if needed. Never put a secret app token in this static site.
- Review score weights and source status labels against current NYC documentation before wider promotion.
