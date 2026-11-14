// Generates the whole YouTube explainer as HyperFrames compositions.
// Timing comes from the speakers' transcripts, so graphics land on the words.
// Usage: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
mkdirSync(new URL('compositions/', root), { recursive: true });

// ---------------------------------------------------------------- timing
const SAHIL_AT = 4.0; // Sahil's clip starts here on the timeline
const PRANAV_AT = 141.8; // Pranav's clip starts here
const TOTAL = 312;
const words = { sahil: read('assets/speakers/sahil.words.json'), pranav: read('assets/speakers/pranav.words.json') };
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Absolute time of the first occurrence of `word` in a speaker's clip at or after local `after`. */
function at(who, word, after = 0) {
  const w = words[who].find((x) => x.start >= after - 0.01 && norm(x.text).startsWith(norm(word)));
  if (!w) { console.warn(`MISS ${who}: "${word}" after ${after}`); return (who === 'sahil' ? SAHIL_AT : PRANAV_AT) + after; }
  return (who === 'sahil' ? SAHIL_AT : PRANAV_AT) + w.start;
}
const S = (t) => SAHIL_AT + t;
const P = (t) => PRANAV_AT + t;
const r2 = (x) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- shared look
const C = { ink: '#1A0A22', cream: '#FFF4E8', peach: '#FFD3AE', coral: '#FF6B5B', ember: '#FF9A5A', amber: '#FFB020', lagoon: '#2EC4B6', signal: '#FF4B2B', dusk: '#B83A7A', plum: '#3B1450' };
const BASE_CSS = `
  @font-face { font-family: 'Stack Sans Headline'; src: url('assets/fonts/stack-sans-headline-300.woff2') format('woff2'); font-weight: 300; }
  @font-face { font-family: 'Stack Sans Text'; src: url('assets/fonts/stack-sans-text.woff2') format('woff2'); font-weight: 400 500; }
  .stage { position: absolute; inset: 0; }
  .cream { background: ${C.cream}; }
  .media { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; object-fit: cover; }
  .push { position: absolute; inset: 0; }
  .veil { position: absolute; inset: 0; background: rgba(26,10,34,0.42); }
  .veil.soft { background: rgba(26,10,34,0.25); }
  .flash { position: absolute; inset: 0; background: #FFFFFF; pointer-events: none; }
  .kin { position: absolute; left: 160px; right: 160px; font-family: 'Stack Sans Headline', sans-serif; font-weight: 300; letter-spacing: -0.03em; line-height: 1.02; }
  .kin.center { text-align: center; }
  .kin .w { display: inline-block; margin-right: 0.22em; }
  .kin.light { color: ${C.cream}; }
  .acc { color: ${C.dusk}; }
  .kin.light .acc { color: ${C.ember}; }
  .eyebrow { position: absolute; left: 160px; top: 120px; padding: 10px 20px; border-radius: 999px; background: ${C.amber}; font-size: 28px; font-weight: 500; }
  .chip { position: absolute; padding: 16px 28px; border-radius: 999px; background: ${C.peach}; font-size: 34px; font-weight: 500; white-space: nowrap; }
  .chip.amber { background: ${C.amber}; }
  .chip.lagoon { background: ${C.lagoon}; }
  .chip.signal { background: ${C.signal}; color: ${C.cream}; }
  .chip.glass { background: rgba(255,244,232,0.9); }
  .card { position: absolute; border-radius: 28px; background: ${C.cream}; box-shadow: 0 40px 90px -40px rgba(26,10,34,0.55); }
  .lt { position: absolute; left: 780px; top: 48px; padding: 18px 30px; border-radius: 22px; background: rgba(255,244,232,0.95); box-shadow: 0 24px 60px -30px rgba(26,10,34,0.6); font-size: 34px; font-weight: 500; white-space: nowrap; }
  .lt small { display: block; font-size: 24px; font-weight: 400; color: rgba(26,10,34,0.72); }
  .live { position: absolute; left: 64px; top: 56px; display: flex; align-items: center; gap: 12px; padding: 12px 22px; border-radius: 999px; background: ${C.signal}; color: ${C.cream}; font-size: 26px; font-weight: 500; }
  .live i { width: 14px; height: 14px; border-radius: 50%; background: ${C.cream}; display: inline-block; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .num { font-family: 'Stack Sans Headline', sans-serif; font-weight: 300; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }`;

// ---------------------------------------------------------------- scene builder
const scenes = [];
function scene(id, start, end, { ground = 'cream', enter = 'cut' } = {}) {
  const s = { id, start, end, html: [], tl: [], css: [], ground, enter, n: 0 };
  const L = (abs) => r2(Math.max(0, abs - start)); // scene-local time
  const uid = (p) => `${id}-${p}${s.n++}`;
  const api = {
    L, uid,
    css: (x) => s.css.push(x),
    add: (h) => s.html.push(h),
    tween: (t) => s.tl.push(t),
    /** Full-bleed footage between two absolute times, from `mediaStart` into the file. */
    footage(src, from, to, mediaStart = 0, { veil = 'veil', push = 0.05 } = {}) {
      const v = uid('v'), w = uid('p');
      s.html.push(`<div class="push" id="${w}"><video id="${v}" class="clip media" src="assets/${src}" data-start="${L(from)}" data-duration="${r2(to - from)}" data-media-start="${mediaStart}" data-track-index="0" muted playsinline></video></div>${veil ? `<div class="${veil}" id="${uid('veil')}"></div>` : ''}`);
      s.tl.push(`tl.fromTo('#${w}', { scale: 1 }, { scale: ${1 + push}, duration: ${r2(to - from)}, ease: 'none' }, ${L(from)});`);
    },
    /** A headline whose words appear on given absolute times. Mark the accent word with *star*. */
    words(text, times, { top = 420, size = 104, cls = '', light = false, center = false, out = null } = {}) {
      const box = uid('k');
      const parts = text.split(' ');
      const spans = parts.map((p, i) => `<span class="w${p.startsWith('*') ? ' acc' : ''}" id="${box}-${i}">${p.replace(/\*/g, '')}</span>`).join(' ');
      s.html.push(`<div class="kin ${light ? 'light' : ''} ${center ? 'center' : ''} ${cls}" id="${box}" style="top:${top}px;font-size:${size}px">${spans}</div>`);
      parts.forEach((_, i) => {
        const t = times[Math.min(i, times.length - 1)];
        s.tl.push(`tl.fromTo('#${box}-${i}', { opacity: 0, filter: 'blur(10px)', y: 14 }, { opacity: 1, filter: 'blur(0px)', y: 0, duration: 0.22, ease: 'power4.out' }, ${L(t)});`);
      });
      if (out !== null) s.tl.push(`tl.to('#${box}', { opacity: 0, filter: 'blur(8px)', duration: 0.18, ease: 'power3.in' }, ${L(out)});`);
      return box;
    },
    /** A pill that lands at an absolute time. */
    chip(text, t, x, y, cls = '', out = null) {
      const c = uid('c');
      s.html.push(`<div class="chip ${cls}" id="${c}" style="left:${x}px;top:${y}px">${text}</div>`);
      s.tl.push(`tl.fromTo('#${c}', { opacity: 0, scale: 0.7, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 0.35, ease: 'expo.out' }, ${L(t)});`);
      if (out !== null) s.tl.push(`tl.to('#${c}', { opacity: 0, y: -16, duration: 0.2, ease: 'power3.in' }, ${L(out)});`);
      return c;
    },
    /** Lower third on demo footage, between two absolute times. */
    lt(title, sub, from, to) {
      const c = uid('lt');
      s.html.push(`<div class="lt" id="${c}">${title}${sub ? `<small>${sub}</small>` : ''}</div>`);
      s.tl.push(`tl.fromTo('#${c}', { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.35, ease: 'expo.out' }, ${L(from)});`);
      s.tl.push(`tl.to('#${c}', { opacity: 0, x: -30, duration: 0.2, ease: 'power3.in' }, ${L(to) - 0.2});`);
      s.tl.push(`tl.set('#${c}', { visibility: 'hidden' }, ${L(to)});`);
    },
    /** Count from 0 to `to` between two absolute times. */
    count(sel, to, from, until, fmt = 'n') {
      const v = uid('n');
      s.tl.push(`const ${v.replace(/-/g, '_')} = { v: 0 }; tl.fromTo(${v.replace(/-/g, '_')}, { v: 0 }, { v: ${to}, duration: ${r2(until - from)}, ease: 'power3.out', onUpdate: () => { document.querySelector('${sel}').textContent = ${fmt === 'n' ? `Math.round(${v.replace(/-/g, '_')}.v).toLocaleString('en-US')` : fmt.replace('$', `Math.round(${v.replace(/-/g, '_')}.v)`)}; } }, ${L(from)});`);
    },
    flashAt(t) {
      const f = uid('f');
      s.html.push(`<div class="flash" id="${f}" style="opacity:0"></div>`);
      s.tl.push(`tl.set('#${f}', { opacity: 0.95 }, ${L(t)}); tl.to('#${f}', { opacity: 0, duration: 0.3, ease: 'power2.out' }, ${L(t) + 0.01});`);
    },
  };
  scenes.push(s);
  return api;
}

