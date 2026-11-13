// The pre-baked cities. Data lives in public/data/<key>.json (scripts/build-city.ts).
export const CITIES = {
  pune: { name: 'Pune', country: 'India', center: [73.8567, 18.5204] as [number, number], stage: 2 },
  chennai: { name: 'Chennai', country: 'India', center: [80.255, 13.035] as [number, number], stage: 2.5 },
  valencia: { name: 'Valencia', country: 'Spain', center: [-0.375, 39.455] as [number, number], stage: 1.5 },
};
export type CityKey = keyof typeof CITIES;
export const isCityKey = (k: unknown): k is CityKey => typeof k === 'string' && k in CITIES;
