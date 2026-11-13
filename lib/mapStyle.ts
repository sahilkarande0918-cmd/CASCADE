import type { StyleSpecification } from 'maplibre-gl';
import { mix, P } from './palette';

// A quiet, warm, light basemap from OpenFreeMap (free, keyless), so the
// cascade drawn on top is the only loud thing on screen.
const PAPER = mix(P.cream, P.peach, 0.3);
const WATER = mix(P.lagoon, P.cream, 0.6);
const GREEN = mix(P.peach, P.lagoon, 0.14);
const BUILDING = mix(P.peach, P.dusk, 0.12);
const ROAD = P.cream;
const ROAD_MAJOR = mix(P.cream, P.ember, 0.18);
const LABEL = mix(P.ink, P.cream, 0.42);

export function mapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: { omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: '' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': PAPER } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', paint: { 'fill-color': GREEN, 'fill-opacity': 0.6 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': GREEN, 'fill-opacity': 0.6 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': WATER } },
      {
        id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway',
        paint: { 'line-color': WATER, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 16, 4] },
      },
      { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': BUILDING, 'fill-opacity': 0.8 } },
      {
        id: 'road-minor', type: 'line', source: 'omt', 'source-layer': 'transportation', minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        paint: { 'line-color': ROAD, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 18, 4] },
      },
      {
        id: 'road-major', type: 'line', source: 'omt', 'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
        paint: { 'line-color': ROAD_MAJOR, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 18, 8] },
      },
      {
        id: 'place-label', type: 'symbol', source: 'omt', 'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'suburb', 'neighbourhood']]],
        layout: {
          'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 10, 15, 13], 'text-letter-spacing': 0.08, 'text-max-width': 8,
        },
        paint: { 'text-color': LABEL, 'text-halo-color': PAPER, 'text-halo-width': 1.2 },
      },
    ],
  };
}
