import { test, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Every page in the level registry, in both color schemes: it loads clean, it plays
 * itself to the debrief under `?auto=1`, its figure exports a real PNG, and it fits a
 * 420 px viewport.
 *
 * Pages that have not landed yet are reported as skipped. The registry lists every page
 * in the game from the start, so a missing file means "not built", never "broken".
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Level {
  id: string;
  path: string;
  phase: string;
  title: string;
  exists: boolean;
}

/**
 * The registry, read as text. The list has to exist before the tests are declared, and
 * the shape of an entry is fixed by `shared/levels.js`.
 */
function readLevels(): Level[] {
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'levels.js'), 'utf8');
  const entry = /id:\s*'([^']+)',\s*path:\s*'([^']+)',\s*phase:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)'/g;
  const out: Level[] = [];
  for (const m of src.matchAll(entry)) {
    out.push({ id: m[1], path: m[2], phase: m[3], title: m[4], exists: fs.existsSync(path.join(ROOT, m[2])) });
  }
  return out;
}

const LEVELS = readLevels();

/** Console errors and uncaught exceptions, collected from the moment the page opens. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('favicon.ico')) return;
    errors.push(`console: ${text}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Elements sticking out past the right edge of the viewport. */
async function overflowing(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > width + 1) {
        out.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} to ${Math.round(r.right)}px`);
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: width, elements: out.slice(0, 6) };
  });
}

/**
 * Wait for the page to publish its runtime, then for its debrief. A page that runs several
 * sessions (blocks, days) swaps in a new sim after each, so the debrief veil is the signal
 * where one exists; a single-session page without a veil is done when its schedule is.
 */
async function playToDebrief(page: Page) {
  await page.waitForFunction(() => (window as any).nosepoke?.sim, null, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const veil = document.getElementById('veil');
    if (veil) return veil.classList.contains('show');
    return (window as any).nosepoke.sim.S.done === true;
  }, null, { timeout: 240_000 });
}

for (const level of LEVELS) {
  test.describe(`${level.id} ${level.title}`, () => {
    if (!level.exists) {
      test(`${level.path} is not built yet`, () => {
        test.skip(true, `${level.path} does not exist on this branch`);
      });
      return;
    }

    // The epilogue is a document over the save, with no sim to wait on or play.
    const documentPage = level.phase === 'epilogue';

    test('loads clean and fits a 420 px viewport', async ({ page }) => {
      const errors = watchErrors(page);
      await page.setViewportSize({ width: 420, height: 900 });
      await page.goto('/' + level.path);
      if (documentPage) await page.waitForLoadState('networkidle');
      else await page.waitForFunction(() => (window as any).nosepoke?.sim, null, { timeout: 30_000 });
      await page.waitForTimeout(400);

      const overflow = await overflowing(page);
      expect(errors, `errors on ${level.path}`).toEqual([]);
      expect(overflow.elements, `horizontal overflow on ${level.path}`).toEqual([]);
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test('plays to the debrief and exports a PNG', async ({ page }) => {
      test.skip(documentPage, `${level.path} has no session to play`);
      const errors = watchErrors(page);
      await page.goto('/' + level.path + '?auto=1');
      await playToDebrief(page);

      if (await page.locator('#veil').count()) await expect(page.locator('#veil.show')).toBeVisible({ timeout: 20_000 });

      const png = await page.evaluate(async () => {
        const figure = await import('/shared/figure.js');
        const np = (window as any).nosepoke;
        const url = figure.exportPNG({ sim: np.sim, level: np.level, metrics: np.metrics || np.sim.metrics() });
        const blob = await (await fetch(url)).blob();
        return { type: blob.type, size: blob.size };
      });

      expect(png.type).toBe('image/png');
      expect(png.size).toBeGreaterThan(2000);
      expect(errors, `errors on ${level.path}?auto=1`).toEqual([]);
    });
  });
}

test.describe('the hub', () => {
  test('renders one cage per level', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/studies.html');
    await expect(page.locator('.rack .cage')).toHaveCount(LEVELS.length);
    expect(errors, 'errors on the hub').toEqual([]);
  });

  test('a completed level shows as done and unlocks the next', async ({ page }) => {
    const doneIndex = LEVELS.findIndex((l) => l.id === 'd05');
    expect(doneIndex, 'd05 must be in the registry').toBeGreaterThanOrEqual(0);

    await page.addInitScript(() => {
      localStorage.setItem('nosepoke.v1', JSON.stringify({
        version: 1,
        created: new Date().toISOString(),
        progress: { completed: { d05: { at: new Date().toISOString(), metrics: { kind: 'FI', fryIndex: 0.5 } } }, lastLevel: 'd05' },
      }));
    });
    await page.goto('/studies.html');

    const cages = page.locator('.rack .cage');
    await expect(cages.nth(doneIndex)).toHaveAttribute('data-state', 'done');
    await expect(cages.nth(doneIndex + 1)).toHaveAttribute('data-state', 'unlocked');
  });

  test('fits a 420 px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 });
    await page.goto('/studies.html');
    await page.waitForTimeout(300);
    const overflow = await overflowing(page);
    expect(overflow.elements, 'horizontal overflow on the hub').toEqual([]);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});
