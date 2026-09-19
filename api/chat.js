/**
 * Chat proxy for the reef demo — two arms of one comparison.
 *
 * The site is static and public, so the API key cannot live in it. This function
 * holds the key, holds both corpora, and is the only thing that talks to Anthropic.
 * The browser sends a question and which arms to run — nothing else. It cannot choose
 * the model, the system prompt, the token budget, or the context. That keeps the abuse
 * surface at "ask a question about sellflow" rather than "free LLM".
 *
 * THE TWO ARMS
 *
 *   reef — the 80 artifacts: claims with citations, explicit unknowns, recorded
 *          contradictions. ~67K tokens.
 *   raw  — the sellflow sources as an agent without a reef sees them: five code
 *          repositories and the whole document tree. ~60K tokens.
 *
 * Everything else is held equal on purpose: same model, same effort, same token
 * ceiling, and rules written line-for-line against each other. The raw arm gets no
 * hint about what it will find; writing one would be coaching from the answer key.
 * The reef arm gets slightly MORE context than the raw arm, not less, because a reef
 * is not a summary — it adds what was worked out, so it is bigger than its sources.
 *
 * Every limit below is a hard number so the worst case is arithmetic, not a guess.
 */

import digest from '../data/digest.json' with { type: 'json' };
import corpus from '../data/corpus.json' with { type: 'json' };

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
const MAX_TURNS     = 6;      // prior messages carried, per arm
const MAX_HISTORY   = 4000;   // characters of history, per arm
const WINDOW_MS      = 60_000;
/* Per caller, per window — one hit per HTTP request, not per model call, so this
   reads the way the number sounds: 5 questions a minute. A question against both
   arms (the default) is still 2 Anthropic calls, so the true worst case is
   PER_IP_LIMIT * 2 model calls/minute/IP — bounded, just not 1:1 with this number. */
const PER_IP_LIMIT   = Number(process.env.REEF_RATE_LIMIT_PER_MIN || 5);
const BUDGET         = Number(process.env.REEF_REQUEST_BUDGET || 400);

const ARMS = ['reef', 'raw'];

const ALLOWED = (process.env.REEF_ALLOWED_ORIGINS ||
  ['https://eunji-jessi-jung.github.io',      // the published site
   'https://reef-demo-delta.vercel.app',      // the copy Vercel serves alongside the function
   'http://localhost:4173', 'http://127.0.0.1:4173'].join(','))
  .split(',').map(s => s.trim());

/* In-memory only. A serverless instance may be recycled, and a burst of concurrent
   requests can land on more than one warm instance, so this throttles a burst from
   one client rather than enforcing an exact global count — it will occasionally let
   a request or two more than PER_IP_LIMIT through under real concurrency. The two
   things that do hold exactly, regardless: REEF_REQUEST_BUDGET (the shared spend
   ceiling this counts toward) and the $200/month cap set in the Anthropic console,
   which is the one backstop nothing here can be wrong about. */
const hits = new Map();
let spent = 0;

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return recent.length > PER_IP_LIMIT;
}

/* The rules both arms are given. They differ only in how a claim is cited, because
   that is the only thing that actually differs between the two kinds of material. */
function rules(citeInstruction, undeterminedInstruction) {
  return `RULES
1. Answer ONLY from the material below. You have no other knowledge of this company.
2. ${citeInstruction}
3. ${undeterminedInstruction}
4. Distinguish what is proven by code, what is proven by data, what is proven by an
   absence (a grep that returns nothing is evidence), and what is inferred.
5. Keep Korean identifiers and quoted Korean text verbatim — SANGTAE_CD, CHWISO,
   CancelReconciler, 정산 — and gloss them when answering in English.
6. Be brief. At most four short paragraphs, and never more than about 200 words of
   English or 450 characters of Korean. This renders in a chat bubble, and an answer
   that runs past the limit is cut off mid-sentence. Lead with the answer, then the
   evidence; if there is more to say, stop and say what you left out in one clause.
7. Answer in the language of the question.
8. If asked something unrelated to this company or this codebase, say that is outside
   what this material covers, and do not answer it.`;
}

function reefSystem() {
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

${rules(
  `Cite every substantive claim with the artifact id in square brackets, e.g. [SYS-ORDER].
   Use ids exactly as written. Never invent one.`,
  `If the artifacts do not settle something, say so plainly and point at the relevant
   "Not determinable" note. Saying "the reef does not know" is a correct answer here and
   is more useful than a confident guess.`)}

THE REEF
${lines}`;
}

function rawSystem() {
  const lines = corpus.files
    .map(f => `### ${f.path}\n${f.text}`)
    .join('\n\n');

  return `You are answering questions about 셀플로우 (Sellflow), a fictional Korean e-commerce
fulfilment company. Below are its complete sources: ${corpus.files_n} files — five code
repositories and the company's own documents (a wiki export, its published OpenAPI spec,
Slack history, mail, meeting minutes, a handover, an incident postmortem, tickets, sprint
records, a service registry, business rules, an org chart, procedure documents, and a
data export). This is everything. No summary, index or prior analysis has been prepared
for you.

${rules(
  `Cite every substantive claim with the file path in square brackets, exactly as it
   appears in the headings below, e.g. [order-service:src/main/java/kr/co/sellflow/order/service/OrderCancelService.java].
   Use paths exactly as written. Never invent one.`,
  `If the sources do not settle something, say so plainly rather than guessing. Saying
   you cannot determine it from these sources is a correct answer here and is more
   useful than a confident guess.`)}

THE SOURCES
${lines}`;
}

