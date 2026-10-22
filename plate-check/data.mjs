const API_ROOT = 'https://data.cityofnewyork.us/resource/';
const LOOKBACK_MONTHS = 24;
const PARKING_LIMIT = 501;
const MOVING_LIMIT = 201;

export const SOURCES = Object.freeze([
  {
    id: 'parking',
    name: 'Parking & camera violations',
    dataset: 'nc67-uf89',
    url: 'https://data.cityofnewyork.us/d/nc67-uf89',
  },
  {
    id: 'movingYtd',
    name: 'NYPD moving summonses · current',
    dataset: '57p3-pdcj',
    url: 'https://data.cityofnewyork.us/d/57p3-pdcj',
  },
  {
    id: 'movingHistoric',
    name: 'NYPD moving summonses · historic',
    dataset: 'bme5-7ty4',
    url: 'https://data.cityofnewyork.us/d/bme5-7ty4',
  },
]);

export function normalizePlate(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeState(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z]/g, '');
}

export function validState(state) {
  return state === 'AUTO' || /^[A-Z]{2}$/.test(state);
}

export function lookupKey(plate, state) {
  return `${normalizeState(state)}:${normalizePlate(plate)}`;
}

export function validPlateAndState(plate, state) {
  return /^[A-Z0-9]{2,10}$/.test(normalizePlate(plate)) && validState(normalizeState(state));
}

export function lookbackStart(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  start.setUTCMonth(start.getUTCMonth() - LOOKBACK_MONTHS);
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  return start;
}

function yyyyMmDd(date) {
  return date.toISOString().slice(0, 10);
}

function apiUrl(dataset, fields, where, limit, order) {
  const url = new URL(`${API_ROOT}${dataset}.json`);
  url.searchParams.set('$select', fields);
  url.searchParams.set('$where', where);
  url.searchParams.set('$limit', String(limit));
  if (order) url.searchParams.set('$order', order);
  return url.toString();
}

export function sourceUrl(sourceId, plate, state, now = new Date()) {
  const p = normalizePlate(plate);
  const s = normalizeState(state);
  if (!validPlateAndState(p, s)) throw new Error('Enter a plate and AUTO or a two-letter state.');
  const start = lookbackStart(now);

  if (sourceId === 'parking') {
    const years = [];
    for (let year = start.getUTCFullYear(); year <= now.getUTCFullYear(); year += 1) years.push(year);
    const yearFilter = years.map((year) => `issue_date like '%/${year}'`).join(' OR ');
    return apiUrl(
      'nc67-uf89',
      'plate,state,license_type,summons_number,issue_date,violation,violation_status,amount_due',
      `plate='${p}'${s === 'AUTO' ? '' : ` AND state='${s}'`} AND (${yearFilter})`,
      PARKING_LIMIT,
    );
  }

  if (sourceId === 'movingYtd' || sourceId === 'movingHistoric') {
    const dataset = sourceId === 'movingYtd' ? '57p3-pdcj' : 'bme5-7ty4';
    return apiUrl(
      dataset,
      'evnt_key,violation_date,chg_law_cd,violation_code,reg_plate_num,reg_state_cd',
      `reg_plate_num='${p}'${s === 'AUTO' ? '' : ` AND reg_state_cd='${s}'`} AND violation_date >= '${yyyyMmDd(start)}T00:00:00'`,
      MOVING_LIMIT,
      'violation_date DESC',
    );
  }

  throw new Error('Unknown data source.');
}

function parkingDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value ?? ''));
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

function movingDate(value) {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(String(value ?? ''))?.[0];
  if (!day) return null;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || yyyyMmDd(date) !== day ? null : date;
}

export function normalizeSourceRows(sourceId, rawRows, now = new Date()) {
  const start = lookbackStart(now);
  const rows = [];

  for (const [index, raw] of rawRows.entries()) {
    if (sourceId === 'parking') {
      const date = parkingDate(raw.issue_date);
      if (!date || date < start || date > now) continue;
      rows.push({
        id: `parking:${raw.summons_number || `${normalizeState(raw.state)}:${yyyyMmDd(date)}:${index}`}`,
        sourceId,
        state: normalizeState(raw.state),
        date: yyyyMmDd(date),
        label: String(raw.violation || 'Unspecified parking or camera violation'),
        status: String(raw.violation_status || ''),
        amountDue: raw.amount_due == null ? null : Number(raw.amount_due),
        plateType: String(raw.license_type || ''),
      });
    } else {
      const date = movingDate(raw.violation_date);
      if (!date || date < start || date > now) continue;
      const code = [raw.chg_law_cd, raw.violation_code].filter(Boolean).join(' ');
      rows.push({
        id: `moving:${raw.evnt_key || `${sourceId}:${normalizeState(raw.reg_state_cd)}:${yyyyMmDd(date)}:${index}`}`,
        sourceId,
        state: normalizeState(raw.reg_state_cd),
        date: yyyyMmDd(date),
        label: code ? `Moving summons · ${code}` : 'Moving summons',
        status: 'Issued',
        amountDue: null,
        plateType: '',
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function linkedAbortSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal.reason);
  if (parentSignal?.aborted) onParentAbort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('NYC Open Data timed out.')), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    },
  };
}

