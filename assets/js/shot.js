/* Screenshot mode — `?shot=<id>`.
 *
 * Headless Chrome's --screenshot captures the document origin and ignores scroll
 * position, so framing a section by scrolling to it does not work. This hides every
 * section except the requested one, which puts it at the top of the document where
 * the capture actually looks.
 *
 * It also has to finish any interaction the shot is supposed to show — the comparison
 * page is blank until a question has been asked — and then say so, by setting the
 * title to READY. tools/shoot.sh polls for that instead of guessing at a sleep.
 */
const ID = new URLSearchParams(location.search).get('shot');

export async function stageShot() {
  if (!ID) return false;
  document.body.dataset.shot = ID;

  /* Keep only the target. Sections are addressed by their order on the page, because
     that is what the shot list is written in terms of. */
  const blocks = [...document.querySelectorAll('main > section')];
  const target = document.getElementById(ID) || blocks[Number(ID) - 1];
  blocks.forEach(b => { if (b !== target) b.hidden = true; });
  if (target) target.dataset.active = 'true';

  return true;
}

/* Called once the page's own render has finished. */
export function shotReady() {
  if (ID) document.title = 'READY';
}

export const shotId = ID;
