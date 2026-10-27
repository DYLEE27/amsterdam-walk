import type { LandmarkCategory } from '../../shared/layout.ts';

/**
 * Curated landmarks inside the baked square. Positions, names, descriptions and photos are resolved at bake time
 * (OSM centre -> Wikidata -> Wikipedia summary -> Commons file); `approx` is the last-resort position so an entry
 * never disappears when a service is down. `view` is where the camera lands (keys 1-8).
 */
export interface LandmarkSpec {
  id: string;
  osm?: `node/${number}` | `way/${number}` | `relation/${number}`;
  /** overrides the OSM `wikidata` tag */
  wikidata?: string;
  category: LandmarkCategory;
  hotkey?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  hidden?: boolean;
  /** world x/z fallback */
  approx: [number, number];
  /** landing spot; yaw in degrees, deck = tower floor index (1 = 2nd floor) */
  view?: { x: number; z: number; yaw?: number; deck?: number };
  /** what the camera faces on arrival when `view.yaw` is not given */
  face?: 'tower' | 'centre';
  radius: number;
  short: string;
  blurbKo?: string;
}

export const LANDMARKS: LandmarkSpec[] = [
  // Amsterdam: OSM ids and positions from Overpass (wikidata-tagged features within 900 m of the Dam), 2026-10.
  // Views: walkable ground (surface.bin road / pavement / grass) 22-60 m off the facade by building size (inside the square for squares),
  // 3 m from tree trunks, clear of other buildings
  // and with an unobstructed line to the site; the default "step back toward the origin" landed 11 of 24 inside buildings.
  { id: 'dam', osm: 'way/94756489', category: 'square', hotkey: 1, approx: [-6, -2], face: 'centre', view: { x: 6, z: -2, yaw: 270 }, radius: 90, short: '담 광장',
    blurbKo: '암스테르담이 시작된 곳. 13세기 암스텔강을 막은 둑(dam) 자리에 생긴 광장으로, 왕궁과 국립 기념비가 마주 본다.' },
  { id: 'koninklijk-paleis', osm: 'relation/3580875', category: 'palace', hotkey: 2, approx: [-93, -4], view: { x: -44, z: 36, yaw: 310 }, radius: 70, short: '암스테르담 왕궁',
    blurbKo: '1655년 시청사로 지은 황금시대 건축의 걸작(야코프 판 캄펀 설계). 1808년 루이 나폴레옹이 왕궁으로 바꿨다.' },
  { id: 'centraal', osm: 'node/4290854847', category: 'institution', hotkey: 3, approx: [537, -645], view: { x: 610, z: -489, yaw: 335 }, radius: 140, short: '암스테르담 중앙역',
    blurbKo: '1889년 개통한 중앙역. 레이크스뮈세윔을 설계한 피에르 카위퍼스의 작품으로, IJ만의 인공섬 위에 서 있다.' },
  { id: 'anne-frank', osm: 'way/601081859', category: 'museum', hotkey: 4, approx: [-586, -228], view: { x: -645, z: -221, yaw: 70 }, radius: 40, short: '안네 프랑크의 집',
    blurbKo: '안네 프랑크 가족이 1942~1944년 나치를 피해 숨어 지낸 프린선흐라흐트 263번지의 은신처. 지금은 박물관이다.' },
  { id: 'westerkerk', osm: 'way/99205257', category: 'church', hotkey: 5, approx: [-598, -162], view: { x: -676, z: -151, yaw: 104 }, radius: 60, short: '베스테르케르크',
    blurbKo: '1631년 완공된 개신교 교회. 85 m 탑은 구시가에서 가장 높은 교회탑이고, 렘브란트가 이곳에 묻혔다.' },
  { id: 'oude-kerk', osm: 'way/57857592', category: 'church', hotkey: 6, approx: [366, -140], view: { x: 366, z: -74, yaw: 349 }, radius: 60, short: '아우더 케르크',
    blurbKo: '1306년 봉헌된, 암스테르담에 남은 가장 오래된 건물. 홍등가 한가운데 있다.' },
  { id: 'begijnhof', osm: 'way/26658363', category: 'square', hotkey: 7, approx: [-179, 407], face: 'centre', view: { x: -190, z: 412, yaw: 70 }, radius: 50, short: '베긴호프',
    blurbKo: '14세기 독신 여성 신자 공동체(베긴회)의 안뜰. 시내에서 가장 오래된 목조 주택이 남아 있다.' },
  { id: 'waag', osm: 'way/57857390', category: 'monument', hotkey: 8, approx: [519, 37], view: { x: 552, z: 36, yaw: 270 }, radius: 50, short: '바흐',
    blurbKo: '1488년 성문으로 지어져 계량소가 된 건물. 렘브란트 「툴프 박사의 해부학 강의」의 외과의사 길드가 이곳에 있었다.' },
  { id: 'nationaal-monument', osm: 'way/168680619', category: 'monument', approx: [67, 31], view: { x: 67, z: 57, yaw: 0 }, radius: 40, short: '국립 기념비',
    blurbKo: '제2차 세계대전 희생자를 기리는 높이 22 m의 흰 돌기둥(1956, J.J.P. 아우트 설계).' },
  { id: 'nieuwe-kerk', osm: 'node/4672250949', category: 'church', approx: [-69, -91], view: { x: -30, z: -24, yaw: 330 }, radius: 60, short: '니우어 케르크',
    blurbKo: '15세기 고딕 교회. 네덜란드 국왕의 즉위식이 열리는 곳이다.' },
  { id: 'beurs-van-berlage', osm: 'way/57858502', category: 'institution', approx: [244, -217], view: { x: 169, z: -110, yaw: 35 }, radius: 70, short: '베를라헤 증권거래소',
    blurbKo: '헨드릭 베를라헤가 설계한 옛 증권거래소(1903). 네덜란드 근대 건축의 출발점으로 꼽힌다.' },
  { id: 'sint-nicolaas', osm: 'way/174996833', category: 'church', approx: [575, -371], view: { x: 549, z: -408, yaw: 145 }, radius: 50, short: '성 니콜라스 대성당',
    blurbKo: '중앙역 맞은편의 네오바로크 성당(1887). 쌍둥이 탑과 돔이 있다.' },
  { id: 'schreierstoren', osm: 'way/57859248', category: 'monument', approx: [650, -363], view: { x: 647, z: -395, yaw: 175 }, radius: 30, short: '스흐레이에르스토런',
    blurbKo: '1480년경 성벽의 망루. 1609년 헨리 허드슨이 이 근처에서 신대륙을 향해 출항했다.' },
  { id: 'munttoren', osm: 'way/57862728', category: 'monument', approx: [35, 672], view: { x: 13, z: 657, yaw: 125 }, radius: 30, short: '문트토런',
    blurbKo: '옛 성문탑 위에 1620년 시계탑을 올렸다. 1672년 잠시 동전을 주조해 ‘조폐탑’이라 불린다.' },
  { id: 'bloemenmarkt', osm: 'way/145953534', category: 'square', approx: [-89, 684], face: 'centre', view: { x: -86, z: 670, yaw: 190 }, radius: 60, short: '꽃시장',
    blurbKo: '싱얼 운하에 띄운 바지선 위에 늘어선 꽃시장(1862~).' },
  { id: 'homomonument', osm: 'way/37737807', category: 'monument', approx: [-543, -152], view: { x: -546, z: -134, yaw: 10 }, radius: 30, short: '호모모뉴먼트',
    blurbKo: '박해받은 동성애자를 기리는 분홍 화강암 삼각형 기념비(1987).' },
  { id: 'ons-lieve-heer', osm: 'node/12837827701', category: 'museum', approx: [454, -230], view: { x: 488, z: -215, yaw: 295 }, radius: 30, short: '다락방의 주님 박물관',
    blurbKo: '운하 주택 다락에 숨겨진 17세기 가톨릭 교회. 지금은 박물관이다.' },
  { id: 'zuiderkerk', osm: 'way/114120359', category: 'church', approx: [480, 313], view: { x: 513, z: 336, yaw: 305 }, radius: 50, short: '자위더르케르크',
    blurbKo: '1611년 완공된 암스테르담 최초의 개신교 전용 교회.' },
  { id: 'nieuwmarkt', osm: 'way/123643479', category: 'square', approx: [519, 54], face: 'centre', view: { x: 531, z: 55, yaw: 270 }, radius: 80, short: '니우마르크트',
    blurbKo: '바흐를 둘러싼 광장. 차이나타운과 홍등가 사이의 장터였다.' },
  { id: 'rembrandthuis', osm: 'node/250624673', category: 'museum', approx: [582, 415], view: { x: 610, z: 420, yaw: 280 }, radius: 30, short: '렘브란트의 집',
    blurbKo: '렘브란트가 1639~1658년 살며 작업한 집. 지금은 박물관이다.' },
  { id: 'amsterdam-museum', osm: 'node/34050790', category: 'museum', approx: [-155, 297], view: { x: -194, z: 325, yaw: 55 }, radius: 50, short: '암스테르담 박물관' },
  { id: 'spui', osm: 'way/26341034', category: 'square', approx: [-194, 480], face: 'centre', view: { x: -182, z: 480, yaw: 270 }, radius: 50, short: '스파위',
    blurbKo: '서점과 카페가 모인 작은 광장. 베긴호프로 들어가는 문이 있다.' },
  { id: 'huis-met-de-hoofden', osm: 'way/266604553', category: 'monument', approx: [-357, -365], view: { x: -384, z: -361, yaw: 80 }, radius: 30, short: '머리들의 집',
    blurbKo: '파사드에 여섯 개의 두상이 새겨진 1622년의 운하 주택.' },
  { id: 'noorderkerk', osm: 'way/220961710', category: 'church', approx: [-427, -728], view: { x: -431, z: -686, yaw: 5 }, radius: 50, short: '노르데르케르크',
    blurbKo: '요르단 지구의 그리스 십자형 교회(1623).' },
];
