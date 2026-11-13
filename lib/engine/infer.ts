// Turning a sparse map of facilities into a dependency graph.
//
// OSM records where infrastructure is, almost never what feeds what. So every
// dependency here is a guess from geography (nearest supplier in a service
// radius) unless an OSM power line actually joins the two, and every guess is
// labelled as one, with a confidence.

import type { Assumptions } from '../assumptions';
import type { CityData, CityNode, Edge, Kind, Scenario, Service } from './types';

export function km(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const x = (b.lng - a.lng) * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const y = b.lat - a.lat;
  return Math.sqrt(x * x + y * y) * 111.32;
}

/** Suppliers sorted by distance from `n`, within `radius` km. */
function nearest(n: CityNode, pool: CityNode[], radius: number) {
  return pool
    .map((s) => ({ s, d: km(n, s) }))
    .filter((x) => x.d <= radius && x.s.id !== n.id)
    .sort((a, b) => a.d - b.d);
}

const POWERED: Kind[] = ['water_works', 'pumping', 'hospital', 'clinic', 'telecom', 'fuel', 'shelter', 'district'];
const WATERED: Kind[] = ['hospital', 'clinic', 'shelter', 'district'];
const COMMS: Kind[] = ['hospital', 'clinic', 'shelter', 'district'];

export function inferEdges(city: CityData, a: Assumptions): Edge[] {
  const by = (...k: Kind[]) => city.nodes.filter((n) => k.includes(n.kind));
  const edges: Edge[] = [];
  const add = (e: Omit<Edge, 'id'>) => edges.push({ id: `${e.type}:${e.from}>${e.to}`, ...e });
  const comp = roadComponents(city);
  const sameComponent = (x: CityNode, y: CityNode) => x.road >= 0 && y.road >= 0 && comp[x.road] === comp[y.road];

  // Single feeder, AND logic. Confidence is how clearly the nearest supplier
  // beats the runner-up: 0.5 when they are equidistant, towards 1 when the
  // runner-up is much further away. The runner-up is kept as `alt` so Monte
  // Carlo can try the world where the guess was wrong.
  const feeder = (n: CityNode, pool: CityNode[], radius: number, type: Service, what: string) => {
    const near = nearest(n, pool, radius);
    if (!near.length) return;
    const [first, second] = near;
    const confidence = second ? second.d / (first.d + second.d) : 0.9;
    add({
      from: first.s.id, to: n.id, type, logic: 'and', provenance: 'inferred',
      confidence: round2(confidence), alt: second?.s.id,
      note: `Nearest ${what} (${first.d.toFixed(1)} km)${second ? `; next is ${second.d.toFixed(1)} km` : ''}.`,
    });
  };

  const observedTo = new Set(city.observed.map((o) => `${o.type}:${o.to}`));
  for (const o of city.observed) {
    add({ from: o.from, to: o.to, type: o.type, logic: 'and', provenance: 'observed', confidence: 1, note: o.note });
  }

  const substations = by('substation');
  for (const n of by(...POWERED)) {
    if (!observedTo.has(`power:${n.id}`)) feeder(n, substations, a['radius.power'], 'power', 'substation');
  }

  const towers = by('water_tower');
  const sources = by('pumping', 'water_works');
  for (const n of towers) feeder(n, sources, a['radius.water'], 'water', 'pumping station or works');
  for (const n of by(...WATERED)) {
    const pool = nearest(n, towers, a['radius.water']).length ? towers : sources;
    feeder(n, pool, a['radius.water'], 'water', pool === towers ? 'water tower' : 'pumping station or works');
  }

  // Redundant suppliers, OR logic: any mast in range, any of the nearest
  // reachable hospitals, any of the nearest reachable fuel stations.
  const anyOf = (n: CityNode, pool: CityNode[], k: number, type: Service, what: string, radius = Infinity) => {
    for (const { s, d } of nearest(n, pool, radius).slice(0, k)) {
      add({
        from: s.id, to: n.id, type, logic: 'or', provenance: 'inferred',
        confidence: round2(Math.max(0.3, 1 - d / (radius === Infinity ? 10 : radius * 1.5))),
        note: `One of the ${k} nearest ${what} (${d.toFixed(1)} km).`,
      });
    }
  };
  const masts = by('telecom');
  for (const n of by(...COMMS)) anyOf(n, masts, a['k.comms'], 'comms', 'masts', a['radius.comms']);

  const hospitals = by('hospital');
  for (const n of by('district')) {
    anyOf(n, hospitals.filter((h) => sameComponent(n, h)), a['k.hospital'], 'access', 'hospitals by road');
  }
  const fuel = by('fuel');
  for (const n of hospitals) anyOf(n, fuel.filter((f) => sameComponent(n, f)), a['k.fuel'], 'access', 'fuel stations by road');

  return edges;
}

