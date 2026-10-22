# Plate Check

Mobile web page at `/plate-check/`. Point the camera at a plate or type one, and see its NYC parking and moving summons records from the last 24 months, plus a joke score.

## Run locally

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/plate-check/`. The camera needs localhost or HTTPS. Tesseract.js and its model download from jsDelivr when the camera first starts, and recognition runs on the device. No video frames are uploaded. Plate text, and a state if one is chosen, goes straight to NYC Open Data. A plate read steadily by the camera is looked up before it is tapped.

## Data and score

Sources: [Open Parking and Camera Violations](https://data.cityofnewyork.us/d/nc67-uf89), [NYPD moving summonses (year to date)](https://data.cityofnewyork.us/d/57p3-pdcj), and [historic moving summonses](https://data.cityofnewyork.us/d/bme5-7ty4). Every lookup starts as `AUTO`, which searches all states. If the plate text matches more than one state, the user picks the state before a score appears. The state can be corrected in the result sheet. A row cap, or a source that fails or times out, withholds the score. Update retries a failed source.

The formula is in `data.mjs` (`severityPoints`, `verdict`). It skips parking rows marked dismissed or not guilty, and it deduplicates moving summonses by event key. Crashes aren't included because NYC's crash data has no plate field. Design notes and data caveats are in `docs/plate-check-plan.md`.

`sw.js` is a retired service worker. It clears the old cache and unregisters itself. Keep it until old installs have picked it up.

## Verify

```sh
node --test plate-check/data.test.mjs
git diff --check
```

## Open issue: scanner accuracy

On 2026-10-22, Tesseract 7 was tested on synthetic NY-style plates with the scanner's settings (whole 90%×48% frame, `SPARSE_TEXT`, A–Z/0–9 whitelist). It read 0 of 5 plates correctly. The same plates cropped to a box the user lines up, read with `SINGLE_BLOCK`, gave 4 of 5 correct. The one miss was a confident wrong read (`JNES520` for `JNE5520`). Tap-to-select on the whole frame shouldn't ship as-is. Move to a framed-box read, and test it on real phones (iOS Safari and Android Chrome).
