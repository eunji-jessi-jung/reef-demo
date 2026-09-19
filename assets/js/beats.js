/* reef demo — the landing scenes.
 *
 * Scroll advances a scene; it does not reveal a paragraph. Every figure and quotation
 * comes from data/evidence.json, which tools/build-evidence.py extracts from the three
 * published repositories — it runs the grep for real and sums the CSV for real. Nothing
 * here is prose typed by hand.
 */
import { boot, state, t, copyVars } from './site.js?v=4454c13f';
import { mountChat } from './chat.js?v=76953645';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c]));
const num = n => Number(n).toLocaleString('en-US');
const once = new Set();

function figures(host, items) {
  host.innerHTML = items.map(([v, label, cls = '']) =>
    `<div class="figure ${cls}"><b>${v}</b><span>${esc(label)}</span></div>`).join('');
}

/* ② the two searches, revealed one at a time so the agreement lands as a discovery */
function sceneSearch(ev) {
  const beat = $('#search');
  const w = ev.fixture.wiki, v = ev.fixture.v1;
  const bodies = {
    doc: { html: w.body.map(l => `<p>${esc(l)}</p>`).join(''), src: `${w.file} · ${w.meta}` },
    code: { html: esc(v.check), src: v.file },
  };
  $$('.find-btn', beat).forEach(btn => btn.addEventListener('click', () => {
    const which = btn.dataset.find;
    const panel = $(`.find-panel[data-panel="${which}"]`, beat);
    panel.hidden = false;
    btn.disabled = true;
    $('.find-body', panel).innerHTML = bodies[which].html;
    $('.src', panel).textContent = bodies[which].src;
    if ($$('.find-panel:not([hidden])', beat).length === 2) beat.dataset.both = 'true';
  }));
}

/* ④ the reveal. Types the grep, prints its five self-referential hits, then the punch. */
function sceneReveal(ev) {
  const term = $('#b4-term'), punch = $('#b4-punch'), reef = $('#b4-reef');
  const g = ev.fixture.grep;
  const lines = [`$ ${g.command}`, ...g.hits];

  const finish = () => {
    term.textContent = lines.join('\n');
    punch.textContent = t('b4.punch');
    punch.hidden = false;
    $('.find-body', reef).innerHTML = `<p>${esc(ev.reef.resolution.text.replace(/\*\*/g, ''))}</p>`;
    $('.src', reef).textContent = `${ev.reef.resolution.artifact} · ${ev.reef.resolution.file}`;
    reef.hidden = false;
  };

  const play = () => {
    if (once.has('reveal')) return;
    once.add('reveal');
    let i = 0;
    term.textContent = '';
    const tick = () => {
      if (i >= lines.length) return finish();
      term.textContent += (i ? '\n' : '') + lines[i++];
      setTimeout(tick, i === 1 ? 420 : 200);
    };
    tick();
  };

  $('#reveal').addEventListener('reef:enter', play);
  term.addEventListener('click', () => { once.add('reveal'); finish(); });
}

/* ⑤ nine hops, stepped. The point is where it stops, so stopping is the interaction. */
function scenePath(ev) {
  const list = $('#b5-hops'), counter = $('#b5-counter'), punch = $('#b5-punch');
  const hops = ev.reef.hops, breaks = ev.reef.breaks;
  const breakAfter = { 6: breaks.slice(0, 2), 7: [breaks[2]], 8: [breaks[3]] };
  let shown = 0;

  list.innerHTML = hops.map(([n, where, what, writes, tx]) => {
    const dead = /never executes|does not read/i.test(tx) || /never executes/i.test(writes);
    const after = (breakAfter[Number(n)] || [])
      .map(b => `<p class="brk">✕ ${esc(t('b5.breaks', { n: b.n }).replace(/\d+/, b.n))} — ${esc(b.label)}</p>`)
      .join('');
    return `<li class="hop${dead ? ' hop-dead' : ''}" data-n="${n}" hidden>
      <span class="hop-n">${n}</span>
      <div><b>${where}</b><span class="hop-what">${esc(writes)}</span>
      <span class="src">${esc(tx)}</span>${after}</div></li>`;
  }).join('');

  const sync = () => {
    $$('.hop', list).forEach((li, i) => { li.hidden = i >= shown; });
    counter.textContent = `${shown} / ${hops.length} ${t('b5.hop')}`;
    punch.hidden = shown < hops.length;
    $('#b5-next').disabled = shown >= hops.length;
  };
  const step = () => { if (shown < hops.length) { shown++; sync(); } };

  $('#b5-next').addEventListener('click', step);
  $('#b5-replay').addEventListener('click', () => { shown = 0; sync(); });
  $('#path').addEventListener('reef:enter', () => {
    if (once.has('path')) return;
    once.add('path');
    const iv = setInterval(() => { step(); if (shown >= 6) clearInterval(iv); }, 260);
  });
  sync();
}

