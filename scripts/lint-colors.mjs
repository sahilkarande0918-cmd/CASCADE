// Fails if a banned colour sneaks into the source: grey/slate/zinc/neutral/stone
// scales, blue-indigo-violet utility classes, or any hex outside the palette.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PALETTE = new Set([
  '#1a0a22', '#3b1450', '#b83a7a', '#ff6b5b', '#ff9a5a', '#ffd3ae', '#fff4e8',
  '#ff4b2b', '#2ec4b6', '#ffb020',
]);
const CLASS = /\b(?:bg|text|border|from|to|via|ring|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder)-(?:gray|slate|zinc|neutral|stone|indigo|violet|blue|sky|navy)-\d{2,3}\b/g;
const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g;
const NAMED = /\b(?:gray|grey|slategray|navy|midnightblue|darkblue)\b/gi;

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css|mjs)$/.test(f) && !f.endsWith('.test.ts')) files.push(p);
  }
};
['app', 'components', 'lib'].forEach((d) => { try { walk(d); } catch {} });

const problems = [];
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('lint-colors: ignore')) return;
    for (const m of line.matchAll(CLASS)) problems.push(`${f}:${i + 1} banned class ${m[0]}`);
    for (const m of line.matchAll(HEX)) {
      const hex = m[0].toLowerCase();
      // `#fff`-style shorthands in selectors (e.g. ids) are rare; treat all as colours.
      if (!PALETTE.has(hex)) problems.push(`${f}:${i + 1} off-palette hex ${m[0]}`);
    }
    if (/\.css$/.test(f)) for (const m of line.matchAll(NAMED)) problems.push(`${f}:${i + 1} banned colour name ${m[0]}`);
  });
}

if (problems.length) {
  console.error(`colour lint: ${problems.length} problem(s)\n` + problems.join('\n'));
  process.exit(1);
}
console.log(`colour lint: ${files.length} files clean`);
