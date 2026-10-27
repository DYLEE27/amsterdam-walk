import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frame, worldBoxToLonLatBox } from '../shared/geo.ts';
import { WORLD_HALF } from '../shared/layout.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const CACHE_DIR = path.join(ROOT, 'cache');
export const OUT_DIR = path.join(ROOT, 'public', 'data');
export const MODELS_DIR = path.join(ROOT, 'public', 'models');
export const TEXTURES_DIR = path.join(ROOT, 'public', 'textures');

export interface LonLatBox { west: number; east: number; south: number; north: number }

/** Exact lon/lat bbox of the baked square. */
export const BBOX: LonLatBox = worldBoxToLonLatBox(frame, 0, 0, WORLD_HALF);
/** Padded bbox for vector fetches so edge features arrive whole. */
export const FETCH_PAD_M = 150;
export const BBOX_PADDED: LonLatBox = worldBoxToLonLatBox(frame, 0, 0, WORLD_HALF + FETCH_PAD_M);
/** Far skyline ring (flat LOD1 extrusions), fetched from 3DBAG only. */
export const FAR_HALF_M = 2400;
export const BBOX_FAR: LonLatBox = worldBoxToLonLatBox(frame, 0, 0, FAR_HALF_M);

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  // VK Maps' public instance: slow to answer (30 s queueing) but up when the others answered 502 for a whole day
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** PDOK Luchtfoto RGB (8 cm "Actueel_orthoHR", CC BY 4.0), keyless WMTS in the standard EPSG:3857 tile pyramid. */
export const WMTS_ORTHO = (z: number, x: number, y: number) =>
  `https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/${z}/${x}/${y}.jpeg`;
/** 19 = ~18 cm/px at Amsterdam's latitude; 18 quarters the ground textures. */
export const ORTHO_ZOOM = 19;
export const ORTHO_OVERVIEW_ZOOM = 17;

/**
 * AHN (Actueel Hoogtebestand Nederland, CC0) through PDOK's keyless WCS: float32 GeoTIFF resampled by the server
 * onto an exact EPSG:4326 grid, so the readers can treat it like the BIL grids this pipeline was written for.
 * The DTM (maaiveld) has NODATA under buildings and water; terrain.ts fills those holes.
 */
const AHN_WCS = (coverage: string, b: LonLatBox, w: number, h: number) =>
  `https://service.pdok.nl/rws/ahn/wcs/v1_0?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=${coverage}&FORMAT=image/tiff&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326&SUBSET=Lat(${b.south},${b.north})&SUBSET=Long(${b.west},${b.east})&SCALESIZE=Long(${w}),Lat(${h})`;
export const WMS_ELEVATION = (b: LonLatBox, w: number, h: number) => AHN_WCS('dtm_05m', b, w, h);

/** AHN surface model (DSM, 50 cm): the true roof surface of every building, from the same WCS as the DTM. */
export const WMS_DSM_LAYERS = ['dsm_05m'];
export const WMS_DSM = (layer: string, b: LonLatBox, w: number, h: number) => AHN_WCS(layer, b, w, h);
export const WMS_CAPABILITIES = 'https://service.pdok.nl/rws/ahn/wcs/v1_0?SERVICE=WCS&REQUEST=GetCapabilities&VERSION=2.0.1';
/** Amsterdam canal water level (NAP metres): the city's "boezem" is held at NAP -0.40. */
export const WATER_LEVEL_ALT = -0.4;
export const DSM_STEP_M = 0.5;
export const DSM_MAX_PX = 2048;
/** margin around a landmark footprint (m) so edge samples and the wall-top probes have data */
export const DSM_PAD_M = 6;

/**
 * 3DBAG (TU Delft 3D geoinformation, CC BY 4.0): every BAG building with LiDAR-derived roof heights. The LoD1.2 layer
 * has one polygon per building, which is what the BD TOPO matcher in buildings.ts expects; bdtopo.ts maps its
 * attributes onto the BD TOPO shape. Served in EPSG:4326 on request (lon, lat order).
 */
export const BUILDINGS_LAYER = 'BAG3D:lod12';
export const WFS_BDTOPO = (typename: string, b: LonLatBox, count: number, start: number, cql?: string) =>
  `https://data.3dbag.nl/api/BAG3D/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${typename}&OUTPUTFORMAT=application/json&SRSNAME=urn:ogc:def:crs:EPSG::4326&SORTBY=fid&COUNT=${count}&STARTINDEX=${start}&${cql ? `CQL_FILTER=${encodeURIComponent(`${cql} AND BBOX(geom,${b.south},${b.west},${b.north},${b.east},'urn:ogc:def:crs:EPSG::4326')`)}` : `BBOX=${b.south},${b.west},${b.north},${b.east},urn:ogc:def:crs:EPSG::4326`}`;
/** Outer skyline ring: only buildings this tall are fetched between FAR_HALF_M and FAR_TALL_HALF_M (Centraal's towers, the IJ waterfront, Zuidas). */
export const FAR_TALL_HALF_M = 5000;
export const FAR_TALL_MIN_H = 25;
export const FAR_TALL_CQL = `(b3_h_70p - b3_h_maaiveld) >= ${FAR_TALL_MIN_H}`;
export const BBOX_FAR_TALL: LonLatBox = worldBoxToLonLatBox(frame, 0, 0, FAR_TALL_HALF_M);