// ================================================================= THE FILM
// ---- Cold open (0 to 4)
{
  const k = scene('intro', 0, SAHIL_AT, { ground: 'ink' });
  k.footage('footage/lightning.mp4', 0, SAHIL_AT, 3);
  k.css(`#intro-mark { position:absolute; left:0; right:0; top:390px; text-align:center; font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:190px; letter-spacing:-0.05em; color:${C.cream}; }
  #intro-sub { position:absolute; left:0; right:0; top:610px; text-align:center; font-size:40px; color:${C.cream}; opacity:0.9; }`);
  k.add(`<div id="intro-mark">Cascade</div><div id="intro-sub">How one failure spreads through a city</div>`);
  k.tween(`tl.fromTo('#intro-mark', { opacity: 0, scale: 1.25, filter: 'blur(14px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out' }, 0.3);`);
  k.tween(`tl.fromTo('#intro-sub', { opacity: 0, y: 16 }, { opacity: 0.9, y: 0, duration: 0.5, ease: 'power4.out' }, 1.2);`);
  k.tween(`tl.to('#intro-mark, #intro-sub', { opacity: 0, filter: 'blur(10px)', duration: 0.25, ease: 'power3.in' }, 3.65);`);
}

// ---- Sahil: the problem (4 to 17.2): a flood, and the chain it sets off
{
  const k = scene('chain', SAHIL_AT, S(13.2), { ground: 'ink', enter: 'flash' });
  k.footage('footage/leine.mp4', SAHIL_AT, S(6.4), 9.4);
  k.footage('footage/garonne.mp4', S(6.4), S(13.2), 4, { veil: 'veil' });
  k.words('Nothing fails *alone.', [at('sahil', 'when'), at('sahil', 'nothing'), at('sahil', 'fails')], { top: 200, size: 112, light: true });
  k.css(`.node { position:absolute; top:640px; padding:20px 30px; border-radius:20px; background:rgba(255,244,232,0.94); font-size:34px; font-weight:500; white-space:nowrap; }
  .arrow { position:absolute; top:676px; height:4px; background:${C.coral}; transform-origin:left center; }`);
  const steps = [['Substation', at('sahil', 'flooded', 3)], ['Pumping station', at('sahil', 'pumping', 3)], ['Water tower', at('sahil', 'water', 6)], ['Hospital', at('sahil', 'hospital')]];
  const xs = [160, 560, 1020, 1430];
  steps.forEach(([label, t], i) => {
    k.add(`<div class="node" id="chain-n${i}" style="left:${xs[i]}px">${label}</div>`);
    k.tween(`tl.fromTo('#chain-n${i}', { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'expo.out' }, ${k.L(t)});`);
    if (i > 0) {
      k.add(`<div class="arrow" id="chain-a${i}" style="left:${xs[i - 1] + (i === 1 ? 250 : i === 2 ? 340 : 290)}px;width:${xs[i] - xs[i - 1] - (i === 1 ? 260 : i === 2 ? 350 : 300)}px"></div>`);
      k.tween(`tl.fromTo('#chain-a${i}', { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power4.out' }, ${k.L(t) - 0.25});`);
    }
    // Each node turns red as the next one is named: the failure moving down the chain.
    if (i < 3) k.tween(`tl.to('#chain-n${i}', { backgroundColor: '${C.signal}', color: '${C.cream}', duration: 0.15 }, ${k.L(steps[i + 1][1]) + 0.1});`);
  });
  k.tween(`tl.to('#chain-n3', { backgroundColor: '${C.signal}', color: '${C.cream}', duration: 0.15 }, ${k.L(at('sahil', 'backup', 8)) });`);
  k.chip('…hours later, on backup power', at('sahil', 'hours', 8), 160, 330, 'amber');
}

// ---- Sahil: see it before it happens (17.2 to 27.6): fast footage montage
{
  const k = scene('montage', S(13.2), S(23.6), { ground: 'ink', enter: 'punch' });
  k.footage('footage/garonne.mp4', S(13.2), S(16.4), 1, { push: 0.08 });
  k.footage('footage/russian.mp4', S(16.4), S(19.8), 0.5, { push: 0.08 });
  k.footage('footage/cyclone.mp4', S(19.8), S(23.6), 0, { push: 0.06 });
  k.flashAt(S(16.4));
  k.flashAt(S(19.8));
  k.words('See the *chain', [at('sahil', 'it', 13), at('sahil', 'when', 13), at('sahil', 'change', 13)], { top: 380, size: 128, light: true, center: true, out: S(16.25) });
  k.words('before it *happens.', [at('sahil', 'before'), at('sahil', 'it', 16.2), at('sahil', 'happens', 16.2)], { top: 380, size: 128, light: true, center: true, out: S(19.7) });
  k.words('Cities are *connected.', [S(20.1), S(20.4), S(20.8)], { top: 380, size: 128, light: true, center: true });
}

