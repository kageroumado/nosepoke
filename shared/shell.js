/**
 * Page chrome: the header, the theme and sound toggles, the day/night tint, the
 * field-note ticker, the trivia card, and the continue button. Pages describe
 * themselves by level id and get all of it; none of them knows another page's URL.
 */

import { level, nextLevel, href, isUnlocked, rootPath } from './levels.js';
import { pref, setPref } from './save.js';
import { music, setVolume, unlock } from './audio.js';

/**
 * History cards, one per level, shown between sessions. Each is a real thing that
 * happened, cited. Entries are additive: a page agent fills in its own id.
 *
 * Shape: `{ title, body, source }` — `body` may contain inline markup.
 */
import { STRAINS } from './sim.js';
import { playerStrain } from './save.js';

export const TRIVIA = {
  d00: null,
  d01: null,
  n01: null,
  d02: null,
  d03: null,
  n03: null,
  d04: null,
  d05: {
    title: 'The pen that never lied',
    body: 'The record on the right is drawn the way Skinner drew his. A roll of paper crept'
      + ' sideways at a constant speed while a pen stepped up one notch per response, so the'
      + ' <b>slope of the line was the response rate</b> and nothing had to be counted by hand.'
      + ' A flat stretch is a pause; a steep climb is hard work; the little diagonal pips are'
      + ' reinforcements. Ferster and Skinner published nearly a thousand of these curves in one'
      + ' volume, and the fixed-interval scallop is the shape that made the schedules famous.',
    source: 'Ferster, C. B. & Skinner, B. F. (1957). Schedules of Reinforcement. Appleton-Century-Crofts.',
  },
  n02: null,
  d06: null,
  d07: null,
  n04: null,
  d08: null,
  d09: null,
  n05: null,
  park: null,
  epilogue: null,
};

const THEMES = ['auto', 'light', 'dark'];

/**
 * Mount the page chrome.
 *
 * @param {object} opts
 * @param {string} [opts.levelId] the level this page is; drives the title, tint, and trivia
 * @param {string} [opts.subtitle] override for the line beside the wordmark
 * @param {HTMLElement} [opts.wrap] container to prepend the header to; defaults to `.wrap`
 * @returns {object} the shell
 */
export function mountShell(opts = {}) {
  // The subject line on every page names the rolled strain, whatever the markup said.
  for (const el of document.querySelectorAll('.strainLab')) el.textContent = STRAINS[playerStrain()].label;
  const lv = opts.levelId ? level(opts.levelId) : null;
  const wrap = opts.wrap || document.querySelector('.wrap') || document.body;

  document.body.dataset.phase = lv ? lv.phase : (opts.phase || 'day');

  const header = document.createElement('header');
  header.className = 'brand';
  header.innerHTML = `
    <a class="home" href="${rootPath()}">
      <span class="glyph" aria-hidden="true">n</span>
      <b>nosepoke</b>
    </a>
    <span class="sub"></span>
    <div class="spacer"></div>
    <button class="ghostbtn" data-role="trivia" hidden>trivia</button>
    <button class="ghostbtn" data-role="sound" aria-pressed="false">sound off</button>
    <button class="ghostbtn" data-role="theme">auto</button>`;
  wrap.prepend(header);

  header.querySelector('.sub').textContent = opts.subtitle
    || (lv ? lv.title : '')
    || '';

  // --- theme ---------------------------------------------------------------
  const themeBtn = header.querySelector('[data-role="theme"]');
  let themeIx = Math.max(0, THEMES.indexOf(pref('theme', 'auto')));
  applyTheme();
  themeBtn.addEventListener('click', () => {
    themeIx = (themeIx + 1) % THEMES.length;
    setPref('theme', THEMES[themeIx]);
    applyTheme();
  });
  function applyTheme() {
    const t = THEMES[themeIx];
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    themeBtn.textContent = t;
  }

  // --- sound ---------------------------------------------------------------
  const soundBtn = header.querySelector('[data-role="sound"]');
  let soundOn = !!pref('sound', false);
  paintSound();
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    setPref('sound', soundOn);
    unlock();
    if (soundOn) { music.start(); setVolume(1); } else { setVolume(0); }
    paintSound();
  });
  function paintSound() {
    soundBtn.textContent = soundOn ? 'sound on' : 'sound off';
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    setVolume(soundOn ? 1 : 0);
  }
  // The pad cannot start before a gesture, so it starts on the first one.
  if (soundOn) {
    addEventListener('pointerdown', () => { unlock(); music.start(); }, { once: true });
  }

  // --- trivia --------------------------------------------------------------
  const card = TRIVIA[opts.levelId];
  const triviaBtn = header.querySelector('[data-role="trivia"]');
  let triviaVeil = null;
  if (card) {
    triviaBtn.hidden = false;
    triviaBtn.addEventListener('click', showTrivia);
  }
  function showTrivia() {
    if (!card) return;
    if (!triviaVeil) {
      triviaVeil = document.createElement('div');
      triviaVeil.className = 'veil';
      triviaVeil.innerHTML = `
        <div class="sheet">
          <div class="inner">
            <h3></h3>
            <div class="explain" style="border-top:0;padding-top:0"><p></p></div>
            <p class="figcap"></p>
            <div class="actions"><button class="btn" data-role="close">Close</button></div>
          </div>
        </div>`;
      triviaVeil.querySelector('h3').textContent = card.title;
      triviaVeil.querySelector('.explain p').innerHTML = card.body;
      triviaVeil.querySelector('.figcap').textContent = card.source;
      triviaVeil.querySelector('[data-role="close"]').addEventListener('click', hideTrivia);
      triviaVeil.addEventListener('click', (e) => { if (e.target === triviaVeil) hideTrivia(); });
      document.body.appendChild(triviaVeil);
    }
    requestAnimationFrame(() => triviaVeil.classList.add('show'));
  }
  function hideTrivia() { if (triviaVeil) triviaVeil.classList.remove('show'); }

  // --- field notes ---------------------------------------------------------
  let noteTimer = 0;
  /**
   * Tick the researcher's field notes into an element. The sim writes them; the page
   * never composes one.
   */
  function bindNotes(sim, el) {
    if (!el) return;
    let shown = 0;
    clearInterval(noteTimer);
    noteTimer = setInterval(() => {
      const notes = sim.S.notes;
      if (notes.length <= shown) return;
      const n = notes[notes.length - 1];
      el.innerHTML = n.em ? `<em>${n.text}</em>` : n.text;
      shown = notes.length;
    }, 200);
  }

  // --- continue ------------------------------------------------------------
  /**
   * The link out of this page. Routes through the registry, so a page never names
   * its successor. Falls back to the hub when the next level is still locked.
   */
  function continueLink(label) {
    const next = opts.levelId ? nextLevel(opts.levelId) : null;
    const a = document.createElement('a');
    a.className = 'btn primary';
    if (next && isUnlocked(next.id)) {
      a.href = href(next.id);
      a.textContent = label || `Continue: ${next.title}`;
    } else {
      a.href = rootPath();
      a.textContent = label || 'Back to the colony rack';
    }
    return a;
  }

  return {
    header,
    level: lv,
    bindNotes,
    showTrivia,
    hideTrivia,
    continueLink,
    hasTrivia: !!card,
    /** Change the line beside the wordmark. */
    setSubtitle(text) { header.querySelector('.sub').textContent = text; },
    /** Stop the note ticker. */
    dispose() { clearInterval(noteTimer); },
  };
}
