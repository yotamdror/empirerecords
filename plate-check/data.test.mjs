import assert from 'node:assert/strict';
import test from 'node:test';
import { SOURCES, normalizeSourceRows, sourceUrl, validPlateAndState, verdict } from './data.mjs';

const now = new Date('2026-10-22T12:00:00Z');
const ready = (rows = []) => ({ status: 'ready', rows, truncated: false });
const results = (parking = [], movingYtd = [], movingHistoric = []) => ({
  parking: ready(parking), movingYtd: ready(movingYtd), movingHistoric: ready(movingHistoric),
});
const row = (id, state, status = '') => ({
  id: `parking:${id}`, sourceId: 'parking', state, date: '2026-01-07',
  label: 'RED LIGHT', status,
});

test('AUTO searches all states and explicit state narrows every source', () => {
  assert.equal(validPlateAndState('T86UMN', 'AUTO'), true);
  assert.equal(validPlateAndState('T86UMN', 'NJ'), true);
  assert.equal(validPlateAndState('T86UMN', 'N'), false);
  for (const source of SOURCES) {
    const auto = new URL(sourceUrl(source.id, 'T86UMN', 'AUTO', now)).searchParams.get('$where');
    const nj = new URL(sourceUrl(source.id, 'T86UMN', 'NJ', now)).searchParams.get('$where');
    assert.match(auto, /T86UMN/);
    assert.doesNotMatch(auto, /state='|reg_state_cd='/);
    assert.match(nj, /(?:state|reg_state_cd)='NJ'/);
  }
});

test('normalizes the actual NJ state and exact recent date cutoff', () => {
  const rows = normalizeSourceRows('parking', [
    { plate: 'T86UMN', state: 'NJ', issue_date: '01/07/2026', summons_number: '1', violation: 'RED LIGHT' },
    { plate: 'T86UMN', state: 'NJ', issue_date: '10/21/2024', summons_number: '2', violation: 'RED LIGHT' },
  ], now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'NJ');
  const moving = normalizeSourceRows('movingYtd', [
    { reg_plate_num: 'R86WDC', reg_state_cd: 'NJ', violation_date: '2026-04-24T00:00:00.000', evnt_key: '3', chg_law_cd: 'VTL', violation_code: '4021A' },
  ], now);
  assert.equal(moving[0].date, '2026-04-24');
  assert.equal(moving[0].state, 'NJ');
});

test('AUTO scores one matching state but never combines NY and NJ', () => {
  const njOnly = verdict(results([row('1', 'NJ')]), 'AUTO');
  assert.equal(njOnly.status, 'ready');
  assert.equal(njOnly.matchedState, 'NJ');
  assert.ok(njOnly.score > 0);

  const mixed = results([row('1', 'NJ'), row('2', 'NY')]);
  const ambiguous = verdict(mixed, 'AUTO');
  assert.equal(ambiguous.status, 'ambiguous');
  assert.equal(ambiguous.score, null);
  assert.deepEqual(ambiguous.matches.map((match) => match.state), ['NJ', 'NY']);
  const selected = verdict(mixed, 'NJ');
  assert.equal(selected.status, 'ready');
  assert.equal(selected.records.length, 1);
  assert.equal(selected.records[0].state, 'NJ');
});

test('unknown state, incomplete source, and row cap withhold a score', () => {
  assert.equal(verdict(results([row('1', '')]), 'AUTO').status, 'state-unknown');
  const incomplete = results([row('1', 'NJ')]);
  incomplete.movingYtd = { status: 'error', rows: [], message: 'Unavailable' };
  assert.equal(verdict(incomplete, 'AUTO').score, null);
  const capped = results([row('1', 'NJ')]);
  capped.parking.truncated = true;
  assert.equal(verdict(capped, 'AUTO').status, 'incomplete');
});

test('dismissed records do not create a score', () => {
  const dismissed = verdict(results([row('1', 'NJ', 'HEARING HELD-NOT GUILTY')]), 'NJ');
  assert.equal(dismissed.status, 'no-signal');
  assert.equal(dismissed.score, null);
});