/* Built once per instance and cached upstream by Anthropic, so the 60-67K tokens of
   context are paid for at the cache-read rate after the first call of each arm. */
const built = { reef: null, raw: null };
const system = arm => (built[arm] ??= arm === 'reef' ? reefSystem() : rawSystem());

/* What each arm is allowed to have cited. A bracket may hold several references, and
   not all of them resolve — the model sometimes names something not in its material.
   Take every token inside every bracket, keep the ones that resolve, drop the rest. */
const vocabulary = { reef: null, raw: null };
const vocab = arm => (vocabulary[arm] ??= new Set(
  arm === 'reef' ? digest.items.map(a => a.id) : corpus.files.map(f => f.path)));

function extractCites(arm, text) {
  const known = vocab(arm);
  return [...new Set([...text.matchAll(/\[([^\]\n]+)\]/g)]
    .flatMap(m => m[1].split(/[,;]/))
    .map(t => t.trim())
    .filter(t => known.has(t)))];
}

function trimHistory(raw) {
  let budget = MAX_HISTORY;
  return (Array.isArray(raw) ? raw.slice(-MAX_TURNS) : [])
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .reverse()
    .filter(m => (budget -= m.content.length) > 0)
    .reverse()
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
}

const LANG_RULE = {
  en: 'Answer in English. Keep Korean identifiers and quoted Korean source text as they are.',
  ko: '한국어로 답하십시오.',
};

async function ask(arm, question, history, lang) {
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
      system: [{ type: 'text', text: system(arm), cache_control: { type: 'ephemeral' } }],
      output_config: { effort: EFFORT },
      messages: [...history, {
        role: 'user',
        content: lang ? `${question}\n\n${LANG_RULE[lang]}` : question,
      }],
    }),
  });

  if (!r.ok) {
    const detail = await r.text();
    console.error('anthropic_error', arm, r.status, detail.slice(0, 500));
    return { arm, error: 'upstream_error', status: r.status };
  }

  const data = await r.json();
  const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
  if (!text) {
    console.error('empty_answer', arm, JSON.stringify(data.usage), data.stop_reason);
    return { arm, error: 'empty_answer', stop_reason: data.stop_reason };
  }
  return { arm, answer: text, cites: extractCites(arm, text), usage: data.usage };
}

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

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const question = String(body.question || '').trim().slice(0, MAX_QUESTION);
  if (!question) return res.status(400).json({ error: 'empty_question' });

  /* Which language the answer must be in. Rule 7 asks the model to follow the
     question, and on a Korean-heavy corpus it does not reliably: three of eight
     recorded English pairs came back in Korean. So the caller states it, and the
     instruction rides with the question instead of the system prompt, which keeps
     the prompt cache to one entry per arm. */
  const lang = body.lang === 'en' ? 'en' : body.lang === 'ko' ? 'ko' : null;

  /* Default to the reef arm alone. The comparison page asks for both. */
  const asked = Array.isArray(body.arms) ? body.arms : ['reef'];
  const arms = ARMS.filter(a => asked.includes(a));
  if (!arms.length) return res.status(400).json({ error: 'no_arm' });

  if (spent + arms.length > BUDGET) return res.status(429).json({ error: 'budget_spent' });
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'rate_limited' });
  }

  /* Each arm carries its own conversation, because the two diverge immediately.
     A bare `history` array is accepted as the reef arm's, for older callers. */
  const histories = (body.histories && typeof body.histories === 'object') ? body.histories : {};
  const historyFor = arm => trimHistory(
    histories[arm] ?? (arm === 'reef' ? body.history : undefined));

  try {
    const results = await Promise.all(arms.map(a => ask(a, question, historyFor(a), lang)));
    spent += results.filter(r => !r.error).length;

    const out = {};
    for (const r of results) out[r.arm] = r;
    /* One arm failing must not take the page down — it renders what came back and
       says what did not. Only a total failure is an error. */
    if (results.every(r => r.error)) {
      return res.status(502).json({ error: results[0].error, arms: out });
    }
    return res.status(200).json({
      arms: out,
      model: MODEL,
      remaining: Math.max(0, BUDGET - spent),
      /* Shown on the page so the comparison can be checked, not just believed. */
      context: { reef: `${digest.artifacts} artifacts`, raw: `${corpus.files_n} source files` },
    });
  } catch (e) {
    console.error('proxy_error', e);
    return res.status(502).json({ error: 'upstream_unreachable' });
  }
}