export async function fetchSource(sourceId, plate, state, options = {}) {
  const { fetchImpl = fetch, now = new Date(), signal, timeoutMs = 9000 } = options;
  const linked = linkedAbortSignal(signal, timeoutMs);
  const startedAt = globalThis.performance?.now?.() ?? Date.now();

  try {
    const response = await fetchImpl(sourceUrl(sourceId, plate, state, now), {
      signal: linked.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'NYC Open Data is rate limiting requests.' : `NYC Open Data returned ${response.status}.`);
    const rawRows = await response.json();
    if (!Array.isArray(rawRows)) throw new Error('NYC Open Data returned an unexpected response.');
    const limit = sourceId === 'parking' ? PARKING_LIMIT : MOVING_LIMIT;
    return {
      status: 'ready',
      rows: normalizeSourceRows(sourceId, rawRows.slice(0, limit - 1), now),
      truncated: rawRows.length >= limit,
      updatedAt: response.headers?.get?.('last-modified') || null,
      elapsedMs: Math.round((globalThis.performance?.now?.() ?? Date.now()) - startedAt),
    };
  } finally {
    linked.cleanup();
  }
}

export async function lookupPlate(plate, state, options = {}) {
  const { onSource = () => {}, ...fetchOptions } = options;
  const result = {};
  await Promise.all(SOURCES.map(async (source) => {
    try {
      result[source.id] = await fetchSource(source.id, plate, state, fetchOptions);
    } catch (error) {
      result[source.id] = {
        status: 'error',
        rows: [],
        truncated: false,
        updatedAt: null,
        message: error?.name === 'AbortError' ? 'Lookup stopped.' : String(error?.message || error),
      };
    }
    onSource(source.id, result[source.id]);
  }));
  return result;
}

export function deduplicatedRows(sourceResults, state = 'AUTO') {
  const seen = new Set();
  const rows = [];
  for (const source of SOURCES) {
    for (const row of sourceResults[source.id]?.rows || []) {
      if (state !== 'AUTO' && row.state !== state) continue;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function availableStates(sourceResults) {
  const counts = new Map();
  for (const row of deduplicatedRows(sourceResults)) {
    if (!/^[A-Z]{2}$/.test(row.state)) continue;
    counts.set(row.state, (counts.get(row.state) || 0) + 1);
  }
  return [...counts].map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export function severityPoints(row) {
  if (row.sourceId !== 'parking') return 5;
  const label = row.label.toUpperCase();
  if (/SCHOOL ZN SPEED|SCHOOL ZONE SPEED|RED LIGHT/.test(label)) return 10;
  if (/BIKE LANE|BUS LANE|FIRE HYDRANT|DOUBLE PARK/.test(label)) return 6;
  if (/METER|STREET CLEAN|REG\. STICKER|INSP\. STICKER/.test(label)) return 1;
  return 2;
}

export function verdict(sourceResults, state = 'AUTO') {
  const states = SOURCES.map((source) => sourceResults[source.id]?.status || 'pending');
  const complete = states.every((status) => status === 'ready');
  const failed = states.some((status) => status === 'error');
  const truncated = SOURCES.some((source) => sourceResults[source.id]?.truncated);
  const matches = availableStates(sourceResults);
  const unknownStateRows = deduplicatedRows(sourceResults).filter((row) => !/^[A-Z]{2}$/.test(row.state)).length;
  const chosenState = state === 'AUTO' && complete && matches.length === 1 ? matches[0].state : state;
  const records = chosenState === 'AUTO' ? deduplicatedRows(sourceResults) : deduplicatedRows(sourceResults, chosenState);
  const scored = records.filter((row) => !/NOT GUILTY|DISMISS/i.test(row.status));

  if (state === 'AUTO' && complete && !truncated && (matches.length > 1 || unknownStateRows > 0)) {
    return {
      status: matches.length ? 'ambiguous' : 'state-unknown', score: null, records, countedRecords: 0,
      matches,
      matchedState: null,
      title: matches.length ? 'Which state is on the plate?' : 'Plate state needed',
      detail: unknownStateRows
        ? 'Some NYC rows lack a usable state. Enter or select the state on the plate to avoid mixing vehicles.'
        : 'NYC has recent records for this plate text in multiple states. Pick the state you saw to avoid mixing vehicles.',
    };
  }

  if (!complete || truncated) {
    return {
      status: truncated ? 'incomplete' : 'partial',
      score: null,
      records,
      countedRecords: scored.length,
      matches,
      matchedState: chosenState === 'AUTO' ? null : chosenState,
      title: truncated ? 'Too many rows for a fair score' : failed ? 'Partial record check' : 'Still checking the records',
      detail: truncated ? 'Open the NYC datasets for the complete record.' : failed ? 'One source could not be reached, so no score is shown.' : 'A verdict waits for every selected source.',
    };
  }

  if (scored.length === 0) {
    return {
      status: 'no-signal',
      score: null,
      records,
      countedRecords: 0,
      matches,
      matchedState: chosenState === 'AUTO' ? null : chosenState,
      title: 'No asshole signal found',
      detail: 'No scored NYC records in the last 24 months. That says nothing certain about the current driver.',
    };
  }

  const points = scored.reduce((sum, row) => sum + severityPoints(row), 0);
  const score = Math.min(100, Math.round(100 * (1 - Math.exp(-points / 35))));
  const title = score >= 75
    ? 'Yep. Serious asshole energy.'
    : score >= 45
      ? 'This plate is making a case for itself.'
      : score >= 20
        ? 'Some questionable choices here.'
        : 'A little public-record mischief.';

  return {
    status: 'ready',
    score,
    records,
    countedRecords: scored.length,
    matches,
    matchedState: chosenState,
    title,
    detail: 'An editorial score for this plate’s NYC records, not the current driver.',
  };
}
