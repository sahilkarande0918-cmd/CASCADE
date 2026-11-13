'use client';

import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapGeoJSONFeature, MapMouseEvent } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Assumptions } from '@/lib/assumptions';
import type { CityData, Edge } from '@/lib/engine/types';
import { KIND } from '@/lib/labels';
import { mapStyle } from '@/lib/mapStyle';
import { mix, P, rgbArray } from '@/lib/palette';

// MapLibre's own worker URL does not survive bundling; serve it from public/.
maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

export type MapView = {
  /** Per node: 0 up, 1 down, 2 on backup, at the current time. */
  states: Uint8Array | null;
  /** Hours since each node went down (for the spreading ring), or -1. */
  since: Float32Array | null;
  stage: number;
  selected: number;
  traceEdges: Set<number>;
  /** Threads in and out of the selected node. */
  focusEdges: Set<number>;
  failed: Set<string>;
  planned: Set<string>;
  showDeps: boolean;
};

type Props = {
  city: CityData;
  edges: Edge[];
  a: Assumptions;
  view: MapView;
  onNode: (i: number | null) => void;
  onEdge: (i: number) => void;
  onReady?: (m: maplibregl.Map) => void;
};

const SIZE = ['match', ['get', 'k'], 'substation', 1.6, 'hospital', 1.35, 'water_works', 1.4, 'bridge', 1.2, 'clinic', 0.8, 1] as maplibregl.ExpressionSpecification;
type Prev = { states: Uint8Array | null; sel: number; trace: Set<number>; focus: Set<number> };
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export default function CascadeMap({ city, edges, a, view, onNode, onEdge, onReady }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const prev = useRef<Prev>({ states: null, sel: -1, trace: new Set(), focus: new Set() });
  const cb = useRef({ onNode, onEdge });
  const latest = useRef({ city, edges, a, view });
  useEffect(() => {
    cb.current = { onNode, onEdge };
    latest.current = { city, edges, a, view };
  });

  // Build the map once per city.
  useEffect(() => {
    if (!holder.current) return;
    const [w, s, e, n] = city.bbox;
    const c = document.createElement('canvas');
    c.width = city.grid.nx;
    c.height = city.grid.ny;
    canvas.current = c;
    const m = new maplibregl.Map({
      container: holder.current,
      style: mapStyle(),
      bounds: [[w, s], [e, n]],
      fitBoundsOptions: { padding: 20 },
      maxBounds: [[w - 0.08, s - 0.08], [e + 0.08, n + 0.08]],
      attributionControl: false,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    map.current = m;
    (window as unknown as { __cascadeMap?: maplibregl.Map }).__cascadeMap = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '© OpenStreetMap contributors · OpenFreeMap' }), 'bottom-left');
    m.on('error', (ev) => console.warn('[map]', ev.error?.message ?? ev));

    m.on('load', () => {
      m.addSource('flood', { type: 'canvas', canvas: c, animate: true, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
      m.addLayer({ id: 'flood', type: 'raster', source: 'flood', paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });

      m.addSource('roads', { type: 'geojson', data: roadData(city, latest.current.a) });
      m.addLayer({
        id: 'roads-blocked', type: 'line', source: 'roads', filter: ['<', ['get', 'cap'], -1],
        paint: { 'line-color': P.signal, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.2, 16, 4], 'line-opacity': 0.9 },
      });

      m.addSource('deps', { type: 'geojson', data: depData(city, latest.current.edges), promoteId: 'i' });
      const depColor = ['case', ['boolean', ['feature-state', 'trace'], false], P.coral, ['boolean', ['feature-state', 'down'], false], mix(P.signal, P.dusk, 0.5),
        ['match', ['get', 'prov'], 'observed', mix(P.lagoon, P.ink, 0.3), 'user-set', P.amber, mix(P.dusk, P.ink, 0.15)]] as maplibregl.ExpressionSpecification;
      m.addLayer({
        id: 'deps', type: 'line', source: 'deps',
        paint: {
          'line-color': depColor,
          'line-width': ['case', ['boolean', ['feature-state', 'trace'], false], 3.5, ['boolean', ['feature-state', 'focus'], false], 1.8, 0.6],
          'line-opacity': ['case', ['boolean', ['feature-state', 'trace'], false], 1, ['boolean', ['feature-state', 'focus'], false], 0.9,
            ['boolean', ['feature-state', 'down'], false], 0.3, 0.16],
        },
      });
      m.addLayer({ id: 'deps-hit', type: 'line', source: 'deps', paint: { 'line-color': P.ink, 'line-width': 8, 'line-opacity': 0 } });

      m.addSource('nodes', { type: 'geojson', data: nodeData(city), promoteId: 'i' });
      const fill = ['match', ['coalesce', ['feature-state', 's'], 0], 1, P.signal, 2, P.amber, mix(P.lagoon, P.ink, 0.25)] as maplibregl.ExpressionSpecification;
      m.addLayer({
        id: 'wave', type: 'circle', source: 'nodes', filter: ['!=', ['get', 'k'], 'district'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'since'], -1], -1, 0, 0, 4, 3, 46],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': P.coral,
          'circle-stroke-width': 1.5,
          'circle-stroke-opacity': ['interpolate', ['linear'], ['coalesce', ['feature-state', 'since'], -1], -1, 0, 0, 0.9, 3, 0],
        },
      });
      m.addLayer({
        id: 'districts', type: 'circle', source: 'nodes', filter: ['==', ['get', 'k'], 'district'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 8, 15, 26],
          'circle-color': ['match', ['coalesce', ['feature-state', 's'], 0], 1, P.signal, 2, P.amber, P.lagoon],
          'circle-opacity': 0.14,
          'circle-stroke-width': 1,
          'circle-stroke-color': ['match', ['coalesce', ['feature-state', 's'], 0], 1, P.signal, 2, P.amber, P.lagoon],
          'circle-stroke-opacity': 0.5,
        },
      });
      m.addLayer({
        id: 'nodes', type: 'circle', source: 'nodes', filter: ['!=', ['get', 'k'], 'district'],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['*', SIZE, 3.2], 15, ['*', SIZE, 7]],
          'circle-color': fill,
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'sel'], false], 3, ['boolean', ['feature-state', 'trace'], false], 2.5, 1],
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'sel'], false], P.ink, ['boolean', ['feature-state', 'trace'], false], P.coral, P.cream],
        },
      });
      m.addLayer({
        id: 'node-letters', type: 'symbol', source: 'nodes', minzoom: 13.2, filter: ['!=', ['get', 'k'], 'district'],
        layout: { 'text-field': ['get', 'l'], 'text-font': ['Noto Sans Regular'], 'text-size': 9, 'text-allow-overlap': true },
        paint: { 'text-color': P.cream },
      });
      m.addLayer({
        id: 'node-names', type: 'symbol', source: 'nodes', minzoom: 14.5,
        filter: ['in', ['get', 'k'], ['literal', ['substation', 'hospital', 'water_works', 'bridge']]],
        layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-max-width': 10 },
        paint: { 'text-color': P.ink, 'text-halo-color': P.cream, 'text-halo-width': 1.6 },
      });

      m.addSource('marks', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'marks', type: 'circle', source: 'marks',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 9, 15, 16],
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-width': 2,
          'circle-stroke-color': ['match', ['get', 't'], 'failed', P.signal, P.lagoon],
        },
      });

      const pick = (ev: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => Number(ev.features?.[0]?.properties?.i);
      m.on('click', 'nodes', (ev) => { cb.current.onNode(pick(ev)); });
      m.on('click', 'districts', (ev) => {
        if (m.queryRenderedFeatures(ev.point, { layers: ['nodes'] }).length) return;
        cb.current.onNode(pick(ev));
      });
      m.on('click', 'deps-hit', (ev) => {
        if (m.queryRenderedFeatures(ev.point, { layers: ['nodes', 'districts'] }).length) return;
        const i = Number(ev.features?.[0]?.properties?.i);
        if (Number.isFinite(i)) cb.current.onEdge(i);
      });
      m.on('click', (ev) => {
        if (!m.queryRenderedFeatures(ev.point, { layers: ['nodes', 'districts', 'deps-hit'] }).length) cb.current.onNode(null);
      });
      for (const l of ['nodes', 'districts', 'deps-hit']) {
        m.on('mouseenter', l, () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', l, () => (m.getCanvas().style.cursor = ''));
      }

      ready.current = true;
      prev.current = { states: null, sel: -1, trace: new Set(), focus: new Set() };
      paint(m, latest.current, prev.current, c);
      onReady?.(m);
    });

    return () => {
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // A new city is a new map; everything else updates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city.key]);

  useEffect(() => {
    if (!map.current || !ready.current) return;
    (map.current.getSource('deps') as GeoJSONSource).setData(depData(city, edges));
    prev.current.states = null;
  }, [city, edges]);

  useEffect(() => {
    if (map.current && ready.current) (map.current.getSource('roads') as GeoJSONSource).setData(roadData(city, a));
  }, [city, a]);

  useEffect(() => {
    if (map.current && ready.current && canvas.current) paint(map.current, latest.current, prev.current, canvas.current);
  });

  return <div ref={holder} className="h-full w-full" role="application" aria-label={`Map of ${city.name} infrastructure and simulated flooding`} />;
}