// ---- Sahil: silos (27.6 to 37.8)
{
  const k = scene('silos', S(23.6), S(33.8), { enter: 'smear' });
  k.css(`.silo { position:absolute; top:430px; width:340px; height:230px; border-radius:28px; background:${C.peach}; display:grid; place-items:center; font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:58px; }
  .thread { position:absolute; top:543px; height:5px; background:${C.coral}; transform-origin:left center; }`);
  const names = ['Power', 'Water', 'Roads', 'Comms'];
  const xs = [160, 580, 1000, 1420];
  names.forEach((n, i) => {
    k.add(`<div class="silo" id="silos-s${i}" style="left:${xs[i]}px">${n}</div>`);
    k.tween(`tl.fromTo('#silos-s${i}', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, ${r2(k.L(S(23.8)) + i * 0.09)});`);
  });
  k.words('Each system, seen *on its own.', [at('sahil', 'every'), at('sahil', 'one', 23.8), at('sahil', 'planets', 25), at('sahil', 'see', 26), at('sahil', 'on', 27), at('sahil', 'its', 27), at('sahil', 'own')], { top: 170, size: 84 });
  // "Nobody can see the chain between them": threads draw between the silos, then break.
  [0, 1, 2].forEach((i) => {
    k.add(`<div class="thread" id="silos-t${i}" style="left:${xs[i] + 340}px;width:80px"></div>`);
    k.tween(`tl.fromTo('#silos-t${i}', { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power4.out' }, ${r2(k.L(at('sahil', 'nobody')) + i * 0.15)});`);
    k.tween(`tl.to('#silos-t${i}', { backgroundColor: '${C.signal}', scaleY: 2.2, duration: 0.12 }, ${r2(k.L(at('sahil', 'breaks', 30)) - 0.4 + i * 0.25)});`);
    k.tween(`tl.to('#silos-s${i + 1}', { backgroundColor: '${C.signal}', color: '${C.cream}', duration: 0.12 }, ${r2(k.L(at('sahil', 'breaks', 30)) - 0.35 + i * 0.25)});`);
  });
  k.tween(`tl.to('#silos-s0', { backgroundColor: '${C.signal}', color: '${C.cream}', duration: 0.12 }, ${r2(k.L(at('sahil', 'breaks', 30)) - 0.6)});`);
  k.chip('Nobody sees the links between them', at('sahil', 'nobody'), 160, 760, 'glass');
}

// ---- Sahil: tools exist, but... (37.8 to 50.8)
{
  const k = scene('tools', S(33.8), S(46.8), { ground: 'ink', enter: 'flash' });
  k.footage('footage/skyline.mp4', S(33.8), S(40.5), 0, { veil: 'veil' });
  k.footage('footage/lightning.mp4', S(40.5), S(46.8), 12, { veil: 'veil' });
  k.css(`#tools-card { left:160px; top:330px; width:760px; padding:40px 44px; }
  #tools-card b { display:block; font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:64px; letter-spacing:-0.02em; }
  #tools-card span { display:block; margin-top:10px; font-size:30px; color:rgba(26,10,34,0.75); }
  #tools-strike { position:absolute; left:40px; top:78px; width:640px; height:6px; background:${C.signal}; transform-origin:left center; }`);
  k.add(`<div class="card" id="tools-card"><b>Specialist software</b><span>Licences, installs, training</span><div id="tools-strike"></div></div>`);
  k.tween(`tl.fromTo('#tools-card', { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, ${k.L(at('sahil', 'tools'))});`);
  k.tween(`tl.fromTo('#tools-strike', { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power4.inOut' }, ${k.L(at('sahil', 'specialist'))});`);
  k.tween(`tl.to('#tools-card', { opacity: 0, x: -40, duration: 0.25, ease: 'power3.in' }, ${k.L(S(40.4))});`);
  k.words('Open it in a *browser.', [at('sahil', 'anyone'), at('sahil', 'open', 41), at('sahil', 'in', 42), at('sahil', 'a', 42), at('sahil', 'browser')], { top: 260, size: 110, light: true });
  k.chip('No install', at('sahil', 'install'), 160, 520, 'amber');
  k.chip('No account', at('sahil', 'account'), 480, 520, 'amber');
  k.chip('Nothing to pay', at('sahil', 'pay'), 820, 520, 'amber');
}

// ---- Sahil: what Cascade is (50.8 to 62.3)
{
  const k = scene('what', S(46.8), S(58.3), { enter: 'punch' });
  k.css(`#what-lock { position:absolute; left:160px; top:300px; display:flex; align-items:center; gap:30px; }
  #what-mark { width:130px; height:130px; border-radius:50%; background:${C.amber}; display:grid; place-items:center; }
  #what-word { font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:190px; letter-spacing:-0.05em; line-height:1; }
  #what-line { position:absolute; left:160px; top:500px; width:1200px; font-size:46px; line-height:1.25; }
  #what-hours { position:absolute; right:160px; top:300px; text-align:right; }
  #what-hours .num { font-size:200px; color:${C.coral}; }
  #what-hours span { display:block; font-size:34px; }`);
  k.add(`<div id="what-lock"><div id="what-mark"><svg width="66" height="66" viewBox="0 0 16 16"><circle cx="4" cy="11" r="2.2" fill="${C.ink}"/><circle cx="12" cy="5" r="2.2" fill="${C.ink}" opacity="0.35"/><path d="M5.6 9.6 10.4 6.4" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round"/></svg></div><div id="what-word">Cascade</div></div>
  <div id="what-line">A browser-based simulator of failures spreading through a city.</div>
  <div id="what-hours"><div class="num" id="what-num">0h</div><span>simulated, hour by hour</span></div>`);
  k.tween(`tl.fromTo('#what-mark', { scale: 0, rotation: -90 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'expo.out' }, ${k.L(at('sahil', 'what', 46))});`);
  k.tween(`tl.fromTo('#what-word', { opacity: 0, x: -40, filter: 'blur(12px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.5, ease: 'expo.out' }, ${k.L(at('sahil', 'what', 46)) + 0.15});`);
  k.tween(`tl.fromTo('#what-line', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power4.out' }, ${k.L(at('sahil', 'browser', 48))});`);
  k.tween(`tl.fromTo('#what-hours', { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${k.L(at('sahil', '72'))});`);
  k.count('#what-num', 72, at('sahil', '72'), at('sahil', '72') + 0.9, "$ + 'h'");
  k.chip('Pune', at('sahil', 'pune'), 160, 700, 'amber');
  k.chip('Chennai', at('sahil', 'chennai'), 380, 700, 'amber');
  k.chip('Valencia', at('sahil', 'and', 55.7) + 0.4, 650, 700, 'amber');
  k.chip('3 cities · open map data', at('sahil', 'covers'), 160, 820, '');
}

