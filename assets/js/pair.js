/* One question, two answers — the comparison, shared by the landing page and the
 * comparison page.
 *
 * It lives here rather than in compare.js because the landing page needs the same
 * thing without the chat around it: the strongest asset on the site is this pair, and
 * the references that do this well put the product in the first screen instead of
 * behind a click.
 *
 * Both arms' citations resolve and open. A reef citation opens the artifact and what
 * it says it does not know; a source citation opens the actual file on GitHub. Neither
 * side gets to be believed.
 */
import { state, t, esc, copyVars } from './site.js?v=c38408c3';

export const ARMS = ['reef', 'raw'];

/* Which directory each artifact type lives in, so a citation can open the file itself
   rather than the folder. Mirrors sellflow-reef/artifacts/. */
const ARTIFACT_DIR = {
  system: 'systems', schema: 'schemas', api: 'apis', process: 'processes',
  decision: 'decisions', glossary: 'glossary', contract: 'contracts',
  risk: 'risks', pattern: 'patterns',
};

export function artifactUrl(id) {
  const repo = state.ev?.repos?.reef;
  const a = (state.digest?.items || []).find(x => x.id === id);
  if (!repo) return null;
  const dir = a && ARTIFACT_DIR[a.type];
  return dir ? `${repo}/blob/main/artifacts/${dir}/${id.toLowerCase()}.md`
             : `${repo}/tree/main/artifacts`;
}

/* A source path as the raw arm cites it — `order-service:src/...` — resolved to the
   file on GitHub. Everything the no-reef arm was given lives in the fixture repository
   and nowhere else, which is what makes it a control arm: code under repos/, the
   company's documents under sources/. */
export function sourceUrl(path) {
  const fixture = state.ev?.repos?.fixture;
  const [group, rest] = path.split(/:(.+)/);
  if (!rest || !fixture) return null;
  return group === 'sellflow-docs'
    ? `${fixture}/blob/main/sources/${rest}`
    : `${fixture}/blob/main/repos/${group}/${rest}`;
}

/* Java package paths are long enough to break the layout on a phone. The full path
   stays in the href, so nothing is hidden — only shortened. */
export function shorten(path) {
  const [group, rest] = path.split(/:(.+)/);
  if (!rest) return path;
  return `${group}:${rest.split('/').slice(-1)[0]}`;
}

const knownIds = () => new Set((state.digest?.items || []).map(a => a.id));

function knownPaths() {
  const out = new Set();
  (state.sources?.groups || []).forEach(g => g.paths.forEach(p => out.add(`${g.name}:${p}`)));
  return out;
}

/* Render an answer: paragraphs, inline code, and citation chips. */
export function renderAnswer(arm, text) {
  const known = arm === 'reef' ? knownIds() : knownPaths();
  const chip = ref => arm === 'reef'
    ? `<button class="cite" data-artifact="${esc(ref)}">${esc(ref)}</button>`
    : `<a class="cite" href="${esc(sourceUrl(ref))}" target="_blank" rel="noopener">${esc(shorten(ref))}</a>`;

  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]\n]+)\]/g, (m, inner) => {
      /* A bracket holds one or more references, and a reference is not always alone in
         its slot: the model writes an id followed by prose, or by the source file in
         parentheses. Chip the reference and leave the rest as text, rather than
         dropping a citation that resolves. */
      const split = part => {
        if (known.has(part)) return [part, ''];
        const m2 = /^([A-Za-z0-9-]+)(.*)$/.exec(part);
        return m2 && known.has(m2[1]) ? [m2[1], m2[2]] : [null, part];
      };
      const parts = inner.split(/[,;]/).map(s => s.trim()).filter(Boolean).map(split);
      if (!parts.some(([ref]) => ref)) return m;
      return parts.map(([ref, rest]) => ref
        ? chip(ref) + (rest ? `<span class="cite-plain">${esc(rest)}</span>` : '')
        : `<span class="cite-plain">${esc(rest)}</span>`).join(' ');
    })
    /* Applied last, because the citation splitter escapes whatever is left over in a
       bracket and would turn these tags back into characters. A defined term in the
       artifact contract, and the one thing the side without a reef never says — marked
       where it already appears, never inserted. */
    .replace(/\b(not determinable)\b/gi, '<mark>$1</mark>')
    .split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

export function armPanel(arm, id) {
  const label = arm === 'reef' ? 'T.armReef' : 'T.armRaw';
  const note = arm === 'reef' ? 'T.armReefNote' : 'T.armRawNote';
  return `<figure class="panel arm arm-${arm}" id="${id}-${arm}">
    <figcaption class="arm-head">
      <b>${esc(t(label))}</b>
      <span class="meta">${esc(t(note, copyVars()))}</span>
    </figcaption>
    <div class="arm-body"><div class="thinking" role="status">
      <span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <span data-i18n="chat.thinking"></span>
      <span class="thinking-clock" aria-hidden="true"></span>
    </div></div>
    <p class="arm-meta"></p>
  </figure>`;
}

