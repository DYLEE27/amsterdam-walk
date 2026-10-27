import { EIFFEL_OSM_WAY_ID, EIFFEL_SOURCE_GLB } from './config.ts';

/**
 * Hero models: real 3D models that replace the extruded footprint of a landmark. The bake (npm run bake:models)
 * fits each source glTF onto its OSM footprint, crops and compresses it, and writes public/models/{id}.glb + .json;
 * the footprints listed here are dropped from the building extrusion, inpainted in the orthophoto and used as
 * shadow casters. Only the Eiffel Tower ships by default: free, licence-clean models of the other landmarks are
 * rare. Add an entry (and drop the glb into public/models) when one turns up.
 *
 * Licence guard: entries whose licence is non-commercial / no-derivatives / unknown are refused unless
 * ALLOW_NONFREE=1 is set for the bake.
 */
export interface LandmarkModel {
  id: string;
  /** OSM footprints the model replaces */
  osm: { type: 'way' | 'relation'; id: number }[];
  /**
   * Explicit placement for a landmark that has no building footprint to fit onto — a statue or a memorial, which
   * OSM maps as a node. Used only when `osm` yields nothing; `radius` bounds the crop and the shadow.
   */
  place?: { lon: number; lat: number; radius: number };
  /** file name in public/models, or a URL to download */
  source: string;
  fit:
    | { kind: 'eiffel' }
    | { kind: 'footprint-rect'; axis?: 'long' | 'short'; yawDeg?: number }
    | { kind: 'height'; height: number; yawDeg: number }
    | { kind: 'scale'; scale: number; yawDeg: number };
  crop?: { clean?: boolean; radius?: number; dropBelowM?: number };
  credits: { title: string; author?: string; license: string; url: string };
  /** `metalness` / `roughness` override a source material that is implausible for the real subject. */
  runtime?: {
    floodlit?: boolean; paint?: [number, number, number]; lodAtM?: number; metalness?: number; roughness?: number;
    /** Multiplies a scan's base colour (values may exceed 1): photogrammetry textures often bake in shadow. */
    tint?: [number, number, number];
    /** Draw both faces — scans frequently have inconsistent winding, which reads as holes punched in the surface. */
    doubleSided?: boolean;
    /** Masonry pedestal built under the model at runtime; the model is raised to stand on it. */
    pedestal?: { height: number; baseW: number; topW: number; stepH?: number; stepW?: number; colour?: [number, number, number] };
  };
  targetTris?: number;
  textureSize?: number;
}

/**
 * Hero models fitted to OSM footprints. Paris shipped the Eiffel Tower and the Ile aux Cygnes Liberty replica here;
 * Amsterdam starts empty (every building comes from 3DBAG) until a CC0 / CC BY model of a landmark is added.
 */
export const LANDMARK_MODELS: LandmarkModel[] = [
];

const NONFREE = /\bNC\b|\bND\b|non-?commercial|unknown|all rights/i;
/** true when the licence allows redistribution here (or the bake was told to ignore that). */
export function licenseAllowed(license: string): boolean {
  return process.env.ALLOW_NONFREE === '1' || !NONFREE.test(license);
}
