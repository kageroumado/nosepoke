import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * The smoke suite serves the site as it deploys — a static directory over http, so module
 * imports and `fetch` behave the way they do on kagerou.glass — and drives every page
 * that exists in the level registry.
 *
 * The 3D game runs first, alone on the shared GPU; the extended experiment pages then
 * run in parallel in light and dark color schemes.
 */
const PORT = 8127;

export default defineConfig({
  testDir: './tests',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: 6,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    launchOptions: process.platform === 'darwin' ? { args: ['--use-angle=metal'] } : {},
  },
  webServer: {
    command: `python3 tests/serve.py ${PORT}`,
    cwd: path.dirname(fileURLToPath(import.meta.url)),
    port: PORT,
    // A server already on this port belongs to some other checkout; fail loudly rather
    // than test a tree that is not this one.
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'ignore',
  },
  projects: [
    { name: '3d', testMatch: 'game3d.spec.ts', workers: 1, use: { ...devices['Desktop Chrome'] } },
    { name: 'light', testIgnore: 'game3d.spec.ts', dependencies: ['3d'], use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'dark', testIgnore: 'game3d.spec.ts', dependencies: ['3d'], use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
  ],
});
