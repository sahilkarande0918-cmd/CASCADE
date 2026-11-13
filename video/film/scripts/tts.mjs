// Generates the voiceover, one line per file, with Gnani Vachana TTS.
// Reads GNANI_API_KEY from the repo's git-ignored .env.local; never prints it.
// Usage: node scripts/tts.mjs [lineId...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export const LINES = {
  l1: 'One failure.',
  l2: 'Then the next.',
  l3: "Cities don't fail one system at a time. Power feeds water, water feeds hospitals, and roads hold it all together.",
  l4: 'Cascade reads a real city from open map data, and joins every substation, pump, mast and hospital into one dependency graph. Every guessed link is marked as a guess.',
  l5: 'Fail one water treatment plant, and the water towers run dry by hour eight. Clinics follow at sixteen. Hospitals hold out on their tanks until hour thirty-two.',
  l6: 'Three hundred and twelve facilities, from one failure, hour by hour.',
  l7: 'Then plan around it. Let the optimizer pick the three moves that matter most, compare plans side by side, and click any failure to see exactly why it happened.',
  l8: 'Cascade. Watch a city fail, then plan around it.',
};

import { fileURLToPath } from 'node:url';
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

const env = isMain ? readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8') : '';
const key = env.match(/^GNANI_API_KEY=(.+)$/m)?.[1]?.trim();
if (isMain && !key) throw new Error('GNANI_API_KEY missing from .env.local');

if (isMain) mkdirSync(new URL('../assets/vo/', import.meta.url), { recursive: true });
const ids = !isMain ? [] : process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(LINES);
for (const id of ids) {
  const res = await fetch('https://api.vachana.ai/api/v1/tts/inference', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key-ID': key },
    body: JSON.stringify({
      text: LINES[id],
      model: 'timbre-v2.5',
      voice: 'Kaveri',
      language: 'en-IN',
      speed: 1.0,
      audio_config: { sample_rate: 48000, num_channels: 1, sample_width: 2, encoding: 'linear_pcm', container: 'wav' },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    console.error(`${id}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(new URL(`../assets/vo/${id}.wav`, import.meta.url), buf);
  console.log(`${id}: ${buf.length} bytes`);
}
