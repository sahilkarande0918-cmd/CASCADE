import type { NextRequest } from 'next/server';
import { CITIES, isCityKey } from '@/lib/cities';

// Live hazard seed from Open-Meteo (free, keyless): 72-hour rainfall and the
// GloFAS river discharge forecast against its own 30-day mean. The client turns
// the discharge ratio into a stage with an editable assumption; this route only
// reports what the services said.

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('city');
  if (!isCityKey(key)) return Response.json({ error: 'unknown city' }, { status: 400 });
  const [lng, lat] = CITIES[key].center;
  const q = `latitude=${lat}&longitude=${lng}`;
  try {
    const [flood, rain] = await Promise.all([
      getJson(`https://flood-api.open-meteo.com/v1/flood?${q}&daily=river_discharge&past_days=30&forecast_days=7`),
      getJson(`https://api.open-meteo.com/v1/forecast?${q}&hourly=precipitation&forecast_days=3&timezone=auto`),
    ]);
    const days: string[] = flood.daily?.time ?? [];
    const q3: (number | null)[] = flood.daily?.river_discharge ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const past = q3.filter((v, i) => days[i] < today && v != null) as number[];
    const next = q3.filter((v, i) => days[i] >= today && days[i] <= addDays(today, 3) && v != null) as number[];
    const pastMean = past.length ? past.reduce((s, v) => s + v, 0) / past.length : null;
    const peak = next.length ? Math.max(...next) : null;
    const rain72 = ((rain.hourly?.precipitation ?? []) as (number | null)[]).reduce<number>((s, v) => s + (v ?? 0), 0);
    return Response.json(
      {
        city: key,
        rain72mm: round(rain72),
        dischargePeak: peak === null ? null : round(peak),
        dischargeMean30: pastMean === null ? null : round(pastMean),
        ratio: peak !== null && pastMean ? round(peak / pastMean) : null,
        source: 'Open-Meteo forecast API and Flood API (GloFAS)',
        fetchedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    );
  } catch (err) {
    return Response.json({ error: `forecast unavailable: ${err instanceof Error ? err.message : 'unknown'}` }, { status: 502 });
  }
}

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}
const round = (x: number) => Math.round(x * 100) / 100;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