// ---- Sahil: fail something, watch it travel (62.3 to 76.6)
{
  const k = scene('fail', S(58.3), S(72.6), { ground: 'ink', enter: 'smear' });
  k.footage('footage/thun.mp4', S(58.3), S(64.6), 0, { veil: 'veil' });
  k.footage('footage/garonne.mp4', S(64.6), S(72.6), 3.5, { veil: 'veil' });
  k.words('Fail a *substation,', [at('sahil', 'you', 58), at('sahil', 'make', 58), at('sahil', 'substation', 58)], { top: 190, size: 100, light: true, out: S(63.3) });
  k.chip('a pump', at('sahil', 'bump'), 160, 360, 'amber', S(63.3));
  k.chip('a bridge', at('sahil', 'bridge', 58), 420, 360, 'amber', S(63.3));
  k.chip('or let a river rise', at('sahil', 'river'), 700, 360, 'lagoon', S(63.3));
  k.words('Watch the *outage travel.', [at('sahil', 'then', 63), at('sahil', 'watch', 63), at('sahil', 'the', 64), at('sahil', 'outbreak'), at('sahil', 'travel')], { top: 190, size: 100, light: true, out: S(68.2) });
  ['Power', 'Water', 'Roads', 'Comms'].forEach((n, i) => k.chip(n, at('sahil', ['power', 'water', 'roads', 'pumps'][i], 64), 160 + i * 260, 360, ['amber', 'lagoon', 'glass', 'glass'][i], S(68.2)));
  k.words('Then plan *around it.', [at('sahil', 'and', 68), at('sahil', 'then', 68), at('sahil', 'kind', 68), at('sahil', 'way', 68)], { top: 420, size: 120, light: true, center: true });
}

// ---- Sahil: live demo (76.6 to 139.1)
{
  const k = scene('demoa', S(72.6), S(135.1), { ground: 'cream', enter: 'flash' });
  k.footage('demo/a.mp4', S(72.6), S(135.06), 0, { veil: null, push: 0.02 });
  k.add(`<div class="live" id="demoa-live"><i></i>LIVE DEMO · cascade-jade-chi.vercel.app</div>`);
  k.tween(`tl.fromTo('#demoa-live', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' }, 0.3);`);
  k.lt('Central Pune', '575 mapped places from OpenStreetMap', S(74.9), S(79.2));
  k.lt('1,831 dependencies', 'one traced in OSM, the rest inferred', S(79.3), S(83.1));
  k.lt('Fail: Parvati Water Treatment Plant', 'failed by hand at T+0', S(83.2), S(87.8));
  k.lt('Run the clock', '72 hours in 15-minute steps', S(87.9), S(90.7));
  k.lt('T+8h · water tower runs dry', 'its 8 h tank is empty', S(90.8), S(94.3));
  k.lt('T+16h · clinic fails', 'simulated scenario', S(94.4), S(96.5));
  k.lt('T+32h · hospital fails', 'after 24 h of stored water', S(96.6), S(98.9));
  k.lt('312 facilities fail', 'from one plant · simulated', S(99.0), S(104.2));
  k.lt('Each one fails when its backup runs out', 'generator, battery or tank', S(104.3), S(111.2));
  k.lt('Why did this fail?', 'the exact chain behind it', S(111.3), S(117.6));
  k.lt('Every link is labelled', 'observed · inferred · user-set', S(117.7), S(122.6));
  k.lt('Inferred', 'estimated from geography, with a confidence', S(122.7), S(126.0));
  k.lt('User-set', 'you changed it', S(126.1), S(132.9));
}

// ---- Hand-off (139.1 to 141.8)
{
  const k = scene('handoff', S(135.1), PRANAV_AT, { enter: 'flash' });
  k.words('Now, *how it works.', [S(135.2), S(135.35), S(135.5), S(135.65)], { top: 420, size: 140, center: true });
}

// ---- Pranav: under the hood, a graph (141.8 to 165.6)
{
  const k = scene('graph', PRANAV_AT, P(23.8), { enter: 'smear' });
  k.words('Under the hood, it’s a *graph.', [at('pranav', 'under'), at('pranav', 'the'), at('pranav', 'hood'), at('pranav', 'cascade'), at('pranav', 'is'), at('pranav', 'graph')], { top: 120, size: 84 });
  k.css(`.gn { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%; background:${C.ink}; }
  .gn.hub { width:40px; height:40px; margin:-20px 0 0 -20px; background:${C.coral}; box-shadow:0 0 0 12px rgba(255,107,91,0.2); }
  .gl { position:absolute; font-size:24px; white-space:nowrap; transform:translate(-50%, 22px); }
  #graph svg { position:absolute; inset:0; overflow:visible; }
  .ge { fill:none; stroke-width:3; stroke-linecap:round; }
  #graph-gate { position:absolute; right:160px; top:330px; width:600px; }
  .gate { margin-bottom:26px; padding:26px 32px; border-radius:24px; background:${C.peach}; font-size:30px; }
  .gate b { font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:58px; display:block; }`);
  // A small real-shaped dependency graph: a substation hub feeding a pump, a mast and a hospital.
  const nodes = [[560, 560, 'Substation', true], [300, 420, 'Pumping station'], [820, 420, 'Telecom mast'], [300, 760, 'Water tower'], [820, 760, 'Hospital'], [560, 900, 'Neighbourhood']];
  const edges = [[0, 1, C.amber, 'power'], [0, 2, C.amber, 'power'], [0, 4, C.amber, 'power'], [1, 3, C.lagoon, 'water'], [3, 4, C.lagoon, 'water'], [2, 4, C.dusk, 'comms'], [4, 5, C.coral, 'access']];
  let svg = '<svg viewBox="0 0 1920 1080">';
  edges.forEach(([a, b, col], i) => {
    const [x1, y1] = nodes[a], [x2, y2] = nodes[b];
    const len = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
    svg += `<path id="graph-e${i}" class="ge" d="M${x1} ${y1} L${x2} ${y2}" stroke="${col}" style="stroke-dasharray:${len};stroke-dashoffset:${len}"/>`;
    k.tween(`tl.fromTo('#graph-e${i}', { strokeDashoffset: ${len} }, { strokeDashoffset: 0, duration: 0.5, ease: 'expo.out' }, ${r2(k.L(at('pranav', 'power')) + i * 0.32)});`);
  });
  svg += '</svg>';
  k.add(svg);
  nodes.forEach(([x, y, label, hub], i) => {
    k.add(`<div class="gn ${hub ? 'hub' : ''}" id="graph-n${i}" style="left:${x}px;top:${y}px"></div><div class="gl" id="graph-l${i}" style="left:${x}px;top:${y}px">${label}</div>`);
    k.tween(`tl.fromTo('#graph-n${i}, #graph-l${i}', { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'expo.out' }, ${r2(k.L(at('pranav', 'facilities')) + i * 0.18)});`);
  });
  k.chip('nodes', at('pranav', 'nodes'), 160, 270, 'glass');
  k.chip('edges: power · water · access · comms', at('pranav', 'edges'), 330, 270, 'glass');
  // "keeps working while its inputs are met, or while its backup lasts": the hospital goes amber.
  k.tween(`tl.to('#graph-n4', { backgroundColor: '${C.amber}', scale: 1.4, duration: 0.3 }, ${k.L(at('pranav', 'backup'))});`);
  k.add(`<div id="graph-gate"><div class="gate" id="graph-and"><b>AND</b>needs every input</div><div class="gate" id="graph-or"><b>OR</b>any one input will do</div></div>`);
  k.tween(`tl.fromTo('#graph-and', { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, ${k.L(at('pranav', 'every', 18))});`);
  k.tween(`tl.fromTo('#graph-or', { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, ${k.L(at('pranav', 'only', 19))});`);
}

