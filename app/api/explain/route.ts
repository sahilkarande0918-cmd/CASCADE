import { GoogleGenAI } from '@google/genai';

// Narrates a failure path the engine already computed. The model is handed the
// path and told to use nothing else: it never adds dependencies, nodes or
// numbers. With no key, or when the call fails or is slow, a deterministic
// template says the same thing. The response says which one wrote it.

type Step = { name: string; kind: string; how: string; at: number | null };
type Body = { city: string; stage: number; path: Step[] };

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

export async function POST(req: Request) {
  let body: Body;
  try {
    body = validate(await req.json());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'bad request' }, { status: 400 });
  }
  const template = templateText(body);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ text: template, source: 'template' });
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await Promise.race([
      ai.models.generateContent({ model: MODEL, contents: prompt(body) }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 7000)),
    ]);
    const text = res.text?.trim();
    if (!text) throw new Error('empty');
    return Response.json({ text, source: 'gemini' });
  } catch (err) {
    console.error('[explain] falling back to template:', err instanceof Error ? err.message : err);
    return Response.json({ text: template, source: 'template' });
  }
}

const hours = (h: number | null) => (h === null ? 'not within 72 hours' : h === 0 ? 'immediately' : `after ${fmt(h)} h`);
const fmt = (h: number) => (Number.isInteger(h) ? String(h) : h.toFixed(2).replace(/0$/, ''));

function templateText({ city, stage, path }: Body): string {
  const [root, ...rest] = path;
  const target = path[path.length - 1];
  const lines = [`In this simulated ${fmt(stage)} m flood in ${city}, ${target.name} is lost ${hours(target.at)}.`];
  lines.push(`It starts at ${root.name} (${root.kind}), which ${root.how} ${hours(root.at)}.`);
  for (const s of rest) lines.push(`Then ${s.name} (${s.kind}) ${s.how}, and fails ${hours(s.at)}.`);
  return lines.join(' ');
}

function prompt({ city, stage, path }: Body): string {
  return [
    'Explain, in plain English for a city emergency planner, why the last item in this chain fails.',
    `Context: a simulated flood scenario in ${city}, river stage ${fmt(stage)} m. This is a simulation, not a forecast.`,
    'The chain, from root cause to the failure being explained (use ONLY these facts, add no other numbers, places or dependencies):',
    ...path.map((s, i) => `${i + 1}. ${s.name} (${s.kind}) ${s.how}; fails ${hours(s.at)}.`),
    'Write 2 to 4 short sentences. No markdown, no bullet points, no emoji. Mention the timing. Do not speculate beyond the chain.',
  ].join('\n');
}

function validate(raw: unknown): Body {
  const b = raw as Partial<Body>;
  const str = (s: unknown, max = 120) => {
    if (typeof s !== 'string' || !s.trim()) throw new Error('missing text field');
    return s.replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
  };
  if (!b || !Array.isArray(b.path) || b.path.length < 1 || b.path.length > 15) throw new Error('path must have 1 to 15 steps');
  const stage = Number(b.stage);
  if (!Number.isFinite(stage) || stage < 0 || stage > 50) throw new Error('bad stage');
  return {
    city: str(b.city, 40),
    stage,
    path: b.path.map((s) => ({
      name: str(s?.name), kind: str(s?.kind, 30), how: str(s?.how, 160),
      at: typeof s?.at === 'number' && Number.isFinite(s.at) && s.at >= 0 && s.at <= 1000 ? s.at : null,
    })),
  };
}
