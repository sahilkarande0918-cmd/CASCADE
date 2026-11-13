// Shared shapes for the city data file, the engine and the UI.

export const SERVICES = ['power', 'water', 'access', 'comms'] as const;
export type Service = (typeof SERVICES)[number];

export type Kind =
  | 'substation'
  | 'water_works'
  | 'pumping'
  | 'water_tower'
  | 'hospital'
  | 'clinic'
  | 'telecom'
  | 'fuel'
  | 'shelter'
  | 'bridge'
  | 'district';

export type Provenance = 'observed' | 'inferred' | 'user-set';

/** One piece of infrastructure (or a neighbourhood, for `district`). */
export type CityNode = {
  id: string;
  kind: Kind;
  name: string;
  lng: number;
  lat: number;
  /** Ground elevation, metres (Terrarium DEM). */
  elev: number;
  /** Height above nearest mapped drainage (river, canal or coast), metres. */
  hand: number;
  /** Index into road.v of the nearest road junction, or -1. */
  road: number;
  /** Districts only. */
  pop?: number;
  popSource?: 'osm' | 'assumed';
  osm: string;
};

/** Road graph: junctions plus junction-to-junction segments. */
export type RoadGraph = {
  /** [lng, lat, hand] per junction. */
  v: [number, number, number][];
  /** [a, b, minInteriorHand (null = none), bridge node id or 'flyover' or null, flat coords lng,lat,...]. */
  e: [number, number, number | null, string | null, number[]][];
};

export type HandGrid = {
  bbox: [number, number, number, number];
  nx: number;
  ny: number;
  /** Row-major from the north-west corner, decimetres; -32768 = no data. */
  h: number[];
  /** Ground elevation, metres, same layout. */
  e?: number[];
};

export type CityData = {
  key: string;
  name: string;
  country: string;
  bbox: [number, number, number, number];
  center: [number, number];
  zoom: number;
  generatedAt: string;
  nodes: CityNode[];
  /** Supplier -> consumer pairs traced from OSM power lines. */
  observed: { from: string; to: string; type: Service; note: string }[];
  road: RoadGraph;
  grid: HandGrid;
};

export type Edge = {
  id: string;
  from: string;
  to: string;
  type: Service;
  /** AND: this supplier is required. OR: any one supplier of this type in the group will do. */
  logic: 'and' | 'or';
  provenance: Provenance;
  confidence: number;
  /** For inferred single-feeder edges: the next most likely supplier, used by Monte Carlo. */
  alt?: string;
  note: string;
};

export type InterventionKind = 'generator' | 'harden' | 'bridge' | 'mobile_substation';
export type Intervention = { kind: InterventionKind; node: string };

export type EdgeOverride = { confidence?: number; removed?: boolean };

export type Scenario = {
  /** Peak river stage above drainage, metres. */
  stage: number;
  /** Nodes failed by hand at t = 0. */
  failed: string[];
  interventions: Intervention[];
  edgeOverrides: Record<string, EdgeOverride>;
};
