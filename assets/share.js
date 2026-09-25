// The share panel, used by the app and the static pages.
//   openShare({ url, title, text, card, story, filename })
// Static pages don't need to call it: any [data-share] button opens it (see the bottom of this file).
//
// Instagram, Snapchat and TikTok have no way for a website to post for you. The closest thing is handing the
// story image to the phone's share sheet (Web Share API with files), which lists those apps. Everything with a
// web share link (Facebook, X, Threads, WhatsApp, Pinterest, Reddit) gets one, and the link previews as our card.

let dialog, current, storyFile = null, storyFor = '';

const enc = encodeURIComponent;
const touch = () => matchMedia('(pointer: coarse)').matches;
const canShareFiles = () => {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })) } catch { return false }
};

function build() {
  dialog = document.createElement('dialog');
  dialog.className = 'sheet share-sheet';
  dialog.setAttribute('aria-labelledby', 'share-h');
  dialog.innerHTML = `
    <form method="dialog" class="sheet-head">
      <h2 id="share-h">Share</h2>
      <button class="icon-btn" value="close" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    </form>
    <div class="share-body">
      <img class="share-preview" alt="" width="1200" height="630">
      <div class="share-main">
        <p class="share-line"></p>
        <div class="share-primary">
          <button class="btn primary" type="button" data-act="image"><span class="idle">Share image</span><span class="ok">Shared</span></button>
          <a class="btn quiet" data-act="save" download>Save image</a>
          <button class="btn quiet" type="button" data-act="copy"><span class="idle">Copy link</span><span class="ok">Link copied</span></button>
        </div>
        <p class="share-hint"></p>
      </div>
    </div>
    <p class="label share-to">Post to</p>
    <ul class="share-targets">
      <li><button type="button" data-act="stories">Instagram</button></li>
      <li><button type="button" data-act="stories">Snapchat</button></li>
      <li><button type="button" data-act="stories">TikTok</button></li>
      <li><a data-to="facebook" target="_blank" rel="noopener">Facebook</a></li>
      <li><a data-to="x" target="_blank" rel="noopener">X</a></li>
      <li><a data-to="threads" target="_blank" rel="noopener">Threads</a></li>
      <li><a data-to="whatsapp" target="_blank" rel="noopener">WhatsApp</a></li>
      <li><a data-to="pinterest" target="_blank" rel="noopener">Pinterest</a></li>
      <li><a data-to="reddit" target="_blank" rel="noopener">Reddit</a></li>
      <li><a data-to="sms">Messages</a></li>
      <li><a data-to="email">Email</a></li>
    </ul>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('click', onClick);
  // Tap outside the panel to close it
  dialog.addEventListener('pointerdown', e => { if (e.target === dialog) dialog.close() });
}

function targetHref(to, { url, title, text, card }) {
  const msg = `${title}: "${text}"`;
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`,
    x: `https://x.com/intent/post?text=${enc(msg)}&url=${enc(url)}`,
    threads: `https://www.threads.net/intent/post?text=${enc(`${msg} ${url}`)}`,
    whatsapp: `https://wa.me/?text=${enc(`${msg} ${url}`)}`,
    pinterest: `https://pinterest.com/pin/create/button/?url=${enc(url)}&media=${enc(card)}&description=${enc(msg)}`,
    reddit: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(`${title} (7 Brew order)`)}`,
    sms: `sms:?&body=${enc(`${msg} ${url}`)}`,
    email: `mailto:?subject=${enc(`Try this 7 Brew order: ${title}`)}&body=${enc(`${msg}\n\n${url}`)}`,
  }[to];
}

// Fetch the story image as soon as the panel opens, so "Share image" can call navigator.share
// straight from the tap (Safari only allows it while the tap is still fresh).
async function prepareStory(opts) {
  storyFor = opts.story; storyFile = null;
  const btn = dialog.querySelector('[data-act="image"]');
  btn.disabled = true;
  try {
    const r = await fetch(opts.story);
    if (!r.ok) throw new Error(r.status);
    const blob = await r.blob();
    if (storyFor === opts.story) storyFile = new File([blob], opts.filename, { type: 'image/png' });
  } catch { /* the button falls back to sharing the link */ }
  if (storyFor === opts.story) btn.disabled = false;
}

function flash(btn) {
  btn.classList.add('done');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => btn.classList.remove('done'), 1600);
}

async function copyLink(btn) {
  try { await navigator.clipboard.writeText(current.url); flash(btn) }
  catch { prompt('Copy this link:', current.url) }
}

async function shareImage(btn) {
  const o = current;
  const data = { title: o.title, text: `${o.title}: "${o.text}" ${o.url}` };
  try {
    if (storyFile && navigator.canShare?.({ files: [storyFile] })) await navigator.share({ ...data, files: [storyFile] });
    else if (navigator.share) await navigator.share({ ...data, url: o.url });
    else return copyLink(dialog.querySelector('[data-act="copy"]'));
    flash(btn);
  } catch (e) {
    if (e.name !== 'AbortError') dialog.querySelector('.share-hint').textContent = "Couldn't open the share menu. Save the image instead and post it from your gallery.";
  }
}

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  if (act === 'copy') copyLink(el);
  if (act === 'image') shareImage(el);
  if (act === 'stories') {
    // No web link exists for these apps; on phones the share menu lists them, elsewhere save and post from your phone.
    if (canShareFiles() && touch()) shareImage(dialog.querySelector('[data-act="image"]'));
    else {
      const hint = dialog.querySelector('.share-hint');
      hint.textContent = `${el.textContent} doesn't let websites post for you. Save the image, then add it to your story from your phone.`;
      dialog.querySelector('[data-act="save"]').focus();
    }
  }
}

export function openShare(opts) {
  if (!dialog) build();
  current = { ...opts, url: new URL(opts.url, location.href).href, card: new URL(opts.card, location.href).href, story: new URL(opts.story, location.href).href };
  dialog.querySelector('#share-h').textContent = `Share ${opts.title}`;
  dialog.querySelector('.share-line').textContent = `“${opts.text}”`;
  const img = dialog.querySelector('.share-preview');
  img.src = current.card;
  img.alt = `Preview: ${opts.title}`;
  const save = dialog.querySelector('[data-act="save"]');
  save.href = current.story;
  save.download = opts.filename;
  dialog.querySelectorAll('[data-to]').forEach(a => { a.href = targetHref(a.dataset.to, current) });
  // Texting only makes sense on a phone
  dialog.querySelector('[data-to="sms"]').parentElement.hidden = !touch();
  const files = canShareFiles();
  dialog.querySelector('[data-act="image"]').hidden = !files && !navigator.share;
  dialog.querySelector('.share-hint').textContent = files
    ? 'Share image opens your phone\'s share menu with the picture attached: pick Instagram, Snapchat, TikTok or any app.'
    : 'For Instagram, Snapchat or TikTok, save the image and post it from your phone.';
  prepareStory({ ...current, filename: opts.filename });
  dialog.showModal();
}

/* Static pages: <button data-share="/drinks/x" data-title data-text data-card data-story data-filename> */
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-share][data-card]');
  if (!b) return;
  const d = b.dataset;
  openShare({ url: d.share, title: d.title, text: d.text, card: d.card, story: d.story, filename: d.filename });
});