/* A live pair can take twenty seconds or more: the model reads eighty-odd thousand
   tokens before it says anything. Three animated dots alone still read as "stuck"
   once the wait runs past a few seconds, so each pending arm also counts the seconds
   it has been waiting — a number that keeps moving is the one unambiguous signal that
   the page is still working and not broken. */
const PENDING = new Map();

function startPending(panelId) {
  const clock = document.getElementById(panelId)?.querySelector('.thinking-clock');
  if (!clock) return;
  const t0 = Date.now();
  /* Silent for the first two seconds: a recorded pair fills instantly, and a counter
     that flashes "0s" on the way past is noise rather than feedback. */
  const tick = () => {
    const s = Math.round((Date.now() - t0) / 1000);
    clock.textContent = s >= 2 ? `${s}s` : '';
  };
  PENDING.set(panelId, setInterval(tick, 1000));
}

function stopPending(panelId) {
  clearInterval(PENDING.get(panelId));
  PENDING.delete(panelId);
}

/* Add an empty row to a host element and return its id, so the arms can be filled
   independently as each answer arrives. */
export function addRow(host, question, id) {
  const row = document.createElement('div');
  row.className = 'cmp-row';
  row.innerHTML = `<p class="cmp-q"><span class="q-mark">?</span>${esc(question)}</p>
    <div class="cmp-arms">${ARMS.map(a => armPanel(a, id)).join('')}</div>`;
  host.prepend(row);
  ARMS.forEach(arm => {
    const panel = document.getElementById(`${id}-${arm}`);
    panel?.setAttribute('aria-busy', 'true');
    /* The label is set through the same i18n pass as everything else, so a language
       switch mid-wait moves it too. */
    panel?.querySelectorAll('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
    startPending(`${id}-${arm}`);
  });
  return id;
}

export function fill(id, arm, html, meta) {
  const panel = document.getElementById(`${id}-${arm}`);
  if (!panel) return;
  stopPending(`${id}-${arm}`);
  panel.removeAttribute('aria-busy');
  panel.querySelector('.arm-body').innerHTML = html;
  panel.querySelector('.arm-meta').textContent = meta || '';
}

/* The shortest recorded pair. Used where the pair has to fit a fixed frame — the
   landing hero and the screenshots — so a long answer cannot run off the bottom. */
export function shortestPair(lang) {
  const len = it => Math.max((it.a?.[lang] || it.a?.ko || '').length,
                             (it.a_raw?.[lang] || it.a_raw?.ko || '').length);
  return [...(state.qa?.items || [])].sort((a, b) => len(a) - len(b))[0];
}

/* Render a recorded pair, labelled as recorded rather than live. */
export function fillRecorded(id, item, lang) {
  for (const arm of ARMS) {
    const text = arm === 'reef'
      ? item?.a?.[lang] || item?.a?.ko
      : item?.a_raw?.[lang] || item?.a_raw?.ko;
    fill(id, arm,
      text ? renderAnswer(arm, text) : `<p class="muted">${esc(t('chat.offline'))}</p>`,
      text ? t('T.recorded', copyVars()) : '');
  }
}

/* Wire the artifact panel once. Returns nothing; clicks anywhere in `root` on a reef
   citation open it. */
export function wireArtifactPanel(root, panel) {
  if (!panel) return;
  const title = panel.querySelector('.artifact-title');
  const body = panel.querySelector('.artifact-body');
  const link = panel.querySelector('.artifact-link');

  root.addEventListener('click', async e => {
    const c = e.target.closest('button.cite');
    if (c) {
      const id = c.dataset.artifact;
      /* digest.json now loads in the background rather than gating first paint (see
         site.js). It is small and starts loading immediately, so by the time anyone
         has scrolled to a citation and clicked it, this resolves instantly — but
         awaiting it here, rather than reading state.digest directly, is what makes
         that true rather than assumed. */
      await state.digestReady;
      const a = (state.digest?.items || []).find(x => x.id === id);
      title.textContent = id + (a ? ` — ${a.title}` : '');
      body.innerHTML = a
        ? `<p class="tag">${a.type} · ${a.status} · verified ${a.verified}</p>`
          + '<ul>' + a.facts.map(f =>
              `<li>${esc(f.c)}${f.s ? ` <span class="src">${esc(f.s)}</span>` : ''}</li>`).join('') + '</ul>'
          + (a.unknowns?.length
              ? `<p class="tag">${esc(t('chat.unknowns'))}</p><ul>`
                + a.unknowns.map(u => `<li>${esc(u)}</li>`).join('') + '</ul>'
              : '')
        : `<p>${esc(id)}</p>`;
      link.href = artifactUrl(id) || '#';
      panel.hidden = false;
    }
    if (e.target.closest('.artifact-close')) panel.hidden = true;
  });
}