// ---- Pranav: 15-minute steps, exact failure (165.6 to 176.1)
{
  const k = scene('steps', P(23.8), P(34.3), { enter: 'punch' });
  k.words('Every *15 minutes, for 72 hours.', [at('pranav', 'simulation'), at('pranav', '15'), at('pranav', 'minute'), at('pranav', 'across'), at('pranav', '72'), at('pranav', 'hours', 24)], { top: 160, size: 88 });
  k.css(`#steps-ruler { position:absolute; left:160px; right:160px; top:470px; height:70px; }
  .tick { position:absolute; bottom:0; width:2px; background:rgba(26,10,34,0.35); }
  #steps-head { position:absolute; left:160px; top:440px; width:6px; height:120px; background:${C.coral}; }
  #steps-tank { position:absolute; left:160px; top:640px; width:1000px; height:90px; border-radius:20px; background:${C.peach}; overflow:hidden; }
  #steps-fill { position:absolute; inset:0; background:${C.amber}; transform-origin:left center; }
  #steps-tank span { position:absolute; left:30px; top:24px; font-size:34px; font-weight:500; }
  #steps-fail { position:absolute; left:1220px; top:640px; padding:22px 34px; border-radius:20px; background:${C.signal}; color:${C.cream}; font-size:38px; font-weight:500; }`);
  let ticks = '';
  for (let i = 0; i <= 72; i++) ticks += `<span class="tick" style="left:${r2((i / 72) * 1600)}px;height:${i % 6 === 0 ? 60 : 24}px"></span>`;
  k.add(`<div id="steps-ruler">${ticks}</div><div id="steps-head"></div><div id="steps-tank"><div id="steps-fill"></div><span>Backup: generator · battery · tank</span></div><div id="steps-fail">FAILED at the exact step</div>`);
  k.tween(`tl.fromTo('#steps-ruler', { opacity: 0, clipPath: 'inset(0 100% 0 0)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)', duration: 0.8, ease: 'power4.out' }, ${k.L(at('pranav', 'simulation'))});`);
  k.tween(`tl.fromTo('#steps-head', { x: 0 }, { x: 1594, duration: ${r2(at('pranav', 'runs', 29) - at('pranav', '15'))}, ease: 'none' }, ${k.L(at('pranav', '15'))});`);
  k.tween(`tl.fromTo('#steps-tank', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' }, ${k.L(at('pranav', 'node', 28))});`);
  k.tween(`tl.fromTo('#steps-fill', { scaleX: 1 }, { scaleX: 0, duration: ${r2(at('pranav', 'runs', 29) - at('pranav', 'node', 28))}, ease: 'none' }, ${k.L(at('pranav', 'node', 28))});`);
  k.tween(`tl.fromTo('#steps-fail', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'expo.out' }, ${k.L(at('pranav', 'runs', 29))});`);
}

// ---- Pranav: the flood model (176.1 to 190.2)
{
  const k = scene('flood', P(34.3), P(48.4), { ground: 'ink', enter: 'flash' });
  k.footage('footage/garonne.mp4', P(34.3), P(41.5), 4, { veil: 'veil' });
  k.footage('footage/russian.mp4', P(41.5), P(48.4), 1, { veil: 'veil' });
  k.words('A simple *bathtub model.', [at('pranav', 'for', 34), at('pranav', 'floods'), at('pranav', 'we', 34), at('pranav', 'simple'), at('pranav', 'matham')], { top: 150, size: 96, light: true });
  // Elevation profile with water rising over it.
  k.css(`#flood-card { left:160px; top:380px; width:1100px; height:420px; overflow:hidden; background:rgba(255,244,232,0.94); }
  #flood-water { position:absolute; left:0; right:0; bottom:0; height:100%; background:rgba(46,196,182,0.55); transform-origin:bottom center; }
  #flood-card svg { position:absolute; inset:0; }
  #flood-label { position:absolute; left:30px; top:24px; font-size:30px; font-weight:500; }
  .fpin { position:absolute; width:22px; height:22px; margin:-11px 0 0 -11px; border-radius:50%; background:${C.ink}; }`);
  const pins = [[150, 300], [380, 250], [560, 330], [760, 190], [960, 280]];
  k.add(`<div class="card" id="flood-card"><div id="flood-water"></div><svg viewBox="0 0 1100 420"><path d="M0 330 C120 300 200 260 300 250 S480 340 560 340 S700 170 780 180 S960 300 1100 260 L1100 420 L0 420 Z" fill="#C9A27E"/></svg>${pins.map(([x, y], i) => `<div class="fpin" id="flood-p${i}" style="left:${x}px;top:${y}px"></div>`).join('')}<div id="flood-label">River stage rising over 6 hours</div></div>`);
  k.tween(`tl.fromTo('#flood-card', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, ${k.L(at('pranav', 'river'))});`);
  k.tween(`tl.fromTo('#flood-water', { scaleY: 0.05 }, { scaleY: 0.42, duration: 6, ease: 'power1.inOut' }, ${k.L(at('pranav', 'rises'))});`);
  // Pins below the water fail, lowest first.
  [[2, 0.3], [0, 1.2], [4, 2.8]].forEach(([i, d]) => k.tween(`tl.to('#flood-p${i}', { backgroundColor: '${C.signal}', scale: 1.5, duration: 0.15 }, ${r2(k.L(at('pranav', 'below')) + d)});`));
  k.chip('Roads close the same way', at('pranav', 'roads', 45), 160, 850, 'signal');
}

