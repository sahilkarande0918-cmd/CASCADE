'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

// Smooth scrolling plus a light parallax: any element with data-speed moves by
// speed × scroll, transform only, in one rAF loop. Off for reduced motion.
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-speed]'));
    els.forEach((el) => (el.style.willChange = 'transform'));
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      const y = lenis.scroll;
      for (const el of els) el.style.transform = `translate3d(0, ${(y * Number(el.dataset.speed)).toFixed(1)}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return null;
}
