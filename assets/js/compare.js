/* reef demo — the comparison.
 *
 * One question goes to two arms of the proxy and comes back as two answers, rendered
 * side by side. The arms are held equal in every respect the browser can see and every
 * respect it cannot: same model, same effort, same token ceiling, rules written line
 * for line against each other. One holds the reef's artifacts; the other holds the
 * sellflow sources. That is the whole experiment.
 *
 * Both sides' citations are clickable, and that is the point of the page. A reef
 * citation opens the artifact and what it says it does not know; a source citation
 * opens the actual file on GitHub. Neither side gets to be believed.
 *
 * If the proxy is absent, over budget or unreachable, the page falls back to recorded
 * runs from data/qa.json and says so. It never arrives at a broken state.
 */
import { state, t, boot, esc, copyVars, applyI18n } from './site.js?v=c69a150e';

const API = window.REEF_API || '';
const ARMS = ['reef', 'raw'];

let live = Boolean(API);
let offlineKey = 'chat.offline';
const history = { reef: [], raw: [] };
let el = {};
let seq = 0;

/* ---------- citations ---------- */

/* A source path as the raw arm cites it — `order-service:src/...` — resolved to the
   file on GitHub. Everything the no-reef arm was given lives in the fixture repository
   and nowhere else, which is what makes it a control arm: code under repos/, the
   company's documents under sources/. */
function sourceUrl(path) {
  const fixture = state.ev?.repos?.fixture;
  const [group, rest] = path.split(/:(.+)/);
  if (!rest || !fixture) return null;
  return group === 'sellflow-docs'
    ? `${fixture}/blob/main/sources/${rest}`
    : `${fixture}/blob/main/repos/${group}/${rest}`;
}

function knownIds() {
  return new Set((state.digest?.items || []).map(a => a.id));
}

function knownPaths() {
  const out = new Set();
  (state.sources?.groups || []).forEach(g => g.paths.forEach(p => out.add(`${g.name}:${p}`)));
  return out;
}

/* Render an answer: paragraphs, inline code, and citation chips. One bracket can hold
   several references and not all of them resolve — chip the ones that do, leave the
   rest as plain text rather than inventing a link. */
function renderAnswer(arm, text) {
  const known = arm === 'reef' ? knownIds() : knownPaths();
  const chip = ref => arm === 'reef'
    ? `<button class="cite" data-artifact="${esc(ref)}">${esc(ref)}</button>`
    : `<a class="cite" href="${esc(sourceUrl(ref))}" target="_blank" rel="noopener">${esc(shorten(ref))}</a>`;

  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\n]+)\]/g, (m, inner) => {
      const parts = inner.split(/[,;]/).map(s => s.trim());
      if (!parts.some(p => known.has(p))) return m;
      return parts.map(p => known.has(p) ? chip(p) : `<span class="cite-plain">${esc(p)}</span>`).join(' ');
    })
    .split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/* Java package paths are long enough to break the layout on a phone. The full path is
   kept in the link's title and in the href, so nothing is hidden — only shortened. */
function shorten(path) {
  const [group, rest] = path.split(/:(.+)/);
  if (!rest) return path;
  const tail = rest.split('/').slice(-1)[0];
  return `${group}:${tail}`;
}

/* ---------- the two panels ---------- */

function armPanel(arm, id) {
  const label = arm === 'reef' ? 'T.armReef' : 'T.armRaw';
  const note = arm === 'reef' ? 'T.armReefNote' : 'T.armRawNote';
  return `<figure class="panel arm arm-${arm}" id="${id}-${arm}">
    <figcaption class="arm-head">
      <b>${esc(t(label))}</b>
      <span class="meta">${esc(t(note, copyVars()))}</span>
    </figcaption>
    <div class="arm-body"><p class="thinking">···</p></div>
    <p class="arm-meta"></p>
  </figure>`;
}

function addRow(question) {
  const id = `cmp${++seq}`;
  const row = document.createElement('div');
  row.className = 'cmp-row';
  row.innerHTML = `<p class="cmp-q"><span class="q-mark">?</span>${esc(question)}</p>
    <div class="cmp-arms">${ARMS.map(a => armPanel(a, id)).join('')}</div>`;
  el.compare.prepend(row);
  return id;
}

function fill(id, arm, html, meta) {
  const panel = document.getElementById(`${id}-${arm}`);
  if (!panel) return;
  panel.querySelector('.arm-body').innerHTML = html;
  panel.querySelector('.arm-meta').textContent = meta || '';
}

/* ---------- asking ---------- */

async function ask(question) {
  const id = addRow(question);
  if (live) return askLive(id, question);
  return askRecorded(id, question);
}

/* The fallback. A recorded pair is a real run that was saved, so it is labelled as one
   and never as a live answer. A question with no recorded pair gets an honest blank. */
function askRecorded(id, question) {
  const item = (state.qa?.items || []).find(it => it.q.ko === question || it.q.en === question);
  for (const arm of ARMS) {
    const text = arm === 'reef'
      ? item?.a?.[state.lang] || item?.a?.ko
      : item?.a_raw?.[state.lang] || item?.a_raw?.ko;
    fill(id, arm,
      text ? renderAnswer(arm, text) : `<p class="muted">${esc(t('chat.offline'))}</p>`,
      text ? t('T.recorded', copyVars()) : '');
  }
}

