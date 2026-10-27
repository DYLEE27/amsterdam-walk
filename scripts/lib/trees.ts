import fs from 'node:fs/promises';
import path from 'node:path';
import type { FeatureCollection, Point } from 'geojson';
import type { BakeContext } from '../bake.ts';
import { log } from './log.ts';
import { BBOX_PADDED, CITY_TREES, OUT_DIR } from '../config.ts';
import { cachedJson, exists, writeJson } from './http.ts';
import { loadTheme } from './overpass.ts';
import { loadHeightmap } from './build.ts';
import { frame } from '../../shared/geo.ts';
import { TREE_STRIDE, TreeSpecies, WORLD_HALF } from '../../shared/layout.ts';

/** Gemeente Amsterdam "Bomen" register (stamgegevens): classes are Dutch text ranges, not numbers. */
interface CityTree {
  id?: number;
  soortnaam?: string | null;                 // Latin name, e.g. "Ulmus 'New Horizon'"
  boomhoogteklasse_actueel?: string | null;  // e.g. "c. 9 tot 12 m.", "g. 24 m. en hoger"
  stamdiameterklasse?: string | null;        // e.g. "0,3 tot 0,5 m."
  jaar_van_aanleg?: number | null;
}

const GENUS: [RegExp, TreeSpecies][] = [
  [/platanus/i, TreeSpecies.Platanus], [/tilia/i, TreeSpecies.Tilia], [/aesculus/i, TreeSpecies.Aesculus],
  [/sophora|styphnolobium/i, TreeSpecies.Sophora], [/acer/i, TreeSpecies.Acer],
  // Elms line most Amsterdam canals; Celtis is the nearest crown in the procedural set (both Ulmaceae / Cannabaceae, vase-shaped).
  [/celtis|ulmus|zelkova/i, TreeSpecies.Celtis],
];
const speciesOf = (genus: string | null | undefined): TreeSpecies => {
  for (const [re, s] of GENUS) if (genus && re.test(genus)) return s;
  return TreeSpecies.Other;
};

/** Middle of a Dutch range class ("c. 9 tot 12 m." -> 10.5, "g. 24 m. en hoger" -> 26, "a. tot 6 m." -> 4.5); NaN if unparsable. */
export function classMid(s: string | null | undefined, openTop = 1.1): number {
  if (!s) return NaN;
  const nums = (s.replace(/^[a-z]\.\s*/i, '').match(/\d+(?:,\d+)?/g) ?? []).map(v => parseFloat(v.replace(',', '.')));
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return /hoger|meer|groter/.test(s) ? nums[0] * openTop : /tot/.test(s) ? nums[0] * 0.75 : nums[0];
  return NaN;
}

const PAGE = 5000;
async function fetchCityTrees(): Promise<FeatureCollection<Point, CityTree>> {
  const features: FeatureCollection<Point, CityTree>['features'] = [];
  for (let start = 0, page = 0; ; start += PAGE, page++) {
    const fc = await cachedJson<FeatureCollection<Point, CityTree>>(CITY_TREES(BBOX_PADDED, PAGE, start), `city/trees_${page}.geojson`, { timeoutMs: 300_000 });
    features.push(...fc.features);
    if (fc.features.length < PAGE) break;
  }
  return { type: 'FeatureCollection', features };
}

export async function run(ctx: BakeContext) {
  const out = path.join(OUT_DIR, 'trees.bin');
  if (!ctx.force && await exists(out)) { log.info('trees: cached'); return; }
  const hm = await loadHeightmap();
  const fc = await fetchCityTrees();
  log.info(`trees: ${fc.features.length} Gemeente Amsterdam trees in the baked square`);

  const rows: number[] = [];
  const grid = new Map<string, number>(); // dedupe cell (4 m)
  const cellKey = (x: number, z: number) => `${Math.floor(x / 4)}_${Math.floor(z / 4)}`;
  const push = (x: number, z: number, h: number, circ: number, species: TreeSpecies, seed: number) => {
    if (Math.abs(x) > WORLD_HALF + 40 || Math.abs(z) > WORLD_HALF + 40) return false;
    const k = cellKey(x, z);
    if (grid.has(k)) return false;
    grid.set(k, rows.length / TREE_STRIDE);
    const y = hm.sample(x, z);
    const trunkR = Math.max(0.08, Math.min(0.9, circ / 100 / (2 * Math.PI)));
    rows.push(x, y, z, h, trunkR, species, seed);
    return true;
  };

  const stats: Record<string, number> = {};
  let n = 0;
  for (const f of fc.features) {
    const p = f.properties;
    const c = f.geometry?.coordinates;
    if (!c) continue;
    const w = frame.toWorld(c[0], c[1]);
    let h = classMid(p.boomhoogteklasse_actueel);
    if (!(h >= 2 && h <= 35)) h = 10;
    let circ = classMid(p.stamdiameterklasse, 1.2) * Math.PI * 100;   // diameter class (m) -> circumference (cm)
    if (!(circ >= 20 && circ <= 600)) circ = 60 + h * 6;
    const sp = speciesOf(p.soortnaam);
    const seed = ((p.id ?? n) * 2654435761) % 256;
    if (push(w.x, w.z, h, circ, sp, seed)) { n++; stats[TreeSpecies[sp]] = (stats[TreeSpecies[sp]] ?? 0) + 1; }
  }
  log.info(`trees: ${n} kept from the city register`, JSON.stringify(stats));

  // OSM natural=tree only where the city dataset has nothing within 4 m.
  try {
    const pts = await loadTheme('points');
    let added = 0;
    for (const f of pts.features) {
      if (f.geometry.type !== 'Point' || f.properties.tags?.natural !== 'tree') continue;
      const [lon, lat] = f.geometry.coordinates;
      const w = frame.toWorld(lon, lat);
      const near = [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dz]) => grid.has(cellKey(w.x + dx, w.z + dz)));
      if (near) continue;
      const h = parseFloat(f.properties.tags.height ?? '') || 9;
      const genus = f.properties.tags.genus ?? f.properties.tags.species ?? '';
      if (push(w.x, w.z, Math.min(30, Math.max(3, h)), 60 + h * 6, speciesOf(genus), (f.properties.id * 7919) % 256)) added++;
    }
    log.info(`trees: +${added} from OSM`);
  } catch { log.warn('trees: OSM points theme unavailable, skipping'); }

  const arr = new Float32Array(rows);
  await fs.writeFile(out, Buffer.from(arr.buffer));
  await writeJson(path.join(OUT_DIR, 'trees.json'), { count: arr.length / TREE_STRIDE, stride: TREE_STRIDE, species: Object.fromEntries(Object.entries(TreeSpecies).filter(([k]) => isNaN(Number(k)))) });
  log.info(`trees: wrote ${arr.length / TREE_STRIDE} trees`);
}
