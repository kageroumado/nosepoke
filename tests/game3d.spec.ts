import { test, expect, type Page } from '@playwright/test';

type Vec = { x: number; z: number };
type Nosepoke = {
  ready: boolean;
  phase: string;
  G: {
    choices: Array<Array<{ pick: string }>>;
    lever: Array<{ presses: number[]; pellets: number; extinct: boolean }>;
    predictions: Array<{ pick: string; seal: { hash: string } } | undefined>;
    seals: { s1: { hash: string } };
  };
  maze: { doors: Map<string, { closed: boolean }>; blockedAt(x: number, z: number): boolean };
  player: { position: Vec & { set(x: number, y: number, z: number): void }; yaw: number; pitch: number };
  forkRoute(k: number, side: string): Vec[];
  interact(): void;
  skipTo(phase: string): Promise<void>;
};
declare global { interface Window { nosepoke: Nosepoke } }

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('GL_INVALID')) errors.push(`console: ${m.text()}`); });
  return errors;
}

async function load(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.nosepoke?.ready, null, { timeout: 60_000 });
}

/** Walk through world points in small steps, so every tile on the way is entered. */
async function walk(page: Page, points: Array<[number, number]>) {
  for (const target of points) {
    for (let i = 0; i < 300; i++) {
      const done = await page.evaluate(([x, z]) => {
        const p = window.nosepoke.player.position, dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
        window.nosepoke.player.yaw = Math.atan2(-dx, -dz);
        if (d < 0.12) return true;
        const s = Math.min(d, 0.25); p.x += dx / d * s; p.z += dz / d * s;
        return false;
      }, target);
      if (done) break;
      await page.waitForTimeout(16);
    }
  }
}
const route = (page: Page, k: number, side: string) =>
  page.evaluate(([k, side]) => window.nosepoke.forkRoute(k as number, side as string).map(v => [v.x, v.z] as [number, number]), [k, side] as const);

test('the protocol is sealed before waking and shown on the title', async ({ page }) => {
  const errors = watchErrors(page);
  await load(page);
  const hash = await page.evaluate(() => window.nosepoke.G.seals.s1.hash);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.locator('#title-hash')).toHaveText(hash.slice(0, 8));
  await page.click('#begin');
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => window.nosepoke.phase)).toBe('home');
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  expect(errors).toEqual([]);
});

test('session 1: forks close behind the choice, the lever runs dry, the reveal verifies its seal', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await load(page);
  await page.evaluate(() => window.nosepoke.skipTo('s1'));
  await page.waitForTimeout(1900);
  const picks = ['L', 'R', 'L', 'L', 'R', 'L', 'R', 'R'];
  for (let k = 0; k < 8; k++) {
    await walk(page, await route(page, k, picks[k]));
    const state = await page.evaluate(k => ({
      pick: window.nosepoke.G.choices[0][k]?.pick,
      other: window.nosepoke.maze.doors.get(`${k}${['L', 'R', 'L', 'L', 'R', 'L', 'R', 'R'][k] === 'L' ? 'C' : 'A'}`)!.closed,
      behind: window.nosepoke.maze.doors.get(`${k}E`)!.closed,
    }), k);
    expect(state).toEqual({ pick: picks[k], other: true, behind: true });
  }
  await walk(page, [[76.6, 0], [77.2, 1.4]]);
  await page.evaluate(() => { const p = window.nosepoke.player; p.position.set(77.2, 0, 1.7); p.yaw = Math.PI; p.pitch = 0; });
  await page.waitForTimeout(200);
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.nosepoke.interact()); await page.waitForTimeout(170); }
  const lever = await page.evaluate(() => window.nosepoke.G.lever[0]);
  expect(lever.pellets).toBe(8);
  expect(lever.extinct).toBe(true);
  expect(lever.presses.length).toBe(40);
  await walk(page, [[79, 0.1], [80.3, 0]]);
  await expect(page.locator('#reveal')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#reveal-log li')).toHaveCount(11);
  await expect(page.locator('#reveal-next')).toBeVisible({ timeout: 25_000 });
  await expect(page.locator('#seal-body .ok')).toHaveText(/Match/);
  await expect(page.locator('#reveal-score')).toHaveText(/of 11, sealed before you woke up/);
  await page.click('#reveal-next');
  await page.waitForFunction(() => window.nosepoke.phase === 's2', null, { timeout: 10_000 });
  const first = await page.evaluate(() => window.nosepoke.G.predictions[0]);
  expect(first?.seal.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(errors).toEqual([]);
});

test('session 2 seals the next fork before the subject reaches it', async ({ page }) => {
  test.setTimeout(120_000);
  await load(page);
  await page.evaluate(() => window.nosepoke.skipTo('garden'));
  const sealed = await page.evaluate(() => window.nosepoke.G.predictions.filter(Boolean).length);
  expect(sealed).toBe(8);
  expect(await page.evaluate(() => window.nosepoke.phase)).toBe('garden');
});

test('the ending tallies both sessions and the port settles the last statement', async ({ page, context }) => {
  const errors = watchErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await load(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); });
  await page.evaluate(() => window.nosepoke.skipTo('end'));
  await expect(page.locator('#ending')).toBeVisible();
  await expect(page.locator('#end-s1')).toHaveText(/^\d+ \/ 11$/);
  await expect(page.locator('#end-s2')).toHaveText(/^\d+ \/ 8$/);
  await expect(page.locator('#end-log li')).toHaveCount(12);
  await expect(page.locator('#end-seals .seal')).toHaveCount(10);
  await expect(page.locator('#end-seals .ok')).toHaveCount(10);
  await expect(page.locator('#port-note')).toHaveText('pending');
  await page.click('#port');
  await expect(page.locator('#port-note')).toHaveText(/^yes/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('kagerou.glass/nosepoke');
  expect(errors).toEqual([]);
});

test('touch layout: the stick walks and the action button appears', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await load(page);
  await page.evaluate(() => window.nosepoke.skipTo('s1'));
  await page.waitForTimeout(1900);
  await expect(page.locator('#act')).toBeVisible();
  const cdp = await context.newCDPSession(page);
  const start = await page.evaluate(() => window.nosepoke.player.position.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y: 650, id: 1 }] });
  for (let i = 0; i < 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 80, y: 590, id: 1 }] });
    await page.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.nosepoke.player.position.x)).toBeGreaterThan(start + 1);
  await context.close();
});
