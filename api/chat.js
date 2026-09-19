/**
 * Chat proxy for the reef demo.
 *
 * The site is static and public, so the API key cannot live in it. This function
 * holds the key, holds the corpus, and is the only thing that talks to Anthropic.
 * The browser sends a question and nothing else — it cannot choose the model, the
 * system prompt, the token budget, or the context. That keeps the abuse surface at
 * "ask a question about sellflow" rather than "free LLM".
 *
 * Every limit below is a hard number so the worst case is arithmetic, not a guess.
 */

import digest from '../data/digest.json' with { type: 'json' };

/* Sonnet by default. The hard part of this task is not reasoning depth — it is
   refusing to smooth over an unknown, and keeping "proven by absence" distinct from
   "inferred". That is where a smaller model gives way, and a confidently wrong answer
   here would refute the very claim the demo makes. At this traffic the difference
   against Haiku is well under a dollar. Override to compare: REEF_MODEL. */
const MODEL         = process.env.REEF_MODEL || 'claude-sonnet-5';
/* Sonnet 5 thinks adaptively and defaults to high effort, which on a 700-token
   ceiling spent the whole budget on reasoning and returned an empty answer. This
   job is grounded extraction with citations, not deep reasoning, so low effort is
   right: the model mostly skips thinking, and the ceiling leaves room when it
   doesn't. Changing either invalidates the prompt cache once. */
const MAX_TOKENS    = 2000;   // Korean costs roughly 3x English per word
const EFFORT        = process.env.REEF_EFFORT || 'low';
const MAX_QUESTION  = 500;    // characters
const MAX_TURNS     = 6;      // prior messages carried
const MAX_HISTORY   = 4000;   // characters of history
const WINDOW_MS     = 60_000;
const PER_IP_WINDOW = 6;
const BUDGET        = Number(process.env.REEF_REQUEST_BUDGET || 400);

const ALLOWED = (process.env.REEF_ALLOWED_ORIGINS ||
  ['https://eunji-jessi-jung.github.io',      // the published site
   'https://reef-demo-delta.vercel.app',      // the copy Vercel serves alongside the function
   'http://localhost:4173', 'http://127.0.0.1:4173'].join(','))
  .split(',').map(s => s.trim());

/* In-memory only. A serverless instance may be recycled, so this throttles a burst
   from one client rather than enforcing a global total — REEF_REQUEST_BUDGET is the
   backstop, and the site falls back to its prepared answers when it is spent. */
const hits = new Map();
let spent = 0;

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > PER_IP_WINDOW;
}

function systemPrompt() {
  const lines = digest.items.map(a => {
    const head = `### ${a.id} — ${a.title} [${a.type}, ${a.status}, verified ${a.verified}]`;
    const facts = a.facts.map(f => `- ${f.c}${f.s ? ` (${f.s})` : ''}`).join('\n');
    const unk = a.unknowns?.length
      ? '\nNot determinable from the sources:\n' + a.unknowns.map(u => `- ${u}`).join('\n')
      : '';
    return `${head}\n${facts}${unk}`;
  }).join('\n\n');

  return `You are answering questions about 셀플로우 (Sellflow), a fictional Korean e-commerce
fulfilment company, using a reef — a structured knowledge layer built from its five
repositories and its internal documents. The reef's ${digest.artifacts} artifacts are below.

RULES
1. Answer ONLY from the artifacts below. You have no other knowledge of this company.
2. Cite every substantive claim with the artifact id in square brackets, e.g. [SYS-ORDER].
   Use ids exactly as written. Never invent one.
3. If the artifacts do not settle something, say so plainly and point at the relevant
   "Not determinable" note. Saying "the reef does not know" is a correct answer here and
   is more useful than a confident guess.
4. Distinguish what is proven by code, what is proven by data, what is proven by an
   absence (a grep that returns nothing is evidence), and what is inferred. The artifacts
   make these distinctions; preserve them.
5. Keep Korean identifiers and quoted Korean text verbatim — SANGTAE_CD, CHWISO,
   CancelReconciler, 정산 — and gloss them when answering in English.
6. Be brief. At most four short paragraphs, and never more than about 200 words of
   English or 450 characters of Korean. This renders in a chat bubble, and an answer
   that runs past the limit is cut off mid-sentence. Lead with the answer, then the
   evidence; if there is more to say, stop and say what you left out in one clause.
7. Answer in the language of the question.
8. If asked something unrelated to this company or this codebase, say that is outside
   what this reef covers, and do not answer it.

THE REEF
${lines}`;
}

let cachedSystem = null;

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (origin && !ALLOWED.includes(origin)) return res.status(403).json({ error: 'origin_not_allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });

  if (spent >= BUDGET) return res.status(429).json({ error: 'budget_spent' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'rate_limited' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const question = String(body.question || '').trim().slice(0, MAX_QUESTION);
  if (!question) return res.status(400).json({ error: 'empty_question' });

  let history = Array.isArray(body.history) ? body.history.slice(-MAX_TURNS) : [];
  let budget = MAX_HISTORY;
  history = history
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .reverse()
    .filter(m => (budget -= m.content.length) > 0)
    .reverse()
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));

  cachedSystem ??= systemPrompt();

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: cachedSystem, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: EFFORT },
        messages: [...history, { role: 'user', content: question }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('anthropic_error', r.status, detail.slice(0, 500));
      return res.status(502).json({ error: 'upstream_error', status: r.status });
    }

    const data = await r.json();
    spent += 1;
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    if (!text) {
      console.error('empty_answer', JSON.stringify(data.usage), data.stop_reason);
      return res.status(502).json({ error: 'empty_answer', stop_reason: data.stop_reason });
    }
    /* A bracket may hold several references, and not all of them are artifacts —
       the model also cites source files by name. Take every token inside every
       bracket, keep the ones that resolve to an artifact, drop the rest. */
    const known = new Set(digest.items.map(a => a.id));
    const cites = [...new Set([...text.matchAll(/\[([^\]\n]+)\]/g)]
      .flatMap(m => m[1].split(/[,;]/))
      .map(t => t.trim())
      .filter(t => known.has(t)))];

    return res.status(200).json({
      answer: text,
      cites,
      model: MODEL,
      usage: data.usage,
      remaining: Math.max(0, BUDGET - spent),
    });
  } catch (e) {
    console.error('proxy_error', e);
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
}
