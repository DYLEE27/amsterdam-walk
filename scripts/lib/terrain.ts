import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { BakeContext } from '../bake.ts';
import { log } from './log.ts';
import { BBOX_PADDED, CACHE_DIR, OUT_DIR, WMS_ELEVATION, type LonLatBox } from '../config.ts';
import { cachedBytes, exists, writeJson } from './http.ts';
import { frame, altToY, DATUM_ALT } from '../../shared/geo.ts';
import { decodeGrid } from './wmsgrid.ts';
import { TERRAIN_N, TERRAIN_STEP, WORLD_HALF } from '../../shared/layout.ts';

const PX = 2048;
const NODATA_MIN = -1000;

interface Quad { box: LonLatBox; data: Float32Array }

function splitQuads(b: LonLatBox): LonLatBox[] {
  const midLon = (b.west + b.east) / 2, midLat = (b.south + b.north) / 2;
  return [
    { west: b.west, east: midLon, south: midLat, north: b.north }, // NW
    { west: midLon, east: b.east, south: midLat, north: b.north }, // NE
    { west: b.west, east: midLon, south: b.south, north: midLat }, // SW
    { west: midLon, east: b.east, south: b.south, north: midLat }, // SE
  ];
}

async function fetchQuad(box: LonLatBox, i: number): Promise<Quad> {
  const buf = await cachedBytes(WMS_ELEVATION(box, PX, PX), `bil/quad${i}.bin`, { timeoutMs: 180_000, retries: 3 });
  return { box, data: await decodeGrid(buf, PX, PX, `elevation quad ${i}`) };
}

/** Bilinear altitude sample (NGF metres) at lon/lat from the quad grid; NaN when no data. */
function sampleAlt(quads: Quad[], lon: number, lat: number): number {
  const q = quads.find(q => lon >= q.box.west && lon <= q.box.east && lat >= q.box.south && lat <= q.box.north);
  if (!q) return NaN;
  const u = ((lon - q.box.west) / (q.box.east - q.box.west)) * PX - 0.5;
  const v = ((q.box.north - lat) / (q.box.north - q.box.south)) * PX - 0.5;
  const x0 = Math.max(0, Math.min(PX - 2, Math.floor(u))), y0 = Math.max(0, Math.min(PX - 2, Math.floor(v)));
  const fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0));
  const d = q.data;
  const a = d[y0 * PX + x0], b = d[y0 * PX + x0 + 1], c = d[(y0 + 1) * PX + x0], e = d[(y0 + 1) * PX + x0 + 1];
  const vals = [a, b, c, e];
  if (vals.some(v => !(v > NODATA_MIN))) {
    const ok = vals.filter(v => v > NODATA_MIN);
    return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : NaN;
  }
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + e * fx) * fy;
}

/**
 * Fill NaN cells in place. AHN's DTM is the bare ground with buildings, water, parked cars and houseboats cut out
 * (about 60 % of the grid on the Dam), so the holes are filled from their rim inward: each ring of hole cells takes
 * the lower quartile of its already-known 8-neighbours, then a few smoothing passes over the filled cells only soften
 * the seams between rims. Under a building this gives the street level around it; in a canal the quay level, which
 * build.ts lowers into a bed.
 *
 * The rim is not clean ground everywhere: along the canals it holds quay-wall tops, boat decks and car roofs that
 * survived the ground filter. Taking the mean let those spread as 1-1.6 m mounds along the quays, so rim cells
 * standing more than 0.4 m above their neighbourhood are dropped into the hole first, and the fill leans low:
 * the street is the lowest flat surface around a gap.
 */
