'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import NavPill from '@/components/NavPill';
import Sky from '@/components/Sky';
import { hhmm } from '@/lib/labels';
import type { ModelStatus } from './CityModel';

const CityModel = dynamic(() => import('./CityModel'), { ssr: false });

export default function Hero() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  return (
    <header className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
      <Sky />
      <div className="relative z-20 px-4 pt-4 sm:px-6">
        <NavPill />
      </div>

      <div className="pointer-events-none relative z-10 mx-auto mt-[5vh] flex max-w-4xl flex-col items-center px-5 text-center [&_a]:pointer-events-auto">
        <p className="rise inline-flex items-center gap-2 rounded-full bg-cream/70 px-3 py-1 text-[14px] backdrop-blur" data-in>
          <span className="size-2 rounded-full bg-amber" aria-hidden />
          Open map data, simulated scenarios
        </p>
        <h1 className="mt-5 text-[clamp(2.1rem,6.4vw,5.6rem)] text-ink">
          Watch a city fail.<br />Then plan around it.
        </h1>
        <p className="mt-5 max-w-xl text-[clamp(1.0625rem,1rem+0.25vw,1.1875rem)] text-ink/75">
          Fail one substation, pump or bridge and watch the outage travel through power, water, roads and comms, hour by hour, for 72 hours.
        </p>
        <Link href="/dashboard" className="group mt-7 inline-flex items-center gap-2 rounded-full bg-amber px-6 py-3 text-[16px] font-medium text-ink transition hover:bg-ember active:scale-[0.97]">
          Break a city
          <span className="grid size-6 place-items-center rounded-full bg-ink/10 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden>↗</span>
        </Link>
      </div>

      <div className="absolute inset-0 z-0">
        <CityModel onStatus={setStatus} />
        <noscript>
          <p className="text-center text-muted">The 3D model needs JavaScript. The simulator itself is at /dashboard.</p>
        </noscript>
      </div>

      <div className="relative z-10 mt-auto mb-6 flex justify-center px-4">
        <p className="tabular rounded-full bg-cream/80 px-4 py-2 text-center text-[14px] text-ink/80 backdrop-blur" aria-live="polite">
          {status ? (
            <>
              Pune, simulated 2 m flood · T+{hhmm(status.hours)} · river {status.stage.toFixed(1)} m ·{' '}
              <span className="text-signal-ink">{status.down} facilities down</span>
              {status.failed ? <> · failed by you: {status.failed}</> : <> · click an orb to fail it</>}
            </>
          ) : 'Loading Pune…'}
        </p>
      </div>
    </header>
  );
}
