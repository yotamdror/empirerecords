# Plate Check

Mobile web page at `/plate-check/`. Point the camera at a plate or type one, and see its NYC parking and moving summons records from the last 24 months, plus a joke score.

## Run locally

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/plate-check/`. The camera needs localhost or HTTPS. Tesseract.js and its model start downloading from jsDelivr as soon as the page loads, and stay loaded. The scanner reads only the plate-shaped box on screen and boosts contrast for night shots. When two reads in a row agree, the result opens. Recognition runs on the device and no video frames are uploaded. Plate text, and a state if one is chosen, goes straight to NYC Open Data.

## Data and score

Sources: [Open Parking and Camera Violations](https://data.cityofnewyork.us/d/nc67-uf89), [NYPD moving summonses (year to date)](https://data.cityofnewyork.us/d/57p3-pdcj), and [historic moving summonses](https://data.cityofnewyork.us/d/bme5-7ty4). Every lookup starts as `AUTO`, which searches all states. If the plate text matches more than one state, the user picks the state before a score appears. The state can be corrected in the result sheet. A row cap, or a source that fails or times out, withholds the score. Update retries a failed source.

The formula is in `data.mjs` (`severityPoints`, `verdict`). It skips parking rows marked dismissed or not guilty, and it deduplicates moving summonses by event key. Crashes aren't included because NYC's crash data has no plate field. Design notes and data caveats are in `docs/plate-check-plan.md`.

`sw.js` is a retired service worker. It clears the old cache and unregisters itself. Keep it until old installs have picked it up.

## Verify

```sh
node --test plate-check/data.test.mjs
git diff --check
```

## Scanner accuracy

Tested 2026-10-22 in headless Chromium, using a fake camera playing synthetic NY-style plates (5 plates, day and night versions with dim light, noise and glare):

- Old whole-frame `SPARSE_TEXT` scanner: 1 of 10 found.
- Box crop + contrast boost + `SINGLE_BLOCK`: 8 of 10 correct, about 1 s from Start to result on a desktop CPU.
- Misses were one-letter confusions (`JNES520`, `INE5520` for `JNE5520`), so the result sheet keeps the plate editable.

Plates without a digit must be typed. Not yet measured on real phones or real plates.
