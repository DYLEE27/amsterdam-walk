import path from 'node:path';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { BakeContext } from '../bake.ts';
import { log } from './log.ts';
import { BBOX_PADDED, BUILDINGS_LAYER, CACHE_DIR, WFS_BDTOPO, type LonLatBox } from '../config.ts';
import { exists, fetchRetry, readJson, writeJson } from './http.ts';

export interface BdTopoProps {
  cleabs: string;
  nature: string | null;
  usage_1: string | null;
  construction_legere: boolean | null;
  hauteur: number | null;
  altitude_minimale_sol: number | null;
  altitude_maximale_toit: number | null;
  nombre_d_etages: number | null;
  materiaux_de_la_toiture: string | null;
  precision_altimetrique: number | null;
  etat_de_l_objet?: string | null;
  /** roof the source measured (3DBAG): overrides the Paris mansard inference in buildings.ts */
  roof_hint?: 'flat' | 'gabled' | 'hipped' | null;
  /** construction year (BAG oorspronkelijkbouwjaar) */
  year?: number | null;
}
export type BdTopoFeature = Feature<Polygon | MultiPolygon, BdTopoProps>;

/** The 3DBAG LoD1.2 attributes this pipeline reads (NAP metres). */
interface Bag3dProps {
  identificatie: string;
  b3_h_maaiveld: number | null;
  b3_h_min: number | null; b3_h_50p: number | null; b3_h_70p: number | null; b3_h_max: number | null; b3_h_nok: number | null;
  b3_dak_type: string | null;
  b3_bouwlagen: number | null;
  b3_kas_warenhuis: boolean | null;
  b3_rmse_lod12: number | null;
  b3_pw_onvoldoende: boolean | null;
  oorspronkelijkbouwjaar: number | null;
}

/**
 * 3DBAG building -> BD TOPO shape. `hauteur` is the gutter (eave) above the ground, `altitude_maximale_toit` the ridge.
 * A canal house's roof points run from the gutter (h_min) to the ridge (h_nok) within a few metres, so a slanted
 * roof whose lowest point is well up the building is a single gable. Anything else slanted (a palace, a block with
 * annexes, where h_min is a low wing) takes the median as the eave and a hipped cap to the ridge; flat roofs use the
 * 70th percentile, the height 3DBAG itself recommends for LoD1 extrusion.
 */
export function bag3dToBdTopo(p: Bag3dProps): BdTopoProps {
  const g = p.b3_h_maaiveld;
  const base: BdTopoProps = {
    cleabs: p.identificatie, nature: null, usage_1: null, construction_legere: p.b3_kas_warenhuis ?? null,
    hauteur: null, altitude_minimale_sol: g, altitude_maximale_toit: null, nombre_d_etages: p.b3_bouwlagen ?? null,
    materiaux_de_la_toiture: null, precision_altimetrique: p.b3_rmse_lod12 ?? null, roof_hint: null, year: p.oorspronkelijkbouwjaar ?? null,
  };
  if (g == null || p.b3_h_70p == null || p.b3_pw_onvoldoende) return base;
  const h70 = p.b3_h_70p - g;
  if (p.b3_dak_type === 'slanted' && p.b3_h_min != null && p.b3_h_50p != null) {
    const ridgeAlt = p.b3_h_nok ?? p.b3_h_max ?? p.b3_h_70p;
    const eaveMin = p.b3_h_min - g;
    if (eaveMin >= 2.5 && eaveMin >= 0.55 * h70 && ridgeAlt - p.b3_h_min <= 14) {
      return { ...base, hauteur: eaveMin, altitude_maximale_toit: Math.max(ridgeAlt, p.b3_h_min + 1.5), roof_hint: 'gabled' };
    }
    const eave = p.b3_h_50p - g;
    if (eave >= 2.5) return { ...base, hauteur: eave, altitude_maximale_toit: Math.min(Math.max(ridgeAlt, p.b3_h_50p + 1.5), p.b3_h_50p + 10), roof_hint: 'hipped' };
  }
  return { ...base, hauteur: h70, roof_hint: 'flat' };
}

const dir = path.join(CACHE_DIR, 'bdtopo');
const PAGE = 5000;

export async function fetchLayer(typename: string, bbox: LonLatBox, tag: string, force: boolean, cql?: string): Promise<FeatureCollection<Polygon | MultiPolygon, BdTopoProps>> {
  const out = path.join(dir, `${tag}.geojson`);
  if (!force && await exists(out)) return readJson(out);
  const features: BdTopoFeature[] = [];
  for (let start = 0; ; start += PAGE) {
    const url = WFS_BDTOPO(typename, bbox, PAGE, start, cql);
    const res = await fetchRetry(url, { timeoutMs: 180_000, onRetry: (n, why) => log.warn(`wfs retry ${n}: ${why}`) });
    const fc = await res.json() as FeatureCollection<Polygon | MultiPolygon, Bag3dProps> & { numberMatched?: number };
    for (const f of fc.features) features.push({ type: 'Feature', geometry: f.geometry, properties: bag3dToBdTopo(f.properties) });
    log.info(`3dbag ${tag}: +${fc.features.length} (total ${features.length}${fc.numberMatched != null ? ` / ${fc.numberMatched}` : ''})`);
    if (fc.features.length < PAGE) break;
  }
  // Keep things 2D and in lon/lat order (a WFS may answer EPSG:4326 as lat/lon; Amsterdam's lon < lat tells them apart).
  for (const f of features) {
    const fix = (ring: number[][]) => ring.forEach(c => { c.length = 2; if (c[0] > c[1]) { const t = c[0]; c[0] = c[1]; c[1] = t; } });
    if (f.geometry.type === 'Polygon') f.geometry.coordinates.forEach(fix);
    else f.geometry.coordinates.forEach(p => p.forEach(fix));
  }
  const result: FeatureCollection<Polygon | MultiPolygon, BdTopoProps> = { type: 'FeatureCollection', features };
  await writeJson(out, result);
  return result;
}

export async function loadBuildings(): Promise<FeatureCollection<Polygon | MultiPolygon, BdTopoProps>> {
  return readJson(path.join(dir, 'batiment.geojson'));
}

export async function run(ctx: BakeContext) {
  const fc = await fetchLayer(BUILDINGS_LAYER, BBOX_PADDED, 'batiment', ctx.force);
  const withH = fc.features.filter(f => f.properties.hauteur != null && f.properties.hauteur > 0).length;
  const withRidge = fc.features.filter(f => f.properties.altitude_maximale_toit != null && f.properties.altitude_minimale_sol != null).length;
  log.info(`3dbag: ${fc.features.length} buildings, ${withH} with hauteur, ${withRidge} with roof/ground altitudes`);
  const natures: Record<string, number> = {};
  for (const f of fc.features) { const k = f.properties.nature ?? 'null'; natures[k] = (natures[k] ?? 0) + 1; }
  log.info('bdtopo natures:', JSON.stringify(natures));
}