// ---- Pranav: the stack (190.2 to 222.8)
{
  const k = scene('stack', P(48.4), P(81.0), { enter: 'smear' });
  k.words('The stack is *deliberately small.', [at('pranav', 'picture'), at('pranav', 'is', 48), at('pranav', 'deliberately'), at('pranav', 'small')], { top: 120, size: 84, out: P(52.2) });
  k.chip('No database', at('pranav', 'database'), 160, 260, 'amber', P(52.2));
  k.chip('No accounts', at('pranav', 'accounts'), 460, 260, 'amber', P(52.2));
  k.css(`.src { position:absolute; left:160px; width:560px; padding:24px 30px; border-radius:22px; background:${C.peach}; font-size:32px; font-weight:500; }
  .src small { display:block; font-size:24px; font-weight:400; color:rgba(26,10,34,0.7); }
  #stack-json { position:absolute; left:860px; top:430px; width:300px; padding:30px; border-radius:24px; background:${C.ink}; color:${C.cream}; font-size:34px; text-align:center; }
  #stack-browser { position:absolute; left:1300px; top:330px; width:460px; height:380px; border-radius:24px; background:${C.cream}; box-shadow:0 40px 90px -40px rgba(26,10,34,0.6); overflow:hidden; }
  #stack-browser .bar { height:48px; background:${C.peach}; display:flex; align-items:center; gap:8px; padding-left:18px; }
  #stack-browser .bar i { width:12px; height:12px; border-radius:50%; background:${C.coral}; }
  #stack-browser p { margin:26px; font-size:28px; line-height:1.5; }
  .flow { position:absolute; height:4px; background:${C.coral}; transform-origin:left center; }`);
  k.add(`<div class="src" id="stack-s0" style="top:300px">OpenStreetMap<small>infrastructure, via the Overpass API</small></div>
  <div class="src" id="stack-s1" style="top:440px">AWS Terrain Tiles<small>elevation</small></div>
  <div class="src" id="stack-s2" style="top:580px">Open-Meteo<small>rainfall and river data</small></div>
  <div class="flow" id="stack-f0" style="left:720px;top:360px;width:140px;transform:rotate(22deg)"></div>
  <div class="flow" id="stack-f1" style="left:720px;top:490px;width:140px"></div>
  <div class="flow" id="stack-f2" style="left:720px;top:630px;width:140px;transform:rotate(-22deg)"></div>
  <div id="stack-json">one dataset<br/>per city</div>
  <div class="flow" id="stack-f3" style="left:1160px;top:490px;width:140px"></div>
  <div id="stack-browser"><div class="bar"><i></i><i style="background:${C.amber}"></i><i style="background:${C.lagoon}"></i></div><p id="stack-p1">Next.js · React · TypeScript</p><p id="stack-p2">Deployed on Vercel</p><p id="stack-p3">OpenFreeMap tiles · runs in your browser</p></div>`);
  [['pranav', 'openstreetmap'], ['pranav', 'elevation'], ['pranav', 'rainfall']].forEach(([w, word], i) => {
    k.tween(`tl.fromTo('#stack-s${i}', { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.4, ease: 'expo.out' }, ${k.L(at(w, word))});`);
    k.tween(`tl.fromTo('#stack-f${i}', { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power4.out' }, ${k.L(at('pranav', 'build'))});`);
  });
  k.tween(`tl.fromTo('#stack-json', { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, ease: 'expo.out' }, ${k.L(at('pranav', 'dataset'))});`);
  k.tween(`tl.fromTo('#stack-f3', { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power4.out' }, ${k.L(at('pranav', 'app', 66)) - 0.2});`);
  k.tween(`tl.fromTo('#stack-browser', { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' }, ${k.L(at('pranav', 'app', 66))});`);
  [['next', 66], ['deployed', 69], ['map', 72]].forEach(([word, after], i) => k.tween(`tl.fromTo('#stack-p${i + 1}', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power4.out' }, ${k.L(at('pranav', word, after))});`));
  k.chip('Nothing to install', at('pranav', 'installing'), 1300, 760, 'lagoon');
}

// ---- Pranav: no machine learning (222.8 to 238.8)
{
  const k = scene('noml', P(81.0), P(97.0), { ground: 'ink', enter: 'punch' });
  k.css(`#noml { position:absolute; inset:0; background:${C.plum}; }
  #noml-big { position:absolute; left:160px; top:200px; font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:150px; letter-spacing:-0.04em; color:${C.cream}; line-height:1; }
  #noml-big s { text-decoration-color:${C.signal}; text-decoration-thickness:10px; }
  #noml-tests { left:160px; top:470px; width:760px; padding:34px 40px; font-size:28px; line-height:1.7; }
  #noml-tests b { color:#0f7a70; }
  #noml-gem { left:1040px; top:470px; width:720px; padding:34px 40px; font-size:32px; line-height:1.4; }
  #noml-gem em { display:block; margin-top:18px; font-style:normal; padding:14px 22px; border-radius:16px; background:${C.amber}; font-size:28px; }`);
  k.add(`<div id="noml"></div><div id="noml-big">No machine learning.</div>
  <div class="card mono" id="noml-tests"><div id="noml-t0"><b>✓</b> chain propagates in order</div><div id="noml-t1"><b>✓</b> AND vs OR logic</div><div id="noml-t2"><b>✓</b> backup expires at the exact step</div><div id="noml-t3"><b>✓</b> a backup never makes it worse</div><div id="noml-t4"><b>✓</b> same seed, same result</div></div>
  <div class="card" id="noml-gem">Gemini (free tier) only turns the engine’s result into plain English.<em id="noml-tpl">No key? A fixed template does the job.</em></div>`);
  k.tween(`tl.fromTo('#noml-big', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, ${k.L(at('pranav', 'machine'))});`);
  k.tween(`tl.fromTo('#noml-tests', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, ${k.L(at('pranav', 'testable'))});`);
  [0, 1, 2, 3, 4].forEach((i) => k.tween(`tl.fromTo('#noml-t${i}', { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.25, ease: 'power4.out' }, ${r2(k.L(at('pranav', 'testable')) + 0.3 + i * 0.16)});`));
  k.tween(`tl.fromTo('#noml-gem', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, ${k.L(at('pranav', 'gemini'))});`);
  k.tween(`tl.fromTo('#noml-tpl', { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'expo.out' }, ${k.L(at('pranav', 'template'))});`);
}

// ---- Pranav: live demo of planning (238.8 to 265.3)
{
  const k = scene('demob', P(97.0), P(123.5), { enter: 'flash' });
  k.footage('demo/b.mp4', P(97.0), P(123.47), 0, { veil: null, push: 0.02 });
  k.add(`<div class="live" id="demob-live"><i></i>LIVE DEMO · planning</div>`);
  k.tween(`tl.fromTo('#demob-live', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' }, 0.3);`);
  k.lt('Choose a budget', 'three interventions', at('pranav', 'budget'), at('pranav', 'such') - 0.1);
  k.lt('The optimizer searches', 'hardening · generators · mobile substations', at('pranav', 'such'), at('pranav', 'pune', 110) - 0.1);
  k.lt('Pune: 89 plans tested', 'simulated impact cut by about 10%', at('pranav', 'pune', 110), at('pranav', 'compare', 116) - 0.1);
  k.lt('Compare up to three plans', 'and see which failure each prevents', at('pranav', 'compare', 116), P(123.4));
}

