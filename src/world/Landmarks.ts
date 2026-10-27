import { DATA_URL, fetchJson } from './DataLoader';
import type { Landmark, LandmarksData } from '../../shared/layout';
import { bearingDeg, landmarkAt, nearestLandmark, sortByDistance } from '../../shared/landmarks';

/** The eight hotkey sites (positions from scripts/lib/landmarks_registry.ts), used when landmarks.json has not been baked (`npm run bake:landmarks`). */
const FALLBACK: [number, string, string, string, number, number, number?][] = [
  [1, 'dam', '담 광장', 'De Dam', -6, -2], [2, 'koninklijk-paleis', '암스테르담 왕궁', 'Koninklijk Paleis', -93, -4],
  [3, 'centraal', '암스테르담 중앙역', 'Amsterdam Centraal', 537, -645], [4, 'anne-frank', '안네 프랑크의 집', 'Anne Frank Huis', -586, -228],
  [5, 'westerkerk', '베스테르케르크', 'Westerkerk', -598, -162], [6, 'oude-kerk', '아우더 케르크', 'Oude Kerk', 366, -140],
  [7, 'begijnhof', '베긴호프', 'Begijnhof', -179, 407], [8, 'waag', '바흐', 'De Waag', 519, 37],
];

/** Curated sites (names, descriptions, photos, landing spots) and the proximity queries over them. */
export class Landmarks {
  list: Landmark[] = [];
  readonly byId = new Map<string, Landmark>();
  credits: string[] = [];
  /** false = built-in fallback list (no descriptions / photos) */
  baked = false;

  async load() {
    try {
      const d = await fetchJson<LandmarksData>(`${DATA_URL}/landmarks.json`);
      this.list = d.landmarks; this.credits = d.credits ?? []; this.baked = true;
    } catch (e) {
      console.warn('landmarks.json missing (npm run bake:landmarks): using the built-in viewpoints', e);
      this.list = FALLBACK.map(([hotkey, id, ko, fr, x, z, deck]) => ({
        id, category: 'monument', hotkey, hidden: !!deck, x, z, lon: 0, lat: 0, radius: deck ? 0 : 80,
        view: { x, z, yaw: bearingDeg(x, z, 0, 0), deck }, name: { ko, fr, en: fr }, short: ko, links: {},
      }));
    }
    for (const l of this.list) this.byId.set(l.id, l);
  }

  get visible() { return this.list.filter(l => !l.hidden); }
  byHotkey(n: number) { return this.list.find(l => l.hotkey === n) ?? null; }
  at(x: number, z: number) { return landmarkAt(this.list, x, z); }
  nearest(x: number, z: number) { return nearestLandmark(this.list, x, z); }
  sorted(x: number, z: number) { return sortByDistance(this.visible, x, z); }
}