function paint(m: maplibregl.Map, cur: { city: CityData; edges: Edge[]; view: MapView }, p: Prev, cv: HTMLCanvasElement) {
  const { view: v, edges: es, city: c } = cur;
  drawFlood(cv, c, v.stage);
  m.setFilter('roads-blocked', ['<', ['get', 'cap'], v.stage]);
  m.setLayoutProperty('deps', 'visibility', v.showDeps || v.traceEdges.size || v.focusEdges.size ? 'visible' : 'none');
  m.setFilter('deps', v.showDeps ? null : ['in', ['get', 'i'], ['literal', [...v.traceEdges, ...v.focusEdges]]]);

  if (v.states) {
    for (let i = 0; i < c.nodes.length; i++) {
      const since = v.since ? v.since[i] : -1;
      if (!p.states || p.states[i] !== v.states[i] || since >= 0) {
        m.setFeatureState({ source: 'nodes', id: i }, { s: v.states[i], since: since > 3 ? -1 : since });
      }
    }
    const idx = idIndex(c);
    es.forEach((e, j) => {
      const from = idx.get(e.from)!;
      if (!p.states || p.states[from] !== v.states![from]) m.setFeatureState({ source: 'deps', id: j }, { down: v.states![from] === 1 });
    });
    p.states = Uint8Array.from(v.states);
  }
  if (p.sel !== v.selected) {
    if (p.sel >= 0) m.setFeatureState({ source: 'nodes', id: p.sel }, { sel: false });
    if (v.selected >= 0) m.setFeatureState({ source: 'nodes', id: v.selected }, { sel: true });
    p.sel = v.selected;
  }
  if (!sameSet(p.trace, v.traceEdges)) {
    for (const j of p.trace) {
      m.setFeatureState({ source: 'deps', id: j }, { trace: false });
      for (const id of [es[j]?.from, es[j]?.to]) if (id) m.setFeatureState({ source: 'nodes', id: idIndex(c).get(id)! }, { trace: false });
    }
    for (const j of v.traceEdges) {
      m.setFeatureState({ source: 'deps', id: j }, { trace: true });
      for (const id of [es[j]?.from, es[j]?.to]) if (id) m.setFeatureState({ source: 'nodes', id: idIndex(c).get(id)! }, { trace: true });
    }
    p.trace = new Set(v.traceEdges);
  }
  if (!sameSet(p.focus, v.focusEdges)) {
    for (const j of p.focus) m.setFeatureState({ source: 'deps', id: j }, { focus: false });
    for (const j of v.focusEdges) m.setFeatureState({ source: 'deps', id: j }, { focus: true });
    p.focus = new Set(v.focusEdges);
  }
  const idx = idIndex(c);
  const marks = [...[...v.failed].map((id) => [id, 'failed']), ...[...v.planned].map((id) => [id, 'plan'])]
    .filter(([id]) => idx.has(id))
    .map(([id, t]) => {
      const nd = c.nodes[idx.get(id)!];
      return { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [nd.lng, nd.lat] }, properties: { t } };
    });
  (m.getSource('marks') as GeoJSONSource).setData({ type: 'FeatureCollection', features: marks });
}