// ---- Pranav: honest positioning (265.3 to 282.4)
{
  const k = scene('honest', P(123.5), P(140.6), { ground: 'ink', enter: 'smear' });
  k.footage('footage/cyclone.mp4', P(123.5), P(131.0), 0, { veil: 'veil' });
  k.footage('footage/lightning.mp4', P(131.0), P(140.6), 0, { veil: 'veil' });
  k.words('A planning *sketch, not a forecast.', [at('pranav', 'its', 124), at('pranav', 'planning'), at('pranav', 'sketch'), at('pranav', 'not', 125), at('pranav', 'a', 126), at('pranav', 'forecast')], { top: 200, size: 104, light: true, out: P(131.8) });
  k.chip('InfraRisk', at('pranav', 'infraris'), 160, 420, 'glass', P(131.8));
  k.chip('CReDo', at('pranav', 'credo'), 420, 420, 'glass', P(131.8));
  k.chip('serious tools, serious work', at('pranav', 'serious'), 640, 420, 'amber', P(131.8));
  k.words('Cascade doesn’t *replace them.', [at('pranav', 'cascade', 132), at('pranav', 'does', 132), at('pranav', 'not', 132), at('pranav', 'replace')], { top: 200, size: 104, light: true });
  k.chip('Zero install', at('pranav', 'zero'), 160, 420, 'amber');
  k.chip('Explainable', at('pranav', 'explainable'), 450, 420, 'amber');
  k.chip('Open data', at('pranav', 'open', 136), 750, 420, 'lagoon');
}

// ---- Pranav: thin open data (282.4 to 293.2)
{
  const k = scene('thin', P(140.6), P(151.4), { enter: 'punch' });
  k.words('The open data is *thin.', [at('pranav', 'and', 140), at('pranav', 'the', 140), at('pranav', 'open', 140), at('pranav', 'data', 140), at('pranav', 'is', 141), at('pranav', 'thin')], { top: 140, size: 96 });
  k.css(`#thin-n { position:absolute; left:160px; top:330px; }
  #thin-n .num { font-size:320px; color:${C.coral}; }
  #thin-n span { display:block; font-size:38px; margin-top:6px; }
  #thin-card { left:980px; top:300px; width:620px; padding:16px; }
  #thin-frame { position:relative; width:588px; height:490px; border-radius:18px; overflow:hidden; background:#000; }
  #thin-card video { position:absolute; inset:0; width:588px; height:490px; object-fit:cover; }
  #thin-card figcaption { margin:12px 6px 4px; font-size:22px; color:rgba(26,10,34,0.75); }`);
  k.add(`<div id="thin-n"><div class="num" id="thin-num">0</div><span>mapped substations in our Pune area</span></div>
  <figure class="card" id="thin-card"><div id="thin-frame"><video id="thin-v" class="clip" src="assets/footage/nights.mp4" data-start="0" data-duration="7" data-track-index="0" muted playsinline></video><video id="thin-v2" class="clip" src="assets/footage/nights.mp4" data-start="7" data-duration="${r2(P(151.4) - P(140.6) - 7)}" data-track-index="0" muted playsinline></video></div><figcaption>Real night-lights imagery of a power outage (NASA Earth Observatory)</figcaption></figure>`);
  k.tween(`tl.fromTo('#thin-n', { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${k.L(at('pranav', 'une')) - 0.2});`);
  k.count('#thin-num', 8, at('pranav', 'une'), at('pranav', 'une') + 0.8);
  k.tween(`tl.fromTo('#thin-card', { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, 0.3);`);
  k.chip('Most links inferred → every one labelled', at('pranav', 'most'), 160, 860, 'amber');
}

// ---- Pranav: method page demo (293.2 to 298.7)
{
  const k = scene('democ', P(151.4), P(156.9), { enter: 'flash' });
  k.footage('demo/c.mp4', P(151.4), P(156.87), 0, { veil: null, push: 0.03 });
  k.lt('Every assumption, visible and editable', 'cascade-jade-chi.vercel.app/method', P(151.6), P(156.8));
}

// ---- Pranav: the close (298.7 to 305.6)
{
  const k = scene('close', P(156.9), P(163.8), { ground: 'ink', enter: 'smear' });
  k.footage('footage/lightning.mp4', P(156.9), P(163.8), 14, { veil: 'veil' });
  const t = (w, after) => at('pranav', w, after);
  k.words('A hidden *chain of failures', [t('cascade', 156), t('turns', 156), t('hidden'), t('chain', 157), t('of', 158), t('failures', 158)], { top: 420, size: 112, light: true, center: true, out: t('watch', 156) - 0.2 });
  k.words('Watch it. *Question it. Plan around it.', [t('watch', 156), t('watch', 156), t('question'), t('question'), t('plan', 159), t('around', 160), t('around', 160)], { top: 420, size: 112, light: true, center: true, out: t('thank') - 0.15 });
  k.words('Thank *you.', [t('thank'), t('you', 162.9)], { top: 440, size: 140, light: true, center: true });
}

