'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Lets the `.rise` children of a block arrive in reading order, once, as it scrolls in. */
export default function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.classList.add('js');
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.querySelectorAll<HTMLElement>('.rise'));
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      kids.forEach((k, i) => { k.style.transitionDelay = `${i * 80}ms`; k.dataset.in = ''; });
      io.disconnect();
    }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