/** Applies the user's per-edge edits on top of the inferred graph. */
export function applyOverrides(edges: Edge[], s: Scenario): Edge[] {
  return edges.flatMap((e) => {
    const o = s.edgeOverrides[e.id];
    if (!o) return [e];
    if (o.removed) return [];
    return [{ ...e, confidence: o.confidence ?? e.confidence, provenance: 'user-set' as const, alt: o.confidence === 1 ? undefined : e.alt }];
  });
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------------------
// Road reachability.
//
// For an access edge we want the highest water stage at which the two ends are
// still connected by a passable road: the bottleneck (widest) path, where a
// path's capacity is its lowest point. One max-min Dijkstra per supplier gives
// that cutoff for every consumer at once, so the per-step check during the
// simulation is a single comparison.
// ---------------------------------------------------------------------------

type Adj = { to: number; edge: number }[][];
const adjCache = new WeakMap<CityData, Adj>();

function adjacency(city: CityData): Adj {
  let adj = adjCache.get(city);
  if (adj) return adj;
  adj = city.road.v.map(() => []);
  city.road.e.forEach(([x, y], i) => {
    adj![x].push({ to: y, edge: i });
    adj![y].push({ to: x, edge: i });
  });
  adjCache.set(city, adj);
  return adj;
}

const compCache = new WeakMap<CityData, Int32Array>();
function roadComponents(city: CityData): Int32Array {
  let c = compCache.get(city);
  if (c) return c;
  const adj = adjacency(city);
  c = new Int32Array(city.road.v.length).fill(-1);
  let id = 0;
  for (let s = 0; s < c.length; s++) {
    if (c[s] >= 0) continue;
    const stack = [s];
    c[s] = id;
    while (stack.length) {
      for (const { to } of adj[stack.pop()!]) if (c[to] < 0) { c[to] = id; stack.push(to); }
    }
    id++;
  }
  compCache.set(city, c);
  return c;
}

/** Water stage above which each access edge is cut. Keyed by edge id. */
export function accessCutoffs(city: CityData, edges: Edge[], s: Scenario, a: Assumptions): Map<string, number> {
  const adj = adjacency(city);
  const byId = new Map(city.nodes.map((n) => [n.id, n]));
  const failed = new Set(s.failed);
  const raised = new Set(s.interventions.filter((i) => i.kind === 'bridge' || i.kind === 'harden').map((i) => i.node));
  const pass = a['road.passable'];

  const edgeCap = city.road.e.map(([, , interior, bridge]) => {
    if (bridge === 'flyover') return Infinity;
    if (bridge) {
      // Repairing a bridge also reopens one that was failed by hand.
      if (failed.has(bridge) && !raised.has(bridge)) return -Infinity;
      const b = byId.get(bridge);
      return (b ? b.hand : 0) + a['bridge.clearance'] + (raised.has(bridge) ? a['int.hardenMetres'] : 0);
    }
    return interior === null ? Infinity : interior + pass;
  });
  const nodeCap = city.road.v.map(([, , h]) => h + pass);

  const out = new Map<string, number>();
  const bySupplier = new Map<string, Edge[]>();
  for (const e of edges) {
    if (e.type !== 'access') continue;
    (bySupplier.get(e.from) ?? bySupplier.set(e.from, []).get(e.from)!).push(e);
  }
  for (const [from, list] of bySupplier) {
    const src = byId.get(from);
    if (!src || src.road < 0) continue;
    const best = widest(adj, src.road, nodeCap, edgeCap);
    for (const e of list) {
      const to = byId.get(e.to);
      out.set(e.id, to && to.road >= 0 ? best[to.road] : -Infinity);
    }
  }
  return out;
}

function widest(adj: Adj, src: number, nodeCap: number[], edgeCap: number[]): Float64Array {
  const best = new Float64Array(adj.length).fill(-Infinity);
  best[src] = nodeCap[src];
  const heap = new MaxHeap();
  heap.push(best[src], src);
  while (heap.size) {
    const [w, u] = heap.pop();
    if (w < best[u]) continue;
    for (const { to, edge } of adj[u]) {
      const v = Math.min(w, edgeCap[edge], nodeCap[to]);
      if (v > best[to]) { best[to] = v; heap.push(v, to); }
    }
  }
  return best;
}

class MaxHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() { return this.k.length; }
  push(key: number, val: number) {
    const { k, v } = this;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] >= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop(): [number, number] {
    const { k, v } = this;
    const top: [number, number] = [k[0], v[0]];
    const lk = k.pop()!, lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lk;
        if (l < k.length && k[l] > mk) { m = l; mk = k[l]; }
        if (r < k.length && k[r] > mk) { m = r; }
        if (m === i) break;
        k[i] = k[m]; v[i] = v[m]; i = m;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

