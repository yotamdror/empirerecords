# Empire Records project instructions

These rules extend `~/Projects/AGENTS.md` and apply to this static site.

## Thread naming

Title every thread so it reads on a phone: the slug, a one-word stage, and
for build the step. For example `map-pins plan`, `map-pins build 3/5`,
`gps-drift fix`.

- Slug first: lowercase, hyphenated, 2–3 words.
- Stage is one of: ask (a question), plan (what to build and how), build
  (building the agreed plan), fix (a bug or a tweak).
- build shows the plan's step as current/total, for example `build 3/5`,
  never a bare number. The other stages show no step.
- Add ✓ when a thread finishes its stage but the work isn't finished:
  `map-pins plan ✓`. When the work is finished and verified, the title is
  `map-pins done`.
- Prefix HOLD when the owner parks it: `HOLD map-pins build 3/5`.
- No emoji (✓ and other plain symbols are fine). No project name, no
  description.
- Set the title yourself where the app allows it and check that it shows;
  otherwise put it on the first line of your first reply. Retitle whenever
  the stage or the build step changes.

## Sources of truth and runtime

- There is no package manager, build step, test runner, or transpilation step.
  `index.html` loads React, ReactDOM, Babel, Mapbox, and fonts from CDNs; JSX is
  transpiled in the browser.
- `data.js` owns story/borough content, `app.jsx` owns the shell and index
  interactions, `map.jsx` owns Mapbox/NYC Open Data behavior, and `styles.css`
  owns responsive presentation.
- `baconeggcheese/index.html` is a standalone marketing page. Preserve `CNAME`
  and root-relative hosting assumptions.

## Verification and deployment

- Serve the repository over HTTP, for example `python3 -m http.server 8000`,
  then inspect `/` and `/baconeggcheese/`.
- Check browser console errors, desktop and narrow-mobile layouts, blocked
  `localStorage`, and the WebGL-unavailable fallback. Test Safari/iOS when
  practical. Always run `git diff --check`.
- GitHub Pages/custom-domain deployment is implied by repository structure but
  is not documented as a workflow. Verify actual Pages status after a requested
  push rather than assuming deployment.
- `config.js` contains a client-visible Mapbox `pk.` token. Keep it URL/domain
  restricted and never replace it with a secret token.

## Mobile handoff

- Capture source app, date, tested URL, branch/base commit, device, iOS/browser,
  screenshot reference, observed behavior, and expected behavior.
- Reconcile through `~/Projects/CONTEXT_BRIDGE.md`; fold accepted conclusions
  into code or a canonical project note rather than relying on chat history.
