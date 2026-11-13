'use client';

import { useState } from 'react';
import facts from '@/lib/landing-facts.json';
import { hhmm } from '@/lib/labels';

// The engine's own output for Pune at a 2 m flood, set as a board. Click a
// row to see the chain that brought it down.
export default function Board() {
  const [open, setOpen] = useState(Math.min(6, facts.board.length - 1));
  return (
    <ol className="flex flex-col gap-1" data-ui>
      {facts.board.map((r, i) => {
        const isOpen = i === open;
        const knock = r.how !== 'Floods';
        return (
          <li key={r.name}>
            <button
              onClick={() => setOpen(i)}
              aria-expanded={isOpen}
              className={`grid w-full grid-cols-[1fr_auto] items-center gap-4 rounded-2xl px-5 text-left transition-colors md:grid-cols-[2.2fr_1fr_1fr_auto] ${
                isOpen ? 'bg-ink py-6 text-cream' : 'bg-cream/70 py-4 hover:bg-cream'
              }`}
            >
              <span className={isOpen ? 'text-[22px]' : 'text-[18px]'}>{r.name}</span>
              <span className={`hidden md:block ${isOpen ? 'text-cream/70' : 'text-muted'}`}>{r.kind}</span>
              <span className={`tabular hidden md:block ${isOpen ? 'text-cream/70' : 'text-muted'}`}>T+{hhmm(r.ttf)}</span>
              <span className={`rounded-full px-3 py-1 text-[14px] font-medium text-ink ${knock ? 'bg-amber' : 'bg-lagoon'}`}>
                {knock ? r.how : 'Floods'}
              </span>
              {isOpen && (
                <span className="col-span-full text-[16px] text-cream/80">
                  {r.path.length > 1
                    ? <>Chain: {r.path.join(' → ')}. It fails at T+{hhmm(r.ttf)} once its backup runs out.</>
                    : <>Its ground sits low enough that a 2 m river reaches it by T+{hhmm(r.ttf)}.</>}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
