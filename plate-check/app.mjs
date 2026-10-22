import { LivePlateScanner } from './scanner.mjs';
import { SOURCES, lookupKey, lookupPlate, normalizePlate, normalizeState, validPlateAndState, validState, verdict } from './data.mjs';

const byId = (id) => document.getElementById(id);
const stage = byId('scanStage');
const stageIntro = byId('stageIntro');
const cameraStatus = byId('cameraStatus');
const liveBadge = byId('liveBadge');
const stopButton = byId('stopButton');
const stateInput = byId('stateInput');
const prefetchToggle = byId('prefetchToggle');
const backdrop = byId('sheetBackdrop');
const resultPlate = byId('resultPlate');
const resultState = byId('resultState');
const provisionalNote = byId('provisionalNote');
const stateChoices = byId('stateChoices');
const verdictPanel = byId('verdictPanel');
const sourceResults = byId('sourceResults');
const recordResults = byId('recordResults');

const jobs = new Map();
const CACHE_MS = 60_000;
let activeJob = null;
let activeState = 'AUTO';
let lastPrefetchAt = 0;
let lastFocus = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function selectedState() {
  const state = normalizeState(stateInput.value);
  return validState(state) ? state : null;
}

function formatDate(value) {
  if (!value) return 'Update date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Update date unavailable' : `Updated ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function getJob(plate, state) {
  const key = lookupKey(plate, state);
  const now = Date.now();
  for (const [cachedKey, cachedJob] of jobs) {
    if (now - cachedJob.createdAt > CACHE_MS) jobs.delete(cachedKey);
  }
  if (jobs.has(key)) return jobs.get(key);

  const job = {
    key,
    plate,
    state,
    createdAt: now,
    sources: Object.fromEntries(SOURCES.map((source) => [source.id, { status: 'pending', rows: [] }])),
  };
  jobs.set(key, job);
  job.promise = lookupPlate(plate, state, {
    onSource(sourceId, result) {
      job.sources[sourceId] = result;
      if (activeJob === job) renderResults(job);
    },
  });
  if (jobs.size > 6) jobs.delete(jobs.keys().next().value);
  return job;
}

function maybePrefetch(plate) {
  const state = selectedState();
  if (!prefetchToggle.checked || !state) return;
  const key = lookupKey(plate, state);
  if (jobs.has(key) && Date.now() - jobs.get(key).createdAt < CACHE_MS) return;
  if (Date.now() - lastPrefetchAt < 1800) return;
  lastPrefetchAt = Date.now();
  getJob(plate, state);
}

function renderVerdict(result) {
  const top = element('p', 'verdict-topline', result.status === 'ready' ? 'ASSHOLE ENERGY / EDITORIAL SCORE' : 'NYC PUBLIC RECORDS / LAST 24 MONTHS');
  const row = element('div', 'verdict-row');
  const copy = element('div', 'verdict-copy');
  const heading = element('h2', '', result.title);
  const detail = element('p', '', result.detail);
  copy.append(heading, detail);
  row.append(copy);

  if (result.score != null) {
    const score = element('div', 'score-circle');
    score.style.setProperty('--score', String(result.score));
    const number = element('span', '', String(result.score));
    number.append(element('small', '', '/100'));
    score.append(number);
    row.append(score);
  } else if (result.status === 'partial' && SOURCES.some((source) => !activeJob?.sources[source.id] || activeJob.sources[source.id].status === 'pending')) {
    copy.prepend(element('span', 'verdict-loading'));
  }
  verdictPanel.replaceChildren(top, row);
}

function renderSources(job, state) {
  const cards = SOURCES.map((source) => {
    const data = job.sources[source.id];
    const card = element('div', 'source-result');
    const visibleRows = state === 'AUTO' ? data.rows : data.rows.filter((row) => row.state === state);
    const count = data.status === 'ready' ? `${visibleRows.length} recent ${visibleRows.length === 1 ? 'row' : 'rows'}` : data.status === 'error' ? 'Unavailable' : 'Checking…';
    card.append(element('strong', '', `${source.name} · ${count}`));
    const link = element('a', '', 'Source ↗');
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener';
    card.append(link);
    const detail = data.status === 'ready'
      ? `${formatDate(data.updatedAt)}${data.truncated ? ' · row limit reached; score withheld' : ''}${data.elapsedMs != null ? ` · ${data.elapsedMs} ms` : ''}`
      : data.status === 'error' ? data.message : 'Plate lookup in progress';
    card.append(element('small', '', detail));
    return card;
  });
  sourceResults.replaceChildren(...cards);
}

function renderRecords(result) {
  const rows = result.records.slice(0, 8);
  if (rows.length === 0) {
    recordResults.replaceChildren(element('p', 'empty-records', result.status === 'ready' || result.status === 'no-signal' ? 'No recent rows to show.' : 'Records will appear here as the sources respond.'));
    return;
  }
  const title = element('h4', '', `RECENT RECORDS · ${rows.length} OF ${result.records.length} SHOWN`);
  const items = rows.map((row) => {
    const item = element('div', 'record-item');
    const left = element('div');
    left.append(element('strong', '', row.label));
    const sourceName = row.sourceId === 'parking' ? 'Parking / camera' : 'Moving summons';
    const status = row.status && row.status !== 'Issued' ? ` · ${row.status}` : '';
    const excluded = /NOT GUILTY|DISMISS/i.test(row.status) ? ' · not scored' : '';
    left.append(element('span', '', `${row.state || 'Unknown state'} · ${sourceName}${status}${excluded}`));
    const date = element('time', '', row.date);
    date.dateTime = row.date;
    item.append(left, date);
    return item;
  });
  recordResults.replaceChildren(title, ...items);
}

function renderResults(job) {
  if (activeJob !== job) return;
  let result = verdict(job.sources, activeState);
  if (activeState === 'AUTO' && result.matchedState) {
    activeState = result.matchedState;
    resultState.value = activeState;
    result = verdict(job.sources, activeState);
    provisionalNote.textContent = `NYC records matched ${activeState} · confirm the plate and state on the car`;
  }
  if (result.status === 'ambiguous') {
    const label = element('strong', '', 'Same plate text, different states');
    const buttons = result.matches.map(({ state, count }) => {
      const button = element('button', '', `${state} · ${count} ${count === 1 ? 'record' : 'records'}`);
      button.type = 'button';
      button.addEventListener('click', () => {
        activeState = state;
        resultState.value = state;
        provisionalNote.textContent = `Selected ${state} · confirm it matches the car`;
        renderResults(job);
      });
      return button;
    });
    stateChoices.replaceChildren(label, ...buttons);
    stateChoices.hidden = false;
  } else {
    stateChoices.hidden = true;
    stateChoices.replaceChildren();
  }
  renderVerdict(result);
  renderSources(job, activeState);
  if (result.status === 'ambiguous') {
    recordResults.replaceChildren(element('p', 'empty-records', 'Choose the plate state to see its records.'));
  } else {
    renderRecords(result);
  }
}

function openResult(rawPlate, rawState, fromCamera = false) {
  const plate = normalizePlate(rawPlate);
  const state = normalizeState(rawState);
  if (!validPlateAndState(plate, state)) {
    cameraStatus.textContent = 'Enter a plate and AUTO or a two-letter state.';
    return;
  }
  lastFocus = document.activeElement;
  scanner.pause();
  resultPlate.value = plate;
  resultState.value = state;
  activeState = state;
  provisionalNote.textContent = fromCamera
    ? `Camera read · verify ${plate} and its state before trusting the result`
    : `Typed lookup · ${plate} / ${state}`;
  backdrop.hidden = false;
  document.body.classList.add('sheet-open');
  activeJob = getJob(plate, state);
  renderResults(activeJob);
  byId('closeSheet').focus();
}

function closeResult() {
  backdrop.hidden = true;
  document.body.classList.remove('sheet-open');
  activeJob = null;
  activeState = 'AUTO';
  scanner.resume();
  if (lastFocus?.isConnected) lastFocus.focus();
}

const scanner = new LivePlateScanner({
  video: byId('cameraVideo'),
  stage,
  overlay: byId('plateOverlay'),
  onSelect: (plate) => openResult(plate, selectedState() || '', true),
  onStable: (plate) => maybePrefetch(plate),
  onStatus: (message) => {
    cameraStatus.textContent = message;
    if (message.startsWith('Live')) {
      stage.classList.add('is-live');
      stageIntro.hidden = true;
      liveBadge.classList.add('active');
      liveBadge.lastChild.textContent = ' LIVE';
      stopButton.hidden = false;
    }
  },
  onError: (message) => {
    cameraStatus.textContent = message;
    stageIntro.hidden = false;
    stageIntro.querySelector('strong').textContent = 'Camera unavailable';
    stageIntro.querySelector('span').textContent = message;
    byId('startButton').firstChild.textContent = 'TRY AGAIN ';
  },
});

byId('startButton').addEventListener('click', async () => {
  const button = byId('startButton');
  button.disabled = true;
  stageIntro.querySelector('strong').textContent = 'Warming up the scanner…';
  stageIntro.querySelector('span').textContent = 'Allow camera access if your browser asks.';
  await scanner.start();
  button.disabled = false;
});
stopButton.addEventListener('click', async () => {
  await scanner.stop();
  stage.classList.remove('is-live');
  stageIntro.hidden = false;
  stageIntro.querySelector('strong').textContent = 'See a plate?';
  stageIntro.querySelector('span').textContent = 'No photo to take. Just point and tap.';
  liveBadge.classList.remove('active');
  liveBadge.lastChild.textContent = ' STANDBY';
  stopButton.hidden = true;
  cameraStatus.textContent = 'Camera off';
});

stateInput.addEventListener('input', () => { stateInput.value = normalizeState(stateInput.value).slice(0, 4); });
stateInput.addEventListener('change', () => {
  if (scanner.stablePlate) maybePrefetch(scanner.stablePlate);
});
prefetchToggle.addEventListener('change', () => {
  if (prefetchToggle.checked && scanner.stablePlate) maybePrefetch(scanner.stablePlate);
});

byId('manualForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const plate = normalizePlate(byId('manualPlate').value);
  const state = selectedState();
  if (!state) {
    stateInput.focus();
    cameraStatus.textContent = 'Use AUTO or a two-letter plate state.';
    return;
  }
  openResult(plate, state, false);
});

byId('resultForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const plate = normalizePlate(resultPlate.value);
  const state = normalizeState(resultState.value);
  if (!validPlateAndState(plate, state)) {
    provisionalNote.textContent = 'Enter a plate and AUTO or a two-letter state.';
    return;
  }
  resultPlate.value = plate;
  resultState.value = state;
  activeState = state;
  provisionalNote.textContent = `Corrected lookup · ${plate} / ${state}`;
  const reusableAuto = activeJob?.plate === plate && activeJob.state === 'AUTO'
    && SOURCES.every((source) => activeJob.sources[source.id].status === 'ready' && !activeJob.sources[source.id].truncated);
  if (!reusableAuto) activeJob = getJob(plate, state);
  renderResults(activeJob);
});

byId('closeSheet').addEventListener('click', closeResult);
backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeResult(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !backdrop.hidden) closeResult();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && scanner.running) stopButton.click();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
