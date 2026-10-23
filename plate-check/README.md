# Plate Check

Mobile web page at `/plate-check/`. Point the camera at a plate or type one, and see its NYC parking and moving summons records from the last 24 months, plus a joke score.

## Run locally

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/plate-check/`. The camera needs localhost or HTTPS. The scanner runs a small plate-reading model (`models/cct_xs_v2_global.onnx`, 3.3 MB, from [fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr), MIT) in ONNX Runtime Web, which loads from jsDelivr. It starts loading as soon as the page opens and stays loaded. The scanner reads the plate-shaped box on screen and averages the model's output over the last 4 frames. The result opens when every character is at least 70% likely on two frames in a row. Recognition runs on the device and no video frames are uploaded. Plate text, and a state if one is chosen, goes straight to NYC Open Data.

## Data and score

Sources: [Open Parking and Camera Violations](https://data.cityofnewyork.us/d/nc67-uf89), [NYPD moving summonses (year to date)](https://data.cityofnewyork.us/d/57p3-pdcj), and [historic moving summonses](https://data.cityofnewyork.us/d/bme5-7ty4). Every lookup starts as `AUTO`, which searches all states. If the plate text matches more than one state, the user picks the state before a score appears. The state can be corrected in the result sheet. A row cap, or a source that fails or times out, withholds the score. Update retries a failed source.

The formula is in `data.mjs` (`severityPoints`, `verdict`). It skips parking rows marked dismissed or not guilty, and it deduplicates moving summonses by event key. Crashes aren't included because NYC's crash data has no plate field. Design notes and data caveats are in `docs/plate-check-plan.md`.

`sw.js` is a retired service worker. It clears the old cache and unregisters itself. Keep it until old installs have picked it up.

## Verify

```sh
node --test plate-check/*.test.mjs
git diff --check
```

## Scanner accuracy

Tested 2026-10-23 in headless Chromium with the app's own model, crop and decoding code, on the 222 real US photos in [OpenALPR's benchmark](https://github.com/openalpr/benchmarks/tree/master/endtoend/us) (median plate 87 px wide). Each plate got 4 simulated video frames.

| Condition | Correct | Opens a result | Opens a wrong plate |
| --- | --- | --- | --- |
| Framed in the box | 91% | 90% | 5% |
| Loosely framed, off-centre | 88% | 86% | 4% |
| Far (60% resolution) | 88% | 86% | 5% |
| Tilted ±9° | 91% | 88% | 4% |
| Dusk (45% light, light noise) | 89% | 86% | 5% |
| Dark night (25% light, heavy noise) | 47% | 59% | 31% |

The model takes about 19 ms per frame on a desktop CPU, single-threaded. On synthetic NY plates, which the model has never seen, it got 9 of 10 right in day and night video, with no wrong opens. The model's training data may include the OpenALPR photos, so real-world accuracy may be lower. Tesseract, the previous scanner, scored about 5% on the same photos.

Dark scenes are the weak spot, and the result sheet keeps the plate editable for that reason. Not yet measured on real phones.
