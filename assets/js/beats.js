/* reef demo — landing page scenes.
   Every fact rendered here comes from data/evidence.json, which was extracted
   from the three published repositories. Nothing is hard-coded prose. */

import { boot, state, t } from './site.js';
import { mountChat } from './chat.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const num = n => n.toLocaleString('en-US');

function render() {
  const ev = state.ev;
  if (!ev) return;

  // ④ grep — the proof by absence
  const g = $('#b4-grep');
  if (g) g.innerHTML =
    `<span class="meta">$ ${esc(ev.fixture.grep.command)}</span>\n` +
    ev.fixture.grep.hits.map(h => esc(h)).join('\n');

  // ⑥ backlog
  const b = ev.fixture.backlog;
  const bt = $('#b6-total');
  if (bt) bt.textContent = `${num(b.rows)} · ${num(b.amount)} KRW · ${b.months}`;

  // ⑦ evaluation
  const e = ev.evaluation;
  const sc = $('#b7-score');
  if (sc) sc.textContent = `${e.answered} / ${e.questions}  ·  ${e.fragments_recovered} / ${e.fragments_total}`;

  // ⑧ loop
  const lp = $('#b8-loop');
  if (lp) lp.textContent = `${ev.loop.changed_files} → ${ev.loop.artifacts_gone_false} → ${ev.loop.artifacts_refreshed}`;

  // ⑨ unknowns
  const u = $('#b9-counts');
  if (u) u.textContent = `${ev.reef.counts.unknowns} → ${ev.reef.counts.owner_questions}`;
}

boot(render);

const chatRoot = document.querySelector('#ask');
if (chatRoot) mountChat(chatRoot);