// ---- Outro (305.6 to 312)
{
  const k = scene('outro', P(163.8), TOTAL, { ground: 'cream', enter: 'flash' });
  k.footage('footage/sky.mp4', P(163.8), TOTAL, 0, { veil: null, push: 0.04 });
  k.css(`#outro-lock { position:absolute; left:0; right:0; top:330px; display:flex; justify-content:center; align-items:center; gap:30px; }
  #outro-mark { width:120px; height:120px; border-radius:50%; background:${C.amber}; display:grid; place-items:center; }
  #outro-word { font-family:'Stack Sans Headline',sans-serif; font-weight:300; font-size:170px; letter-spacing:-0.05em; }
  #outro-url { position:absolute; left:0; right:0; top:560px; text-align:center; font-size:44px; font-weight:500; }
  #outro-team { position:absolute; left:0; right:0; top:630px; text-align:center; font-size:30px; }
  #outro-credits { position:absolute; left:200px; right:200px; bottom:90px; text-align:center; font-size:20px; line-height:1.5; color:rgba(26,10,34,0.8); }`);
  k.add(`<div id="outro-lock"><div id="outro-mark"><svg width="60" height="60" viewBox="0 0 16 16"><circle cx="4" cy="11" r="2.2" fill="${C.ink}"/><circle cx="12" cy="5" r="2.2" fill="${C.ink}" opacity="0.35"/><path d="M5.6 9.6 10.4 6.4" stroke="${C.ink}" stroke-width="1.4" stroke-linecap="round"/></svg></div><div id="outro-word">Cascade</div></div>
  <div id="outro-url">cascade-jade-chi.vercel.app</div><div id="outro-team">Sahil · Pranav · NorCal Hacks 27</div>
  <div id="outro-credits">Simulated scenarios. Footage: Marsupium, Nachtbold (CC0); NathanScientific (CC0); Pierre-Selim Huard, Missvain, Mohammad Moheimany (CC BY 4.0); “City skyline (time lapse)”, Thomas Bresson (CC BY 3.0); NOAA, NASA, CSU/CIRA (public domain). Music: “Cinematic Ambient” by Matio888 (CC BY 4.0). Map data © OpenStreetMap contributors.</div>`);
  k.tween(`tl.fromTo('#outro-mark', { scale: 0 }, { scale: 1, duration: 0.5, ease: 'expo.out' }, 0.3);`);
  k.tween(`tl.fromTo('#outro-word', { opacity: 0, x: -30, filter: 'blur(10px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.5, ease: 'expo.out' }, 0.4);`);
  k.tween(`tl.fromTo('#outro-url, #outro-team', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power4.out', stagger: 0.12 }, 1.0);`);
  k.tween(`tl.fromTo('#outro-credits', { opacity: 0 }, { opacity: 1, duration: 0.4 }, 1.4);`);
}

// ================================================================= WRITE FILES
for (const s of scenes) {
  const dur = r2(s.end - s.start);
  const enter = {
    flash: `tl.fromTo('#${s.id}-flash', { opacity: 1 }, { opacity: 0, duration: 0.32, ease: 'power2.out' }, 0);`,
    smear: `tl.fromTo('#${s.id}-stage', { y: -240, filter: 'blur(20px)' }, { y: 0, filter: 'blur(0px)', duration: 0.3, ease: 'power4.out' }, 0);`,
    punch: `tl.fromTo('#${s.id}-stage', { scale: 1.14, filter: 'blur(12px)' }, { scale: 1, filter: 'blur(0px)', duration: 0.35, ease: 'expo.out' }, 0);`,
    cut: '',
  }[s.enter];
  const html = `<template>
  <style>${BASE_CSS}
  #${s.id} { position: absolute; inset: 0; overflow: hidden; font-family: 'Stack Sans Text', sans-serif; color: ${C.ink}; background: ${s.ground === 'ink' ? C.ink : C.cream}; }
  ${s.css.join('\n  ')}
  </style>
  <div id="${s.id}" data-composition-id="${s.id}" data-width="1920" data-height="1080" data-layout-allow-overlap>
    <div class="stage" id="${s.id}-stage">
      ${s.html.join('\n      ')}
    </div>
    ${s.enter === 'flash' ? `<div class="flash" id="${s.id}-flash"></div>` : ''}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${enter}
    ${s.tl.join('\n    ')}
    window.__timelines['${s.id}'] = tl;
  </script>
</template>
`;
  writeFileSync(new URL(`compositions/${s.id}.html`, root), html);
  s.dur = dur;
}

const hosts = scenes.map((s) => `      <div id="${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${r2(s.start)}" data-duration="${s.dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`).join('\n');

const pip = (who, start, dur, name, role) => `
      <div id="pip-${who}" class="pip" data-layout-allow-overflow>
        <div class="pip-frame"><video id="pip-${who}-v" class="clip" src="assets/speakers/${who}.mp4" data-start="${start}" data-duration="${dur}" data-has-audio="true" data-volume="1" playsinline></video></div>
        <div class="pip-name"><b>${name}</b>${role}</div>
      </div>`;

const index = `<!doctype html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      @font-face { font-family: 'Stack Sans Text'; src: url('assets/fonts/stack-sans-text.woff2') format('woff2'); font-weight: 400 500; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: ${C.cream}; }
      #root { position: relative; width: 100%; height: 100%; }
      .pip { position: absolute; right: 48px; bottom: 48px; width: 300px; z-index: 30; font-family: 'Stack Sans Text', sans-serif; }
      .pip-frame { width: 300px; height: 300px; border-radius: 30px; overflow: hidden; border: 4px solid ${C.cream}; box-shadow: 0 30px 70px -30px rgba(26,10,34,0.7); background: ${C.ink}; }
      .pip-frame video { width: 100%; height: 100%; object-fit: cover; display: block; }
      .pip-name { position: absolute; left: 14px; bottom: 14px; padding: 8px 14px; border-radius: 12px; background: rgba(255,244,232,0.95); font-size: 20px; color: ${C.ink}; }
      .pip-name b { font-weight: 500; margin-right: 8px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
${hosts}
${pip('sahil', SAHIL_AT, 137.55, 'Sahil', 'the what')}
${pip('pranav', PRANAV_AT, 163.76, 'Pranav', 'the how')}
      <audio id="music" class="clip" src="assets/music/matio888-cinematic-ambient.mp3" data-start="0" data-media-start="20" data-duration="${TOTAL}" data-track-index="4" data-volume="0.55" data-fade-in="1.5" data-fade-out="4"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      // The corner bubbles pop in when each speaker starts and leave cleanly.
      tl.fromTo('#pip-sahil .pip-frame, #pip-sahil .pip-name', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'expo.out', stagger: 0.08 }, ${SAHIL_AT});
      tl.fromTo('#pip-pranav .pip-frame, #pip-pranav .pip-name', { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'expo.out', stagger: 0.08 }, ${PRANAV_AT});
      tl.set('#pip-sahil', { opacity: 0 }, 0);
      tl.set('#pip-sahil', { opacity: 1 }, ${SAHIL_AT});
      tl.to('#pip-sahil', { opacity: 0, scale: 0.8, duration: 0.3, ease: 'power3.in' }, ${r2(SAHIL_AT + 137.25)});
      tl.set('#pip-pranav', { opacity: 0 }, 0);
      tl.set('#pip-pranav', { opacity: 1 }, ${PRANAV_AT});
      tl.to('#pip-pranav', { opacity: 0, scale: 0.8, duration: 0.3, ease: 'power3.in' }, ${r2(PRANAV_AT + 163.4)});
      const left = -(1920 - 300 - 96);
      [[${S(72.6)}, ${S(135.1)}, '#pip-sahil'], [${P(97.0)}, ${P(123.5)}, '#pip-pranav'], [${P(151.4)}, ${P(156.9)}, '#pip-pranav']].forEach(([a, b, el]) => {
        tl.to(el, { x: left, duration: 0.45, ease: 'power3.inOut' }, a);
        tl.to(el, { x: 0, duration: 0.45, ease: 'power3.inOut' }, b);
      });
      window.__timelines['main'] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(new URL('index.html', root), index);
console.log(`${scenes.length} scenes, ${TOTAL}s`);
