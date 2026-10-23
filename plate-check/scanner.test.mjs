import assert from 'node:assert/strict';
import test from 'node:test';
import { decodePlate } from './scanner.mjs';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
// One frame of model output: 10 slots × 37 classes, `p` on each slot's character.
function frame(text, p = 0.9) {
  const out = new Float32Array(10 * ALPHABET.length).fill((1 - p) / (ALPHABET.length - 1));
  [...text.padEnd(10, '_')].forEach((char, slot) => { out[slot * ALPHABET.length + ALPHABET.indexOf(char)] = p; });
  return out;
}

test('reads characters and drops padding slots', () => {
  const { plate, confidence } = decodePlate([frame('T86UMN')]);
  assert.equal(plate, 'T86UMN');
  assert.ok(Math.abs(confidence - 0.9) < 1e-6);
});

test('averaging frames outvotes one noisy frame and lowers confidence', () => {
  const { plate, confidence } = decodePlate([frame('JNE5520'), frame('JNES520', 0.6), frame('JNE5520')]);
  assert.equal(plate, 'JNE5520');
  assert.ok(confidence < 0.7);
});