export function fillHoles(a: Float32Array, n: number, fallback: number) {
  const known = new Uint8Array(n * n);
  let frontier: number[] = [];
  for (let i = 0; i < n * n; i++) if (Number.isFinite(a[i])) known[i] = 1;
  const filled: number[] = [];
  const nbrs = (i: number, f: (j: number) => void) => {
    const x = i % n, z = (i - x) / n;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx < n && zz < n) f(zz * n + xx);
    }
  };
  // despike the rim: a known cell next to a hole that stands well above the median of its known 5x5 window
  const spikes: number[] = [];
  for (let i = 0; i < n * n; i++) {
    if (!known[i]) continue;
    let rim = false; nbrs(i, j => { if (!known[j]) rim = true; });
    if (!rim) continue;
    const x = i % n, z = (i - x) / n, w: number[] = [];
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, zz = z + dz; if (xx >= 0 && zz >= 0 && xx < n && zz < n && known[zz * n + xx]) w.push(a[zz * n + xx]); }
    w.sort((p, q) => p - q);
    if (w.length >= 5 && a[i] > w[Math.floor(w.length / 2)] + 0.4) spikes.push(i);
  }
  for (const i of spikes) { known[i] = 0; a[i] = NaN; }
  const lowQuartile = (i: number) => { const v: number[] = []; nbrs(i, j => { if (known[j]) v.push(a[j]); }); if (!v.length) return fallback; v.sort((p, q) => p - q); return v[Math.floor((v.length - 1) / 4)]; };
  for (let i = 0; i < n * n; i++) if (!known[i]) { let edge = false; nbrs(i, j => { if (known[j] === 1) edge = true; }); if (edge) frontier.push(i); }
  if (!filled.length && !frontier.length && known.some(k => !k)) { a.fill(fallback); return; }
  while (frontier.length) {
    const vals = frontier.map(lowQuartile);
    frontier.forEach((i, k) => { a[i] = vals[k]; known[i] = 2; filled.push(i); });
    const next: number[] = [];
    for (const i of frontier) nbrs(i, j => { if (!known[j]) { known[j] = 3; next.push(j); } });
    for (const j of next) known[j] = 0;
    frontier = next;
  }
  for (let pass = 0; pass < 6; pass++) {
    const vals = filled.map(i => { let s = a[i], c = 1; nbrs(i, j => { s += a[j]; c++; }); return s / c; });
    filled.forEach((i, k) => { a[i] = vals[k]; });
  }
}

export async function run(ctx: BakeContext) {
  const binOut = path.join(OUT_DIR, 'terrain.bin');
  const jsonOut = path.join(OUT_DIR, 'terrain.json');
  if (!ctx.force && await exists(binOut) && await exists(jsonOut)) { log.info('terrain: cached'); return; }

  const quads: Quad[] = [];
  const boxes = splitQuads(BBOX_PADDED);
  for (let i = 0; i < 4; i++) {
    quads.push(await fetchQuad(boxes[i], i));
    log.info(`terrain: quad ${i} ok`);
  }
  const n = TERRAIN_N;
  const alts = new Float32Array(n * n);
  let bad = 0;
  for (let iz = 0; iz < n; iz++) {
    const z = -WORLD_HALF + iz * TERRAIN_STEP;
    for (let ix = 0; ix < n; ix++) {
      const x = -WORLD_HALF + ix * TERRAIN_STEP;
      const { lon, lat } = frame.fromWorld(x, z);
      const alt = sampleAlt(quads, lon, lat);
      if (!Number.isFinite(alt)) bad++;
      alts[iz * n + ix] = alt;
    }
  }
  fillHoles(alts, n, DATUM_ALT);
  const out = new Int16Array(n * n);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n * n; i++) {
    const y = altToY(alts[i]);
    min = Math.min(min, y); max = Math.max(max, y);
    out[i] = Math.round(Math.max(-320, Math.min(320, y)) * 100);
  }
  const towerY = out[((n - 1) / 2) * n + (n - 1) / 2] / 100;
  log.info(`terrain: ${n}x${n} @ ${TERRAIN_STEP} m, y range ${min.toFixed(2)}..${max.toFixed(2)} m, origin y=${towerY.toFixed(2)}, filled holes ${bad} (${(100 * bad / (n * n)).toFixed(0)} %)`);
  await fs.writeFile(binOut, Buffer.from(out.buffer));
  await fs.writeFile(path.join(OUT_DIR, 'terrain_raw.bin'), Buffer.from(out.buffer)); // untouched copy; build.ts lowers river beds into terrain.bin
  await writeJson(jsonOut, { n, step: TERRAIN_STEP, origin: -WORLD_HALF, format: 'int16cm', minY: min, maxY: max });

  // Debug preview.
  const img = Buffer.alloc(n * n);
  for (let i = 0; i < n * n; i++) img[i] = Math.max(0, Math.min(255, Math.round(((out[i] / 100 - min) / (max - min)) * 255)));
  await sharp(img, { raw: { width: n, height: n, channels: 1 } }).png().toFile(path.join(CACHE_DIR, 'terrain_preview.png'));
}
