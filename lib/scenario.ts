// Scenario state, round-tripped through the URL hash so any view can be shared.
// The hash is untrusted input: everything is validated and clamped on the way in.

import { ASSUMPTION_META, type AssumptionKey, type Assumptions, DEFAULT_ASSUMPTIONS } from './assumptions';
import { CITIES, type CityKey, isCityKey } from './cities';
import type { EdgeOverride, Intervention, InterventionKind } from './engine/types';

export type AppState = {
  city: CityKey;
  stage: number;
  failed: string[];
  plans: Intervention[][];
  /** Plan shown on the map, or -1 for the baseline. */
  view: number;
  overrides: Record<string, EdgeOverride>;
  /** Only the assumptions the user changed. */
  a: Partial<Assumptions>;
};

export const MAX_STAGE = 10;
const KINDS: InterventionKind[] = ['generator', 'harden', 'bridge', 'mobile_substation'];
const ID = /^[a-z]{2}\d{1,15}$|^bw\d{1,15}$/;

export const initialState = (city: CityKey = 'pune'): AppState => ({
  city, stage: CITIES[city].stage, failed: [], plans: [[], [], []], view: -1, overrides: {}, a: {},
});

export const assumptionsOf = (s: AppState): Assumptions => ({ ...DEFAULT_ASSUMPTIONS, ...s.a });

export function encode(s: AppState): string {
  const plans = s.plans.map((p) => p.map((i) => [i.kind, i.node]));
  const json = JSON.stringify({ c: s.city, s: s.stage, f: s.failed, p: plans, v: s.view, o: s.overrides, a: s.a });
  return btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(hash: string): AppState | null {
  try {
    const bin = atob(hash.replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/'));
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
    if (!raw || !isCityKey(raw.c)) return null;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && ID.test(v)).slice(0, 50) : []);
    const plans: Intervention[][] = [0, 1, 2].map((i) => {
      const p = Array.isArray(raw.p?.[i]) ? raw.p[i] : [];
      return p
        .filter((x: unknown): x is [InterventionKind, string] =>
          Array.isArray(x) && KINDS.includes(x[0]) && typeof x[1] === 'string' && ID.test(x[1]))
        .slice(0, 10)
        .map(([kind, node]: [InterventionKind, string]) => ({ kind, node }));
    });
    const overrides: Record<string, EdgeOverride> = {};
    for (const [k, v] of Object.entries(raw.o ?? {}).slice(0, 200)) {
      if (!/^(power|water|access|comms):[a-z0-9]+>[a-z0-9]+$/.test(k) || typeof v !== 'object' || !v) continue;
      const o = v as Record<string, unknown>;
      overrides[k] = {
        ...(o.removed === true ? { removed: true } : {}),
        ...(typeof o.confidence === 'number' ? { confidence: clamp(o.confidence, 0, 1) } : {}),
      };
    }
    const a: Partial<Assumptions> = {};
    for (const [k, v] of Object.entries(raw.a ?? {})) {
      if (k in ASSUMPTION_META && typeof v === 'number' && Number.isFinite(v)) a[k as AssumptionKey] = clamp(v, 0, 1e6);
    }
    const view = Number.isInteger(raw.v) && raw.v >= -1 && raw.v <= 2 ? raw.v : -1;
    return {
      city: raw.c, stage: clamp(Number(raw.s) || 0, 0, MAX_STAGE), failed: ids(raw.f), plans, view, overrides, a,
    };
  } catch {
    return null;
  }
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
