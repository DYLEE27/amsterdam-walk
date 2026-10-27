import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillHoles } from './terrain.ts';

test('fillHoles: a hole in flat ground fills flat, and a raised rim cell (boat deck, quay wall) does not become a mound', () => {
  const n = 21;
  const a = new Float32Array(n * n).fill(-0.7);   // street level
  for (let z = 6; z <= 14; z++) for (let x = 6; x <= 14; x++) a[z * n + x] = NaN;   // the gap (water, parked cars)
  a[10 * n + 5] = 0.9;   // one rim sample 1.6 m up, next to the gap
  fillHoles(a, n, 0);
  let max = -Infinity;
  for (let i = 0; i < n * n; i++) { assert.ok(Number.isFinite(a[i])); max = Math.max(max, a[i]); }
  assert.ok(max < -0.6, `filled terrain rises to ${max.toFixed(2)} m`);
});

test('fillHoles: an all-empty grid falls back to the given level', () => {
  const a = new Float32Array(9).fill(NaN);
  fillHoles(a, 3, 1.2);
  for (const v of a) assert.ok(Math.abs(v - 1.2) < 1e-6, `${v}`);
});