async function askLive(id, question) {
  el.form?.setAttribute('aria-busy', 'true');
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        question,
        arms: ARMS,
        histories: { reef: history.reef.slice(-6), raw: history.raw.slice(-6) },
      }),
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      /* Budget spent or key missing: stop offering the box, and show what was recorded
         instead of failing twice. */
      if (['budget_spent', 'not_configured'].includes(data.error)) {
        live = false;
        offlineKey = data.error === 'budget_spent' ? 'chat.spent' : 'chat.offline';
      }
      askRecorded(id, question);
      if (!live) syncInput();
      return;
    }

    for (const arm of ARMS) {
      const res = data.arms?.[arm];
      if (!res || res.error) {
        fill(id, arm, `<p class="muted">${esc(t('T.armFail'))}</p>`, res?.error || '');
        continue;
      }
      history[arm].push({ role: 'user', content: question },
                        { role: 'assistant', content: res.answer });
      const usage = res.usage || {};
      const ctx = (usage.cache_read_input_tokens || 0) + (usage.input_tokens || 0)
                + (usage.cache_creation_input_tokens || 0);
      fill(id, arm, renderAnswer(arm, res.answer),
        `${data.model} · ${t('chat.live')}${ctx ? ` · ${Math.round(ctx / 1000)}K tok` : ''}`);
    }
  } catch {
    live = false;
    askRecorded(id, question);
    syncInput();
  } finally {
    el.form?.removeAttribute('aria-busy');
  }
}

/* ---------- the artifact panel ---------- */

function openArtifact(id) {
  const a = (state.digest?.items || []).find(x => x.id === id);
  el.panelTitle.textContent = id + (a ? ` — ${a.title}` : '');
  el.panelBody.innerHTML = a
    ? `<p class="tag">${a.type} · ${a.status} · verified ${a.verified}</p>`
      + '<ul>' + a.facts.map(f =>
          `<li>${esc(f.c)}${f.s ? ` <span class="src">${esc(f.s)}</span>` : ''}</li>`).join('') + '</ul>'
      + (a.unknowns?.length
          ? `<p class="tag">${esc(t('chat.unknowns'))}</p><ul>`
            + a.unknowns.map(u => `<li>${esc(u)}</li>`).join('') + '</ul>'
          : '')
    : `<p>${esc(id)}</p>`;
  el.panelLink.href = `${state.ev?.repos?.reef}/tree/main/artifacts`;
  el.panel.hidden = false;
}

/* ---------- the page around it ---------- */

function chips() {
  el.chips.innerHTML = '';
  (state.qa?.items || []).forEach(it => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = it.q[state.lang] || it.q.ko;
    b.addEventListener('click', () => ask(b.textContent));
    el.chips.append(b);
  });
}

/* The source inventory, rendered from the manifest tools/build-corpus.py writes. The
   page cannot claim the no-reef arm was given something it was not. */
function renderSources() {
  const groups = state.sources?.groups || [];
  el.srcGrid.innerHTML = groups.map(g => {
    const isDocs = g.name === 'sellflow-docs';
    return `<div class="src-card${isDocs ? ' is-docs' : ''}">
      <p class="src-name"><code>${esc(g.name)}</code><b>${g.n}</b></p>
      <p class="src-kind">${esc(t(isDocs ? 'T.srcDocs' : 'T.srcCode'))}</p>
      <details><summary>${esc(t('T.srcList'))}</summary>
        <ul>${g.paths.map(p => `<li><code>${esc(p)}</code></li>`).join('')}</ul>
      </details>
    </div>`;
  }).join('');
  el.srcExcluded.innerHTML = (state.sources?.excluded || [])
    .map(x => `<li><code>${esc(x)}</code></li>`).join('');
}

function syncInput() {
  if (el.form) el.form.hidden = !live;
  if (el.offline) {
    el.offline.hidden = live;
    el.offline.textContent = t(offlineKey);
  }
}

async function mount() {
  const base = document.body.dataset.base || '.';
  state.qa = await fetch(`${base}/data/qa.json`, { cache: 'no-cache' })
    .then(r => r.json()).catch(() => ({ items: [] }));

  el = {
    chips: document.getElementById('chips'),
    form: document.getElementById('ask-form'),
    input: document.querySelector('#ask-form .chat-input'),
    offline: document.getElementById('ask-offline'),
    compare: document.getElementById('compare'),
    srcGrid: document.getElementById('src-grid'),
    srcExcluded: document.getElementById('src-excluded'),
    panel: document.getElementById('artifact'),
    panelTitle: document.querySelector('#artifact .artifact-title'),
    panelBody: document.querySelector('#artifact .artifact-body'),
    panelLink: document.querySelector('#artifact .artifact-link'),
  };

  chips();
  renderSources();
  syncInput();
  /* qa.json arrives after the shell has filled the copy, and it carries the measured
     context sizes, so the strings that quote them are refilled once it is in. */
  applyI18n();

  el.form?.addEventListener('submit', e => {
    e.preventDefault();
    const v = el.input.value.trim();
    if (!v) return;
    el.input.value = '';
    ask(v);
  });

  document.addEventListener('click', e => {
    const c = e.target.closest('button.cite');
    if (c) openArtifact(c.dataset.artifact);
    if (e.target.closest('.artifact-close')) el.panel.hidden = true;
  });
}

/* The shell loads the data first; everything here reads it. Chips and the inventory
   are language-dependent and re-render on a language change, but answers already on
   screen are left alone — each was answered in the language it was asked in, and
   re-translating one would be a new claim, not a translation. */
(async () => {
  await boot();
  await mount();
  document.addEventListener('reef:lang', () => { chips(); renderSources(); });
})();