/* ⑥ the backlog, and immediately the reef's own refusal to call it an exposure */
function sceneBacklog(ev) {
  const b = ev.fixture.backlog;
  figures($('#b6-figures'), [
    [num(b.rows), t('b6.rows')],
    [num(b.amount) + ' KRW', t('b6.amount'), 'figure-warn'],
    [b.months, t('b6.months')],
  ]);

  const svg = $('#b6-chart'), max = Math.max(...b.series.map(s => s[1]));
  const w = 820 / b.series.length;
  svg.innerHTML = b.series.map(([m, v], i) => {
    const h = (v / max) * 104;
    return `<rect x="${(i * w).toFixed(1)}" y="${(112 - h).toFixed(1)}" width="${(w - 1.6).toFixed(1)}"
      height="${h.toFixed(1)}" rx="1"><title>${m} — ${v}</title></rect>`;
  }).join('');

  const cav = $('#b6-caveat');
  const mp = (state.digest?.items || []).find(a => a.id === 'RISK-SETTLEMENT-RECON-BACKLOG');
  const line = mp?.unknowns?.[0] || mp?.facts?.find(f => /45,760|estimate/i.test(f.c))?.c;
  $('.find-body', cav).innerHTML =
    `<p>${esc(line || '')}</p><p class="src">RISK-SETTLEMENT-RECON-BACKLOG</p>`;
}

function sceneEvaluation(ev) {
  const e = ev.evaluation;
  figures($('#b7-figures'), [
    [`${e.answered} / ${e.questions}`, t('b7.answered'), 'figure-good'],
    [`${e.fragments_recovered} / ${e.fragments_total}`, t('b7.fragments'), 'figure-good'],
    [e.self_understated, t('b7.under')],
    [e.self_overstated, t('b7.over')],
  ]);
  $('#b7-method').textContent = e.method;
}

function sceneLoop(ev) {
  figures($('#b8-figures'), [
    [ev.loop.changed_files, t('b8.changed')],
    [ev.loop.artifacts_gone_false, t('b8.false'), 'figure-warn'],
    [ev.loop.artifacts_refreshed, t('b8.refreshed'), 'figure-good'],
  ]);
}

function sceneUnknowns(ev) {
  figures($('#b9-figures'), [
    [num(ev.reef.counts.unknowns), t('b9.unknowns')],
    [ev.reef.counts.owner_questions, t('b9.questions'), 'figure-good'],
  ]);
  const q = ev.owner_question;
  if (!q) return;
  const body = q.body.split(/\n{2,}/).slice(0, 4)
    .map(p => `<p>${esc(p.replace(/\n/g, ' ')).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')}</p>`).join('');
  $('.find-body', $('#b9-sample')).innerHTML =
    `<p class="owner-head">${esc(q.heading)}</p>${body}`;
}

function sceneVerify(ev) {
  const r = ev.repos;
  $('#b10-clone').textContent =
    `git clone ${r.fixture}.git\ngit clone ${r.reef}.git\n` +
    `\n# the reef's claims, against the fixture's own grading key\n` +
    `open sellflow-reef/ANSWER-KEY.md`;
  $('#b10-links').innerHTML = Object.entries(r)
    .map(([k, url]) => `<a class="repo-link" href="${url}" target="_blank" rel="noopener">${k} ↗</a>`).join('');
}

let wired = false;
function render() {
  const ev = state.ev;
  if (!ev) return;
  sceneBacklog(ev); sceneEvaluation(ev); sceneLoop(ev); sceneUnknowns(ev); sceneVerify(ev);
  if (!wired) { wired = true; sceneSearch(ev); sceneReveal(ev); scenePath(ev); }
}

boot(render);
const chatRoot = $('#ask');
if (chatRoot) mountChat(chatRoot);
