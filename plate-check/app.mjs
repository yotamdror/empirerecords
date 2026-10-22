import { LivePlateScanner } from './scanner.mjs';
import { SOURCES, lookupKey, lookupPlate, normalizePlate, normalizeState, validPlateAndState, verdict } from './data.mjs';

const byId = (id) => document.getElementById(id);
const stage = byId('scanStage');
const stageIntro = byId('stageIntro');
const startButton = byId('startButton');
const stopButton = byId('stopButton');
const cameraStatus = byId('cameraStatus');
const manualPlate = byId('manualPlate');
const backdrop = byId('sheetBackdrop');
const resultPlate = byId('resultPlate');
const resultState = byId('resultState');
const provisionalNote = byId('provisionalNote');
const stateChoices = byId('stateChoices');
const verdictPanel = byId('verdictPanel');
const recordResults = byId('recordResults');

const jobs = new Map();
const CACHE_MS = 60_000;
let activeJob = null;
let activeState = 'AUTO';
let lastFocus = null;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function setNote(text) {
  provisionalNote.textContent = text;
  provisionalNote.hidden = !text;
}

// A failed source is never reused, so Update retries it.
function reusable(job) {
  return Date.now() - job.createdAt < CACHE_MS && SOURCES.every((source) => job.sources[source.id].status !== 'error');
}

function getJob(plate, state) {
  const key = lookupKey(plate, state);
  for (const [cachedKey, cachedJob] of jobs) {
    if (!reusable(cachedJob)) jobs.delete(cachedKey);
  }
  if (jobs.has(key)) return jobs.get(key);

  const job = {
    plate,
    state,
    createdAt: Date.now(),
    sources: Object.fromEntries(SOURCES.map((source) => [source.id, { status: 'pending', rows: [] }])),
  };
  jobs.set(key, job);
  lookupPlate(plate, state, {
    onSource(sourceId, result) {
      job.sources[sourceId] = result;
      if (activeJob === job) renderResults(job);
    },
  });
  if (jobs.size > 6) jobs.delete(jobs.keys().next().value);
  return job;
}

function renderVerdict(result) {
  const row = element('div', 'verdict-row');
  const copy = element('div', 'verdict-copy');
  copy.append(element('h2', '', result.title));
  if (result.detail) copy.append(element('p', '', result.detail));
  row.append(copy);

  if (result.score != null) {
    const score = element('div', 'score-circle');
    score.style.setProperty('--score', String(result.score));
    const number = element('span', '', String(result.score));
    number.append(element('small', '', '/100'));
    score.append(number);
    row.append(score);
  } else if (result.status === 'partial' && SOURCES.some((source) => activeJob?.sources[source.id].status === 'pending')) {
    copy.prepend(element('span', 'verdict-loading'));
  }
  verdictPanel.replaceChildren(row);
}

function renderRecords(result) {
  const rows = result.records.slice(0, 8);
  if (rows.length === 0) {
    recordResults.replaceChildren();
    return;
  }
  const more = result.records.length > rows.length ? ` · ${rows.length} of ${result.records.length}` : '';
  const title = element('h4', '', `RECENT RECORDS${more}`);
  const items = rows.map((row) => {
    const item = element('div', 'record-item');
    const left = element('div');
    left.append(element('strong', '', row.label));
    const sourceName = row.sourceId === 'parking' ? 'Parking / camera' : 'Moving';
    const status = row.status && row.status !== 'Issued' ? ` · ${row.status}` : '';
    const excluded = /NOT GUILTY|DISMISS/i.test(row.status) ? ' · not scored' : '';
    left.append(element('span', '', `${row.state || '??'} · ${sourceName}${status}${excluded}`));
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
    setNote(`Found in ${activeState}. Check it matches the car.`);
  }
  if (result.status === 'ambiguous') {
    const buttons = result.matches.map(({ state, count }) => {
      const button = element('button', '', `${state} · ${count}`);
      button.type = 'button';
      button.addEventListener('click', () => {
        activeState = state;
        resultState.value = state;
        setNote('');
        renderResults(job);
      });
      return button;
    });
    stateChoices.replaceChildren(...buttons);
    stateChoices.hidden = false;
  } else {
    stateChoices.hidden = true;
    stateChoices.replaceChildren();
  }
  renderVerdict(result);
  if (result.status === 'ambiguous') recordResults.replaceChildren();
  else renderRecords(result);
}

function openResult(rawPlate, rawState, fromCamera = false) {
  const plate = normalizePlate(rawPlate);
  const state = normalizeState(rawState);
  if (!validPlateAndState(plate, state)) return;
  lastFocus = document.activeElement;
  scanner.pause();
  resultPlate.value = plate;
  resultState.value = state;
  activeState = state;
  setNote(fromCamera ? 'Read by camera. Check the plate.' : '');
  backdrop.hidden = false;
  activeJob = getJob(plate, state);
  renderResults(activeJob);
  byId('closeSheet').focus();
}

function closeResult() {
  backdrop.hidden = true;
  activeJob = null;
  activeState = 'AUTO';
  scanner.resume();
  if (lastFocus?.isConnected) lastFocus.focus();
}

function showIdle() {
  stage.classList.remove('is-live');
  stageIntro.hidden = false;
  stopButton.hidden = true;
}

const scanner = new LivePlateScanner({
  video: byId('cameraVideo'),
  stage,
  guide: byId('scanGuide'),
  onRead: (plate) => openResult(plate, 'AUTO', true),
  onLive: () => {
    stage.classList.add('is-live');
    stageIntro.hidden = true;
    stopButton.hidden = false;
  },
  onStatus: (message) => { cameraStatus.textContent = message; },
  onError: (message) => {
    showIdle();
    cameraStatus.textContent = message;
    startButton.textContent = 'Try again';
  },
});

function stopCamera() {
  scanner.stop();
  showIdle();
  cameraStatus.textContent = '';
  startButton.textContent = 'Start camera';
}

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  await scanner.start();
  startButton.disabled = false;
});
stopButton.addEventListener('click', stopCamera);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && scanner.running) stopCamera();
});
// Start loading the OCR model right away so the camera is ready sooner.
scanner.warmUp().catch(() => {});

manualPlate.addEventListener('input', () => manualPlate.setCustomValidity(''));
byId('manualForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!validPlateAndState(manualPlate.value, 'AUTO')) {
    manualPlate.setCustomValidity('Use 2–10 letters or numbers.');
    manualPlate.reportValidity();
    return;
  }
  openResult(manualPlate.value, 'AUTO');
});

byId('resultForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const plate = normalizePlate(resultPlate.value);
  const state = normalizeState(resultState.value) || 'AUTO';
  if (!validPlateAndState(plate, state)) {
    setNote('Use a plate and AUTO or a two-letter state.');
    return;
  }
  resultPlate.value = plate;
  resultState.value = state;
  activeState = state;
  setNote('');
  // A complete AUTO lookup already holds every state's rows; just filter it.
  const reuseAuto = activeJob?.plate === plate && activeJob.state === 'AUTO'
    && SOURCES.every((source) => activeJob.sources[source.id].status === 'ready' && !activeJob.sources[source.id].truncated);
  if (!reuseAuto) activeJob = getJob(plate, state);
  renderResults(activeJob);
});

byId('closeSheet').addEventListener('click', closeResult);
backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeResult(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !backdrop.hidden) closeResult();
});
