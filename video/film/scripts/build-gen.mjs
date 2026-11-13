// Writes the two data-driven scenes as static, editable HTML:
//   compositions/graph.html     the real Pune dependency subgraph (assets/graph.json)
//   compositions/captions.html  caption groups timed from the voiceover transcripts
// Usage: node scripts/build-gen.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { LINES } from './tts.mjs';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
mkdirSync(new URL('compositions/', root), { recursive: true });

// Absolute start of each voiceover line in the film (seconds). Shared with index.html.
export const VO = { l1: 0.8, l2: 3.0, l3: 5.8, l4: 13.9, l5: 25.0, l6: 34.2, l7: 40.6, l8: 52.7 };

const FONTS = `
    @font-face { font-family: 'Stack Sans Headline'; src: url('assets/fonts/stack-sans-headline-300.woff2') format('woff2'); font-weight: 300; }
    @font-face { font-family: 'Stack Sans Text'; src: url('assets/fonts/stack-sans-text.woff2') format('woff2'); font-weight: 400 500; }`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const r1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- graph
{
  const g = read('assets/graph.json');
  const T = (abs) => r1(abs - 13.4); // scene-local time
  const hub = { x: 780, y: 600 };
  const pos = (rx, ry, deg) => ({ x: hub.x + rx * Math.cos((deg * Math.PI) / 180), y: hub.y + ry * Math.sin((deg * Math.PI) / 180) });
  // Explicit layout: the link the voiceover points at runs flat to the right, into the
  // water works and on to its towers; the hub's other dependants sit around it.
  const focusSrc = g.ring1.find((n) => n.kind === 'Water works') ?? g.ring1[0];
  const others = g.ring1.filter((n) => n !== focusSrc).slice(0, 5);
  const ring1 = [
    { ...focusSrc, x: 1160, y: 600 },
    ...others.map((n, i) => { const deg = [-60, -120, 180, 120, 60][i]; return { ...n, ...pos(300, 210, deg) }; }),
  ];
  const towers = g.ring2.filter((c) => c.parent === focusSrc.id).slice(0, 3);
  const ring2 = towers.map((c, k) => ({ ...c, from: ring1[0], x: 1470, y: 470 + k * 130 }));
  const curve = (a, b, bend) => {
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    const c = { x: mx - (dy / len) * bend, y: my + (dx / len) * bend };
    let L = 0, px = a.x, py = a.y;
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const x = (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x;
      const y = (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y;
      L += Math.hypot(x - px, y - py); px = x; py = y;
    }
    return { d: `M${r1(a.x)} ${r1(a.y)} Q${r1(c.x)} ${r1(c.y)} ${r1(b.x)} ${r1(b.y)}`, len: Math.ceil(L) };
  };
  // The one inferred link the voiceover points at.
  const focus = ring1[0];

  const edges = [], nodes = [], tweens = [];
  ring1.forEach((n, i) => {
    const c = curve(hub, n, 40);
    const t = T(14.3 + i * 0.22);
    edges.push(`<path id="g-e1-${i}" class="edge${n === focus ? ' focus' : ''}" d="${c.d}" style="stroke-dasharray:${c.len};stroke-dashoffset:${c.len}" />`);
    tweens.push(`tl.fromTo('#g-e1-${i}', { strokeDashoffset: ${c.len} }, { strokeDashoffset: 0, duration: 0.7, ease: 'expo.out' }, ${t});`);
    tweens.push(`tl.fromTo('#g-n1-${i}', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power4.out' }, ${r1(t + 0.35)});`);
    const left = n.x < hub.x;
    nodes.push(`<div id="g-n1-${i}" class="node ${left ? 'left' : ''}" style="left:${r1(n.x)}px;top:${r1(n.y)}px"><span class="dot"></span><span class="label"><b>${esc(n.name)}</b><i>${esc(n.kind)}</i></span></div>`);
  });
  ring2.forEach((n, i) => {
    const c = curve(n.from, n, 26);
    const t = T(17.3 + i * 0.5);
    edges.push(`<path id="g-e2-${i}" class="edge thin" d="${c.d}" style="stroke-dasharray:${c.len};stroke-dashoffset:${c.len}" />`);
    tweens.push(`tl.fromTo('#g-e2-${i}', { strokeDashoffset: ${c.len} }, { strokeDashoffset: 0, duration: 0.6, ease: 'expo.out' }, ${t});`);
    tweens.push(`tl.fromTo('#g-n2-${i}', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'power4.out' }, ${r1(t + 0.3)});`);
    const left = n.x < hub.x;
    nodes.push(`<div id="g-n2-${i}" class="node small ${left ? 'left' : ''}" style="left:${r1(n.x)}px;top:${r1(n.y)}px"><span class="dot"></span><span class="label"><b>${esc(n.name)}</b><i>${esc(n.kind)}</i></span></div>`);
  });
  const fc = curve(hub, focus, 40);
  // Tag sits out along the highlighted edge, clear of the hub's own label.
  const mid = { x: hub.x + (focus.x - hub.x) * 0.5, y: hub.y - 30 };

  const html = `<template>
  <style>${FONTS}
    #graph { position: absolute; inset: 0; background: var(--cream, #FFF4E8); font-family: 'Stack Sans Text', sans-serif; color: #1A0A22; }
    #graph-flash { position: absolute; inset: 0; background: #FFF4E8; filter: brightness(1.04); }
    #graph-title { position: absolute; left: 192px; top: 120px; font-family: 'Stack Sans Headline', sans-serif; font-weight: 300; font-size: 54px; letter-spacing: -0.02em; line-height: 1.05; }
    #graph-sub { position: absolute; left: 192px; top: 190px; font-size: 28px; color: rgba(26,10,34,0.75); }
    #graph svg { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: visible; }
    .edge { fill: none; stroke: #B83A7A; stroke-width: 2.4; stroke-linecap: round; opacity: 0.75; }
    .edge.thin { stroke-width: 1.6; opacity: 0.6; }
    #g-hub { position: absolute; left: ${hub.x}px; top: ${hub.y}px; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; background: #FF6B5B; box-shadow: 0 0 0 10px rgba(255,107,91,0.18), 0 0 0 22px rgba(255,107,91,0.08); }
    #g-hub-label { position: absolute; left: ${hub.x - 200}px; width: 400px; top: ${hub.y + 34}px; text-align: center; font-size: 28px; font-weight: 500; padding: 4px 10px; border-radius: 12px; background: rgba(255,244,232,0.9); }
    #g-hub-label i { display: block; font-style: normal; font-weight: 400; font-size: 22px; color: rgba(26,10,34,0.7); }
    .node { position: absolute; width: 0; height: 0; }
    .node .dot { position: absolute; left: -9px; top: -9px; width: 18px; height: 18px; border-radius: 50%; background: #1A0A22; box-shadow: 0 0 0 4px #FFF4E8; }
    .node.small .dot { left: -6px; top: -6px; width: 12px; height: 12px; background: #3B1450; }
    .node .label { position: absolute; left: 18px; top: -16px; width: 290px; font-size: 24px; line-height: 1.12; }
    .node.small .label { font-size: 20px; width: 240px; }
    .node.left .label { left: auto; right: 16px; text-align: right; }
    .node .label b { font-weight: 500; display: block; }
    .node .label i { font-style: normal; color: rgba(26,10,34,0.7); font-size: 0.85em; }
    #g-focus { fill: none; stroke: #FFB020; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 10 12; opacity: 0; }
    #g-tag { position: absolute; left: ${r1(mid.x)}px; top: ${r1(mid.y)}px; transform: translate(-50%, -150%); padding: 10px 18px; border-radius: 999px; background: #FFB020; font-size: 22px; font-weight: 500; white-space: nowrap; }
  </style>
  <div id="graph" data-composition-id="graph" data-width="1920" data-height="1080" data-layout-allow-overlap>
    <h2 id="graph-title">One substation in Pune, and what it feeds</h2>
    <p id="graph-sub">${ring1.length + ring2.length} dependencies, all inferred from OpenStreetMap. Simulated scenario data.</p>
    <svg viewBox="0 0 1920 1080" aria-hidden="true">
      ${edges.join('\n      ')}
      <path id="g-focus" d="${fc.d}" />
    </svg>
    <div id="g-hub"></div>
    <div id="g-hub-label">${esc(g.hub.name)}<i>${esc(g.hub.kind)}</i></div>
    ${nodes.join('\n    ')}
    <div id="g-tag">inferred · confidence ${focus.confidence.toFixed(2)}</div>
    <div id="graph-flash"></div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    tl.fromTo('#graph-flash', { opacity: 1 }, { opacity: 0, duration: 0.35, ease: 'power2.out' }, 0);
    tl.fromTo('#graph-title', { opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power4.out' }, ${T(13.9)});
    tl.fromTo('#graph-sub', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' }, ${T(14.4)});
    tl.fromTo('#g-hub', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'power4.out' }, ${T(13.95)});
    tl.fromTo('#g-hub-label', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power4.out' }, ${T(14.1)});
    ${tweens.join('\n    ')}
    tl.to('.edge:not(.focus)', { opacity: 0.25, duration: 0.4, ease: 'power2.out' }, ${T(21.4)});
    tl.fromTo('#g-focus', { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power2.out' }, ${T(21.45)});
    tl.fromTo('#g-tag', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power4.out' }, ${T(21.75)});
    window.__timelines['graph'] = tl;
  </script>
</template>
`;
  writeFileSync(new URL('compositions/graph.html', root), html);
  console.log(`graph.html: ${ring1.length} + ${ring2.length} nodes`);
}

// ---------------------------------------------------------------- captions
{
  const words = [];
  for (const [id, start] of Object.entries(VO)) {
    const j = read(`assets/vo/${id}.words.json`);
    let w = (Array.isArray(j) ? j : j.words).map((x) => ({ ...x }));
    // Transcription spells some words differently from the script; the script wins.
    const script = LINES[id].replace(/thirty-two/g, 'thirty-two').split(/\s+/);
    if (w.length === script.length + 1) {
      const k = script.findIndex((s) => s.includes('-'));
      if (k >= 0) w.splice(k, 2, { text: script[k], start: w[k].start, end: w[k + 1].end });
    }
    if (w.length !== script.length) throw new Error(`${id}: ${w.length} heard vs ${script.length} written`);
    w.forEach((x, k) => words.push({ text: script[k], start: r1(start + x.start), end: r1(start + x.end), line: id }));
  }
  // Groups of up to 5 words, broken at sentence ends and pauses.
  const groups = [];
  let cur = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || cur.length >= 5 || /[.!?]$/.test(w.text) || next.start - w.end >= 0.15 || next.line !== w.line) { groups.push(cur); cur = []; }
  });
  const timed = groups.map((g, i) => {
    const s = Math.max(0.15, r1(g[0].start - 0.05));
    const e = r1(Math.max(g[g.length - 1].end + 0.25, s + 0.6));
    return { g, s, end: groups[i + 1] ? Math.min(e, r1(groups[i + 1][0].start - 0.05)) : e };
  });
  const els = [], tw = [];
  // The hook's two lines are already set as the giant on-screen type; they stay in the VTT only.
  timed.filter(({ g }) => g[0].line !== 'l1' && g[0].line !== 'l2').forEach(({ g, s, end }, i) => {
    els.push(`<div id="cap-${i}" class="cap"><span>${esc(g.map((w) => w.text).join(' '))}</span></div>`);
    tw.push(`tl.fromTo('#cap-${i}', { opacity: 0 }, { opacity: 1, duration: 0.12, ease: 'power2.out' }, ${s});`);
    tw.push(`tl.to('#cap-${i}', { opacity: 0, duration: 0.1, ease: 'power2.in' }, ${r1(end - 0.1)});`);
    tw.push(`tl.set('#cap-${i}', { opacity: 0, visibility: 'hidden' }, ${end});`);
  });
  const html = `<template>
  <style>${FONTS}
    #captions { position: absolute; inset: 0; pointer-events: none; }
    .cap { position: absolute; left: 0; right: 0; bottom: 92px; text-align: center; opacity: 0; overflow: visible; }
    .cap span { display: inline-block; max-width: 1500px; padding: 10px 22px 12px; border-radius: 14px; background: rgba(255,244,232,0.88); color: #1A0A22; font-family: 'Stack Sans Text', sans-serif; font-weight: 500; font-size: 40px; line-height: 1.2; }
  </style>
  <div id="captions" data-composition-id="captions" data-width="1920" data-height="1080" data-layout-allow-caption-zone>
    ${els.join('\n    ')}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${tw.join('\n    ')}
    window.__timelines['captions'] = tl;
  </script>
</template>
`;
  writeFileSync(new URL('compositions/captions.html', root), html);
  // WebVTT for the dashboard player.
  const ts = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `00:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`; };
  const vtt = ['WEBVTT', '', ...timed.flatMap(({ g, s, end }, i) => [String(i + 1), `${ts(s)} --> ${ts(end)}`, g.map((w) => w.text).join(' '), ''])].join('\n');
  writeFileSync(new URL('assets/captions.vtt', root), vtt);
  console.log(`captions.html: ${groups.length} groups from ${words.length} words`);
}