const idCache = new WeakMap<CityData, Map<string, number>>();
function idIndex(c: CityData) {
  let m = idCache.get(c);
  if (!m) idCache.set(c, (m = new Map(c.nodes.map((n, i) => [n.id, i]))));
  return m;
}

function sameSet(a: Set<number>, b: Set<number>) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function nodeData(c: CityData): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: c.nodes.map((n, i) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: { i, k: n.kind, l: KIND[n.kind].letter, n: n.name },
    })),
  };
}

function depData(c: CityData, edges: Edge[]): GeoJSON.FeatureCollection {
  const idx = idIndex(c);
  return {
    type: 'FeatureCollection',
    features: edges.flatMap((e, i) => {
      const f = c.nodes[idx.get(e.from) ?? -1], t = c.nodes[idx.get(e.to) ?? -1];
      if (!f || !t) return [];
      return [{ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [[f.lng, f.lat], [t.lng, t.lat]] }, properties: { i, type: e.type, prov: e.provenance } }];
    }),
  };
}

/** Road segments with the stage at which each one becomes impassable. */
function roadData(c: CityData, a: Assumptions): GeoJSON.FeatureCollection {
  const idx = idIndex(c);
  return {
    type: 'FeatureCollection',
    features: c.road.e.map(([x, y, interior, bridge, flat]) => {
      const pass = a['road.passable'];
      const ends = Math.min(c.road.v[x][2], c.road.v[y][2]) + pass;
      let cap = Math.min(ends, interior === null ? Infinity : interior + pass);
      if (bridge && bridge !== 'flyover') cap = (c.nodes[idx.get(bridge) ?? -1]?.hand ?? 0) + a['bridge.clearance'];
      const coords: [number, number][] = [];
      for (let i = 0; i < flat.length; i += 2) coords.push([flat[i], flat[i + 1]]);
      return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { cap: Number.isFinite(cap) ? cap : 999 } };
    }),
  };
}

const WATER = rgbArray(mix(P.lagoon, P.cream, 0.15));
const DEEP = rgbArray(mix(P.lagoon, P.plum, 0.3));

function drawFlood(cv: HTMLCanvasElement, c: CityData, stage: number) {
  const ctx = cv.getContext('2d')!;
  const { nx, ny, h } = c.grid;
  const img = ctx.createImageData(nx, ny);
  for (let i = 0; i < nx * ny; i++) {
    const hand = h[i] / 10;
    const depth = stage - hand;
    if (h[i] === -32768 || depth <= 0) continue;
    const t = Math.min(1, depth / 3);
    const col = t > 0.5 ? DEEP : WATER;
    img.data[i * 4] = col[0];
    img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2];
    img.data[i * 4 + 3] = Math.round(110 + 110 * t);
  }
  ctx.putImageData(img, 0, 0);
}
