/* Where New York Eats — cuisine enclaves from DOHMH inspection data.
   Plain script, no build step: d3 and d3-hexbin come from the CDN. */
(function () {
  "use strict";

  // Cuisines grouped into eight regional families (fixed color order, --f0..--f7).
  // Anything not listed is "American & everyday" (--f8).
  const FAMILIES = [
    ["East Asian", ["Chinese", "Japanese", "Korean", "Chinese-Japanese", "Chinese-Cuban", "Pan-Asian", "Hawaiian", "Polynesian"]],
    ["South Asian", ["Indian", "Bangladeshi", "Pakistani", "Afghan"]],
    ["Southeast Asian", ["Thai", "Filipino", "Southeast Asian", "Indonesian"]],
    ["Latin American", ["Mexican", "Latin American", "Spanish", "Peruvian", "Brazilian", "Chilean", "Tex-Mex", "Chimichurri"]],
    ["Caribbean & African", ["Caribbean", "African", "Ethiopian", "Soul Food", "Creole", "Cajun"]],
    ["Middle East & Med.", ["Middle Eastern", "Mediterranean", "Turkish", "Lebanese", "Egyptian", "Moroccan", "Iranian", "Armenian", "Greek"]],
    ["E. European & Kosher", ["Eastern European", "Russian", "Polish", "Czech", "Kosher"]],
    ["Western European", ["Italian", "French", "New French", "Irish", "English", "German", "Portuguese", "Basque", "Tapas", "Scandinavian", "Continental"]],
  ];
  const EVERYDAY = 8;

  // Ruled out by default: the everyday family plus Chinese (shown on request).
  const CHIPS = [
    { label: "American & everyday", family: EVERYDAY },
    { label: "Chinese", cuisines: ["Chinese"] },
    { label: "Italian", cuisines: ["Italian"] },
    { label: "Mexican", cuisines: ["Mexican"] },
    { label: "Japanese", cuisines: ["Japanese"] },
    { label: "Latin American", cuisines: ["Latin American", "Spanish"] },
    { label: "Caribbean", cuisines: ["Caribbean"] },
  ];
  const DEFAULT_OUT = [0, 1];

  const GRAINS = { block: 80, quarter: 200, half: 400 }; // hex radius, meters
  const MIN_K = 2, MIN_LQ = 1.5, MIN_G = 3;

  // Scrollytelling steps: bounds are [[west, south], [east, north]].
  const STEPS = {
    city: { bounds: [[-74.26, 40.49], [-73.70, 40.92]], grain: "half" },
    manila: { bounds: [[-73.95, 40.725], [-73.85, 40.765]], focus: ["Filipino"] },
    bangla: { bounds: [[-74.0, 40.62], [-73.76, 40.85]], focus: ["Bangladeshi"] },
    indian: { bounds: [[-73.88, 40.67], [-73.70, 40.77]], focus: ["Indian"] },
    korea: { bounds: [[-74.0, 40.72], [-73.75, 40.79]], focus: ["Korean"] },
    thai: { bounds: [[-74.02, 40.725], [-73.86, 40.78]], focus: ["Thai"] },
    astoria: { bounds: [[-73.945, 40.75], [-73.885, 40.79]], focus: ["Greek", "Egyptian", "Brazilian", "Moroccan", "Middle Eastern"] },
    greenpoint: { bounds: [[-73.975, 40.715], [-73.925, 40.742]], focus: ["Polish"] },
    brighton: { bounds: [[-74.0, 40.57], [-73.92, 40.615]], focus: ["Russian", "Eastern European"] },
    kosher: { bounds: [[-74.03, 40.59], [-73.80, 40.74]], focus: ["Kosher"] },
    caribbean: { bounds: [[-74.0, 40.60], [-73.72, 40.72]], focus: ["Caribbean"] },
    chinatowns: { bounds: [[-74.04, 40.59], [-73.79, 40.78]], focus: ["Chinese"] },
  };

  const tooltip = document.getElementById("tooltip");
  const fmt = d3.format(",");
  const pct = d3.format(".0%");

  Promise.all([
    fetch("data.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
    fetch("boroughs.json").then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }),
  ]).then(([data, boros]) => init(data, boros)).catch(err => {
    console.error(err);
    document.querySelectorAll(".map, .multiples, .grades").forEach(el => {
      el.innerHTML = '<p class="note">The data didn’t load. Try reloading the page.</p>';
    });
  });

  function init(data, boros) {
    const N = data.c.length;
    const C = data.cuisines;
    const cIndex = new Map(C.map((c, i) => [c, i]));

    const family = C.map(c => {
      const f = FAMILIES.findIndex(([, list]) => list.includes(c));
      return f < 0 ? EVERYDAY : f;
    });
    const cityCount = new Array(C.length).fill(0);
    for (let i = 0; i < N; i++) cityCount[data.c[i]]++;
    const share = cityCount.map(k => k / N);

    // Project every restaurant once into a fixed 1000 x 1000 reference space.
    const proj = d3.geoMercator().fitExtent([[10, 10], [990, 990]], boros);
    const px = new Float32Array(N), py = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const p = proj([data.origin[0] + data.x[i] / 1e5, data.origin[1] + data.y[i] / 1e5]);
      px[i] = p[0]; py[i] = p[1];
    }
    const a = proj([-73.95, 40.70]), b = proj([-73.95, 40.709]);
    const metersPerUnit = 1000.8 / Math.hypot(a[0] - b[0], a[1] - b[1]);
    const borosPath = d3.geoPath(proj)(boros);

    fillStats(data, N);

    // Poisson deviance of k observed against e expected; 0 unless the cuisine stands out.
    function score(k, n, c, relaxed) {
      const e = n * share[c];
      // A single restaurant counts for rare cuisines only (fewer than 100 citywide).
      const minK = relaxed && cityCount[c] < 100 ? 1 : MIN_K;
      if (k < minK || k < MIN_LQ * e) return 0;
      return k * Math.log(k / e) - (k - e);
    }

    const binCache = {};
    function binsFor(grain) {
      if (binCache[grain]) return binCache[grain];
      const r = GRAINS[grain] / metersPerUnit;
      const hb = d3.hexbin().radius(r).x(i => px[i]).y(i => py[i]);
      const bins = hb(d3.range(N));
      const dx = r * Math.sqrt(3), dy = r * 1.5;
      const byKey = new Map();
      bins.forEach((bin, id) => {
        bin.id = id;
        bin.n = bin.length;
        bin.counts = new Map();
        const nta = new Map();
        for (const i of bin) {
          bin.counts.set(data.c[i], (bin.counts.get(data.c[i]) || 0) + 1);
          nta.set(data.n[i], (nta.get(data.n[i]) || 0) + 1);
        }
        bin.nta = data.ntas[d3.greatest(nta, d => d[1])[0]].replace(/^park-cemetery-etc-(.*)/, "Parkland, $1");
        bin.j = Math.round(bin.y / dy);
        bin.i = Math.round(bin.x / dx - (bin.j & 1) / 2);
        byKey.set(bin.i + "," + bin.j, bin);
      });
      bins.forEach(bin => {
        const { i, j } = bin, o = j & 1;
        bin.neighbors = [[i - 1, j], [i + 1, j], [i - 1 + o, j - 1], [i + o, j - 1], [i - 1 + o, j + 1], [i + o, j + 1]]
          .map(([x, y]) => byKey.get(x + "," + y)).filter(Boolean);
      });
      return (binCache[grain] = { bins, r, hexagon: hb.hexagon(r * 0.9) });
    }

    // For one bin: the standout cuisine given what's left out, or the strongest focus cuisine.
    function standout(bin, state) {
      let best = null;
      for (const [c, k] of bin.counts) {
        if (state.focus) { if (!state.focus.includes(c)) continue; }
        else if (isOut(c, state.out)) continue;
        const g = score(k, bin.n, c, !!state.focus);
        if (g > 0 && (!best || g > best.g)) best = { c, k, g };
      }
      return best;
    }
    function isOut(c, out) {
      return out.some(ci => {
        const chip = CHIPS[ci];
        return chip.family === family[c] || (chip.cuisines && chip.cuisines.includes(C[c]));
      });
    }

    const famVar = c => `var(--f${family[c]})`;
    const cssColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    function tooltipHTML(bin, state) {
      const rows = [...bin.counts]
        .map(([c, k]) => ({ c, k, g: score(k, bin.n, c, false), lq: (k / bin.n) / share[c] }))
        .filter(d => d.g > 0)
        .sort((x, y) => y.g - x.g).slice(0, 4);
      const focusRow = state.focus && [...bin.counts].filter(([c]) => state.focus.includes(c))
        .map(([c, k]) => ({ c, k, lq: (k / bin.n) / share[c] }));
      const list = (focusRow && focusRow.length ? focusRow : rows);
      const top = list[0];
      const names = top ? bin.filter(i => data.c[i] === top.c).slice(0, 4).map(i => data.name[i]) : [];
      let h = `<h4>${esc(bin.nta)}</h4><div class="meta">${fmt(bin.n)} restaurant${bin.n === 1 ? "" : "s"} in this hexagon</div>`;
      if (list.length) {
        h += "<table>" + list.map(d =>
          `<tr><td><span class="sw" style="background:${famVar(d.c)}"></span>${esc(C[d.c])}</td>` +
          `<td class="num">${d.k}</td><td class="num">${d.lq >= 10 ? Math.round(d.lq) : d.lq.toFixed(1)}× city</td></tr>`).join("") + "</table>";
        if (names.length) h += `<div class="names">${names.map(esc).join(", ")}${top.k > names.length ? "…" : ""}</div>`;
      } else {
        h += `<div class="meta">No cuisine stands out here.</div>`;
      }
      return h;
    }

    function showTip(html, ev) {
      tooltip.innerHTML = html;
      tooltip.hidden = false;
      const pad = 14, w = tooltip.offsetWidth, h = tooltip.offsetHeight;
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
      if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
      tooltip.style.left = Math.max(8, x) + "px";
      tooltip.style.top = Math.max(8, y) + "px";
    }
    const hideTip = () => { tooltip.hidden = true; };

    // ---------------------------------------------------------------- map
    function makeMap(el, { interactive, inset = () => 0 }) {
      const svg = d3.select(el).append("svg").attr("preserveAspectRatio", "xMidYMid meet");
      const root = svg.append("g");
      root.append("path").attr("class", "land").attr("d", borosPath);
      const hexG = root.append("g");
      root.append("path").attr("class", "coast").attr("d", borosPath);
      const hover = root.append("path").attr("class", "hover");
      const labelG = root.append("g").attr("class", "labels");

      let state = null, grain = null, k = 1, pxPerUnit = 1, labels = [], res = [];
      let vb = [0, 0, 1000, 1000];

      const zoom = d3.zoom().scaleExtent([1, 24])
        .on("zoom", ev => {
          root.attr("transform", ev.transform);
          k = ev.transform.k;
          sizeLabels();
        })
        .on("end", placeLabels);
      if (interactive) svg.call(zoom).on("dblclick.zoom", null);

      function resize() {
        const w = el.clientWidth, h = el.clientHeight || w;
        const aspect = w / h;
        vb = aspect >= 1 ? [-(1000 * aspect - 1000) / 2, 0, 1000 * aspect, 1000]
                         : [0, -(1000 / aspect - 1000) / 2, 1000, 1000 / aspect];
        svg.attr("viewBox", vb.join(" "));
        pxPerUnit = w / vb[2];
        zoom.extent([[vb[0], vb[1]], [vb[0] + vb[2], vb[1] + vb[3]]])
          .translateExtent([[vb[0] - 200, vb[1] - 200], [vb[0] + vb[2] + 200, vb[1] + vb[3] + 200]]);
        sizeLabels();
        placeLabels();
      }

      function update(next) {
        const grainChanged = grain !== next.grain;
        state = next;
        grain = next.grain;
        const { bins, hexagon } = binsFor(state.grain);
        const results = bins.map(bin => standout(bin, state));
        const gs = results.filter(Boolean).map(d => d.g).sort(d3.ascending);
        const gMax = Math.max(MIN_G * 4, d3.quantileSorted(gs, 0.9) || 0);
        const op = d3.scaleSqrt().domain([state.focus ? 0 : MIN_G, gMax]).range(state.focus ? [0.2, 1] : [0.45, 1]).clamp(true);
        const minG = state.focus ? 0 : MIN_G;

        if (grainChanged) {
          hexG.selectAll("path").data(bins).join("path").attr("class", "hex")
            .attr("d", d => `M${d.x},${d.y}${hexagon}`);
        }
        res = results.map(r => (r && r.g > minG ? r : null));
        hexG.selectAll("path").each(function (d) {
          const r = res[d.id];
          this.style.fill = r ? famVar(r.c) : "var(--hex-none)";
          this.style.opacity = r ? op(r.g) : (state.focus ? 0.35 : 0.55);
        });

        hover.attr("d", null);
        labels = buildLabels(bins, res, state);
        placeLabels();
      }

      // Connected runs of hexagons sharing a standout cuisine get one label.
      function buildLabels(bins, res, st) {
        const seen = new Set(), out = [];
        for (const bin of bins) {
          if (!res[bin.id] || seen.has(bin)) continue;
          const c = res[bin.id].c, stack = [bin], comp = [];
          seen.add(bin);
          while (stack.length) {
            const cur = stack.pop();
            comp.push(cur);
            for (const nb of cur.neighbors) {
              if (!seen.has(nb) && res[nb.id] && res[nb.id].c === c) { seen.add(nb); stack.push(nb); }
            }
          }
          const total = d3.sum(comp, d => res[d.id].g);
          const kSum = d3.sum(comp, d => res[d.id].k);
          if (kSum < (st.focus ? 3 : 4) || total < (st.focus ? 6 : 12)) continue;
          out.push({
            text: C[c], score: total,
            x: d3.sum(comp, d => d.x * res[d.id].g) / total,
            y: d3.sum(comp, d => d.y * res[d.id].g) / total,
          });
        }
        return out.sort((p, q) => q.score - p.score).slice(0, 80);
      }

      function sizeLabels() {
        const fs = 12 / (pxPerUnit * k);
        labelG.attr("font-size", fs).attr("stroke-width", fs * 0.3);
      }

      // Greedy collision culling in screen space, strongest clusters first.
      function placeLabels() {
        const fs = 12 / (pxPerUnit * k), placed = [], byText = new Map();
        const apart = 150 / (pxPerUnit * k);
        const t = d3.zoomTransform(svg.node());
        const [x0, y0] = t.invert([vb[0], vb[1]]), [x1, y1] = t.invert([vb[0] + vb[2], vb[1] + vb[3]]);
        const shown = labels.filter(l => {
          if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) return false;
          const w = l.text.length * fs * 0.62 + fs, h = fs * 1.4;
          const box = [l.x - w / 2, l.y - h / 2, l.x + w / 2, l.y + h / 2];
          if (placed.some(p => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1])) return false;
          const same = byText.get(l.text) || [];
          if (same.some(p => Math.hypot(p.x - l.x, p.y - l.y) < apart)) return false;
          byText.set(l.text, same.concat(l));
          placed.push(box);
          return true;
        });
        labelG.selectAll("text").data(shown, d => d.text + d.x).join("text")
          .attr("x", d => d.x).attr("y", d => d.y).text(d => d.text);
      }

      // Hover and tap: find the hexagon under the pointer.
      function binAt(ev) {
        const [mx, my] = d3.zoomTransform(svg.node()).invert(d3.pointer(ev, svg.node()));
        const { bins, r } = binsFor(state.grain);
        let best = null, bd = r * r;
        for (const bin of bins) {
          const d = (bin.x - mx) ** 2 + (bin.y - my) ** 2;
          if (d < bd) { bd = d; best = bin; }
        }
        return best;
      }
      svg.on("pointermove", ev => {
        if (!state || ev.pointerType === "touch") return;
        const bin = binAt(ev);
        if (!bin) { hover.attr("d", null); hideTip(); return; }
        hover.attr("d", `M${bin.x},${bin.y}${binsFor(state.grain).hexagon}`).attr("stroke-width", 1.5 / (pxPerUnit * k));
        showTip(tooltipHTML(bin, state), ev);
      }).on("pointerleave", () => { hover.attr("d", null); hideTip(); })
        .on("click", ev => {
          if (!state) return;
          const bin = binAt(ev);
          if (!bin) { hideTip(); return; }
          hover.attr("d", `M${bin.x},${bin.y}${binsFor(state.grain).hexagon}`).attr("stroke-width", 1.5 / (pxPerUnit * k));
          showTip(tooltipHTML(bin, state), ev);
        });

      function zoomTo(bounds, duration) {
        const [[x0, y1], [x1, y0]] = bounds.map(p => proj(p));
        const h = vb[3] * (1 - inset());
        const scale = Math.min(24, 0.9 * Math.min(vb[2] / (x1 - x0), h / (y1 - y0)));
        const cx = vb[0] + vb[2] / 2, cy = vb[1] + h / 2;
        const t = d3.zoomIdentity.translate(cx, cy).scale(Math.max(1, scale)).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        svg.interrupt();
        if (duration && !reduce) svg.transition().duration(duration).ease(d3.easeCubicInOut).call(zoom.transform, t);
        else svg.call(zoom.transform, t);
      }
      function reset() { zoomTo(STEPS.city.bounds, 600); }

      new ResizeObserver(resize).observe(el);
      resize();
      return { update, zoomTo, reset, get state() { return state; } };
    }

    function drawLegend(el, st) {
      const used = st && st.focus
        ? [...new Set(st.focus.map(c => family[cIndex.get(c)]))]
        : d3.range(8);
      el.innerHTML = used.map(f => `<span><i class="sw" style="background:var(--f${f})"></i>${f === EVERYDAY ? "American & everyday" : FAMILIES[f][0]}</span>`).join("") +
        `<span><i class="sw" style="background:var(--hex-none)"></i>${st && st.focus ? "None here" : "Nothing stands out"}</span>` +
        `<span class="sub">${st && st.focus
          ? "Showing: " + st.focus.join(", ") + ". Darker = further above the city rate."
          : "Color = the most over-represented cuisine. Darker = a stronger standout."}</span>`;
    }

    // ------------------------------------------------------------ scrolly
    const narrow = window.matchMedia("(max-width: 820px)");
    const scrollyMap = makeMap(document.getElementById("map-scrolly"), { interactive: false, inset: () => (narrow.matches ? 0.4 : 0) });
    const scrollyLegend = document.getElementById("legend-scrolly");
    function setStep(key) {
      const s = STEPS[key];
      const focus = s.focus ? s.focus.filter(c => cIndex.has(c)).map(c => cIndex.get(c)) : null;
      const st = { grain: s.grain || "quarter", out: DEFAULT_OUT, focus };
      scrollyMap.update(st);
      drawLegend(scrollyLegend, { focus: s.focus });
      scrollyMap.zoomTo(s.bounds, 900);
      document.querySelectorAll(".step").forEach(el => el.classList.toggle("is-active", el.dataset.step === key));
    }
    setStep("city");
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setStep(e.target.dataset.step); });
    }, { rootMargin: narrow.matches ? "-60% 0px -10% 0px" : "-45% 0px -45% 0px" });
    document.querySelectorAll(".step").forEach(el => io.observe(el));

    // ------------------------------------------------------------ explore
    const exploreMap = makeMap(document.getElementById("map-explore"), { interactive: true });
    const exploreLegend = document.getElementById("legend-explore");
    const ex = { grain: "quarter", out: DEFAULT_OUT.slice(), focus: null };
    function renderExplore() {
      exploreMap.update(ex);
      drawLegend(exploreLegend, ex.focus ? { focus: ex.focus.map(c => C[c]) } : null);
      d3.selectAll("#chips button").attr("aria-pressed", (d, i) => ex.out.includes(i))
        .property("disabled", !!ex.focus);
      d3.selectAll("#grain button").attr("aria-pressed", function () { return this.dataset.grain === ex.grain; });
    }
    d3.select("#chips").selectAll("button").data(CHIPS).join("button")
      .attr("type", "button").text(d => d.label)
      .on("click", (ev, d) => {
        const i = CHIPS.indexOf(d);
        ex.out = ex.out.includes(i) ? ex.out.filter(x => x !== i) : ex.out.concat(i);
        renderExplore();
      });
    d3.selectAll("#grain button").on("click", function () { ex.grain = this.dataset.grain; renderExplore(); });
    const focusSel = document.getElementById("focus");
    C.map((c, i) => [c, i]).filter(([, i]) => cityCount[i] >= 3)
      .sort((x, y) => d3.ascending(x[0], y[0]))
      .forEach(([c, i]) => focusSel.add(new Option(`${c} (${fmt(cityCount[i])})`, i)));
    focusSel.addEventListener("change", () => {
      ex.focus = focusSel.value === "" ? null : [+focusSel.value];
      renderExplore();
    });
    document.getElementById("reset").addEventListener("click", () => {
      ex.grain = "quarter"; ex.out = DEFAULT_OUT.slice(); ex.focus = null; focusSel.value = "";
      renderExplore(); exploreMap.reset();
    });
    renderExplore();
    exploreMap.zoomTo(STEPS.city.bounds, 0);

    function openInExplorer(c) {
      ex.focus = [c]; focusSel.value = String(c);
      renderExplore();
      exploreMap.reset();
      document.getElementById("explore").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    drawMultiples(data, { N, C, family, cityCount, px, py, borosPath, cssColor, openInExplorer, boros, proj });
    drawGrades(data, { N, C, family, famVar });

    window.addEventListener("scroll", hideTip, { passive: true });
  }

  // ------------------------------------------------------- small multiples
  function drawMultiples(data, ctx) {
    const { N, C, family, cityCount, px, py, cssColor, openInExplorer, boros, proj } = ctx;
    const byCuisine = C.map(() => []);
    const ntaCounts = C.map(() => new Map());
    for (let i = 0; i < N; i++) {
      byCuisine[data.c[i]].push(i);
      const m = ntaCounts[data.c[i]];
      m.set(data.n[i], (m.get(data.n[i]) || 0) + 1);
    }
    const items = C.map((name, c) => {
      const top = [...ntaCounts[c]].sort((a, b) => b[1] - a[1]);
      return {
        c, name, n: cityCount[c],
        top: top[0] ? [data.ntas[top[0][0]], top[0][1]] : null,
        clustered: d3.sum(top.slice(0, 3), d => d[1]) / cityCount[c],
      };
    }).filter(d => d.n >= 12);

    const grid = d3.select("#multiples-grid");
    const figs = grid.selectAll("figure").data(items, d => d.c).join("figure")
      .attr("class", "mult").attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", d => `${d.name}: ${d.n} restaurants. Open in the explorer.`)
      .on("click", (ev, d) => openInExplorer(d.c))
      .on("keydown", (ev, d) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openInExplorer(d.c); } });
    figs.append("canvas");
    figs.append("figcaption").html(d =>
      `<b>${esc(d.name)}</b> <span>${fmt(d.n)}</span><br>${pct(d.clustered)} in top 3 · most in ${esc(d.top[0])} (${d.top[1]})`);

    const geo = d3.geoPath(proj);
    function draw() {
      const land = cssColor("--land"), coast = cssColor("--hex-none");
      figs.each(function (d) {
        const canvas = this.querySelector("canvas");
        const size = canvas.clientWidth || 150, dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = canvas.height = Math.round(size * dpr);
        const g = canvas.getContext("2d");
        const s = (size * dpr) / 1000;
        g.setTransform(s, 0, 0, s, 0, 0);
        g.beginPath(); geo.context(g)(boros);
        g.fillStyle = land; g.fill();
        g.lineWidth = 1 / s; g.strokeStyle = coast; g.stroke();
        g.fillStyle = cssColor(`--f${family[d.c]}`);
        g.globalAlpha = d.n > 800 ? 0.45 : 0.85;
        const r = (d.n > 800 ? 1.1 : 1.8) * dpr / s;
        for (const i of byCuisineFor(d.c)) { g.beginPath(); g.arc(px[i], py[i], r, 0, 2 * Math.PI); g.fill(); }
        g.globalAlpha = 1;
      });
    }
    function byCuisineFor(c) { return byCuisine[c]; }

    function sort(key) {
      const cmp = key === "count" ? (a, b) => b.n - a.n
        : key === "alpha" ? (a, b) => d3.ascending(a.name, b.name)
        : (a, b) => (family[a.c] === EVERYDAY) - (family[b.c] === EVERYDAY) || b.clustered - a.clustered;
      figs.sort(cmp);
      d3.selectAll("#sort button").attr("aria-pressed", function () { return this.dataset.sort === key; });
    }
    d3.selectAll("#sort button").on("click", function () { sort(this.dataset.sort); });
    sort("clustered");

    // Draw once visible, and again when the size or color scheme changes.
    let drawn = false;
    new IntersectionObserver((es, obs) => {
      if (es.some(e => e.isIntersecting)) { draw(); drawn = true; obs.disconnect(); }
    }, { rootMargin: "400px" }).observe(document.getElementById("multiples-grid"));
    let lastW = 0;
    new ResizeObserver(() => {
      const w = document.getElementById("multiples-grid").clientWidth;
      if (drawn && Math.abs(w - lastW) > 20) draw();
      lastW = w;
    }).observe(document.getElementById("multiples-grid"));
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (drawn) draw(); });
  }

  // ---------------------------------------------------------------- grades
  function drawGrades(data, { N, C, family, famVar }) {
    const tally = C.map(() => [0, 0, 0]);
    let a = 0, graded = 0;
    for (let i = 0; i < N; i++) {
      const g = data.g[i];
      if (!g) continue;
      tally[data.c[i]][g - 1]++;
      graded++; if (g === 1) a++;
    }
    const city = a / graded;
    document.querySelectorAll('[data-stat="pctA"]').forEach(el => { el.textContent = pct(city); });
    const rows = C.map((name, c) => {
      const [A, B, Cc] = tally[c], n = A + B + Cc;
      return { name, c, n, A, B, C: Cc, p: n ? A / n : 0 };
    }).filter(d => d.n >= 40).sort((x, y) => y.p - x.p);

    const el = document.getElementById("grades");
    const rowH = 19, top = 28, labelW = 150, right = 56;
    function render() {
      const W = el.clientWidth || 700, H = top + rows.length * rowH + 8;
      const x = d3.scaleLinear().domain([Math.floor((d3.min(rows, d => d.p) - 0.02) * 20) / 20, 1]).range([labelW, W - right]);
      const svg = d3.select(el).selectAll("svg").data([0]).join("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("height", H);
      svg.selectAll("*").remove();
      const ticks = x.ticks(5);
      const grid = svg.append("g").attr("class", "grid axis");
      grid.selectAll("line").data(ticks).join("line")
        .attr("x1", x).attr("x2", x).attr("y1", top - 6).attr("y2", H - 4);
      grid.selectAll("text").data(ticks).join("text")
        .attr("x", x).attr("y", top - 12).attr("text-anchor", "middle").text(d => pct(d));
      svg.append("line").attr("class", "avg").attr("x1", x(city)).attr("x2", x(city)).attr("y1", top - 6).attr("y2", H - 4);
      svg.append("text").attr("class", "row-label").attr("x", x(city) + 4).attr("y", H - 6)
        .attr("font-size", 11).text(`All restaurants ${pct(city)}`);
      const row = svg.append("g").selectAll("g").data(rows).join("g").attr("class", "row")
        .attr("transform", (d, i) => `translate(0,${top + i * rowH + rowH / 2})`);
      row.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", W).attr("height", rowH).attr("fill", "transparent");
      row.append("text").attr("class", "row-label").attr("x", labelW - 10).attr("text-anchor", "end").attr("dy", "0.35em").text(d => d.name);
      row.append("line").attr("class", "stem").attr("x1", x(city)).attr("x2", d => x(d.p));
      row.append("circle").attr("cx", d => x(d.p)).attr("r", 4.5)
        .style("fill", d => famVar(d.c)).style("stroke", "var(--bg)").style("stroke-width", 2);
      row.on("pointermove click", (ev, d) => {
        tooltip.innerHTML = `<h4>${esc(d.name)}</h4><div class="meta">${fmt(d.n)} graded restaurants</div>` +
          `<table><tr><td>A</td><td class="num">${fmt(d.A)}</td><td class="num">${pct(d.p)}</td></tr>` +
          `<tr><td>B</td><td class="num">${fmt(d.B)}</td><td class="num">${pct(d.B / d.n)}</td></tr>` +
          `<tr><td>C</td><td class="num">${fmt(d.C)}</td><td class="num">${pct(d.C / d.n)}</td></tr></table>`;
        tooltip.hidden = false;
        const w = tooltip.offsetWidth;
        tooltip.style.left = Math.min(ev.clientX + 14, window.innerWidth - w - 8) + "px";
        tooltip.style.top = (ev.clientY + 14) + "px";
      }).on("pointerleave", () => { tooltip.hidden = true; });
    }
    render();
    let lastW = el.clientWidth;
    new ResizeObserver(() => { if (Math.abs(el.clientWidth - lastW) > 4) { lastW = el.clientWidth; render(); } }).observe(el);
  }

  function fillStats(data, N) {
    const set = (k, v) => document.querySelectorAll(`[data-stat="${k}"]`).forEach(el => { el.textContent = v; });
    set("n", fmt(N));
    set("cuisines", data.cuisines.length);
    set("asof", new Date(data.asof + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  }
})();