/** Gemeente Amsterdam tree register (Bomen, public domain-like open data), WFS on the city's DSO API. */
export const CITY_TREES = (b: LonLatBox, count: number, start: number) =>
  `https://api.data.amsterdam.nl/v1/wfs/bomen/?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=stamgegevens&OUTPUTFORMAT=geojson&SRSNAME=urn:ogc:def:crs:EPSG::4326&COUNT=${count}&STARTINDEX=${start}&BBOX=${b.south},${b.west},${b.north},${b.east},urn:ogc:def:crs:EPSG::4326`;

export const EIFFEL_3DMR_URL = 'https://3dmr.eu/api/model/4';
export const EIFFEL_OSM_WAY_ID = 5013364;
/** Preferred tower model in public/models (user's choice; Sketchfab CC-BY, credited in the HUD). Override with EIFFEL_SOURCE=. */
export const EIFFEL_SOURCE_GLB = 'eiffel_tower_model_3d_with_best_quality.glb';

/**
 * Roof fixes for buildings whose OSM tags miss what everyone can see (keyed by OSM id): the gilded dome of the
 * Invalides, for example. `shape` / `material` / `colour` replace the roof:* tags.
 */
export const ROOF_OVERRIDES: Record<string, { shape?: string; material?: string; colour?: string }> = {};

/**
 * City building defaults (metres), still named after the Paris block they were written for. Amsterdam's default is
 * the canal house: a tall ground floor, four storeys of about 3 m and a steep gable roof facing the street.
 */
export const HAUSSMANN = {
  groundFloor: 3.8,
  floor: 3.0,
  defaultEave: 13.0,
  defaultRidge: 18.0,
  mansardInset1: 1.3,
  mansardRise1Max: 4.0,
  mansardInset2Max: 4.0,
  minMansardDelta: 2.5,
};

export const ASSETS = {
  polyhaven: {
    textures: ['plastered_stone_wall', 'concrete_wall_008', 'metal_plate_02', 'roof_slates_02', 'aerial_asphalt_01', 'cobblestone_floor_08', 'plaster_grey_04', 'large_sandstone_blocks'],
    hdris: ['kloofendal_48d_partly_cloudy_puresky', 'qwantani_puresky'],
  },
  ambientcg: ['Facade001', 'Facade018A', 'PavingStones138', 'Grass004', 'Gravel043', 'Bark014', 'Asphalt033'],
};

/**
 * Monument statues placed by hand (lon, lat, height in metres, and the bearing the figure faces).
 *
 * OSM does carry these as `tourism=artwork` / `man_made=statue` nodes and the `points` theme now asks for them,
 * but the curated list is what guarantees the landmarks the app advertises actually stand there: a landmark card
 * with nothing under it is worse than no card. Anything the OSM themes bring in within 12 m of one of these is
 * dropped so the two sources cannot double up.
 */
export const STATUES: { id: string; lon: number; lat: number; height: number; facing: number; kind?: 'statue' | 'flame' | 'peacewall' }[] = [
];

/**
 * Roof for a pitched building whose shape no source states (Paris: the mansard). A canal house's gable runs along
 * the deep plot, so directionless gables get their ridge on the footprint's long axis (buildings.ts).
 */
export const DEFAULT_ROOF = 'gabled' as const;

/**
 * Facade colours for the city's ordinary blocks (Paris used one limestone cream). Amsterdam's canal houses are mostly
 * brick, from orange-red to purple-brown, with a few painted near-black and a few plastered white; picked per
 * building from its seed. Entries repeat to weight them.
 */
export const FACADE_PALETTE: [number, number, number][] = [
  [150, 78, 58], [150, 78, 58], [132, 66, 50], [132, 66, 50], [168, 96, 70], [112, 58, 46], [112, 58, 46],
  [96, 54, 44], [124, 82, 64], [176, 112, 84], [62, 52, 48], [70, 62, 56], [226, 220, 206], [214, 204, 186],
];

/**
 * Pitched roofs with no stated material (every 3DBAG building): Amsterdam's are mostly red-orange ceramic pantiles
 * and dark grey to black glazed tiles or slate, with some zinc. Entries repeat to weight them (about 50 / 40 / 10).
 */
export const ROOF_MIX: ['tile' | 'slate' | 'zinc', [number, number, number]][] = [
  ['tile', [146, 66, 40]], ['tile', [128, 56, 36]], ['tile', [156, 78, 46]], ['tile', [112, 52, 36]], ['tile', [138, 70, 46]],
  ['slate', [58, 60, 66]], ['slate', [70, 74, 82]], ['slate', [48, 50, 56]], ['slate', [84, 82, 80]],
  ['zinc', [128, 134, 140]],
];

/**
 * Landmarks kept on the analytic roof although they qualify for a LiDAR cap: the Oude Kerk stands in a ring of tall
 * plane trees on the Oudekerksplein, and their crowns came out of the AHN surface model as grey spikes on its roof.
 */
export const DSM_EXCLUDE = new Set<string>(['way/57857592']);
