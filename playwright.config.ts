import { defineConfig } from '@playwright/test';

// Another local dev server may already hold 5173; reuseExistingServer would then test it.
const port = Number(process.env['WEB_E2E_PORT'] ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    // Google Chrome, not Playwright's Chromium: Chromium cannot play the hero's H.264 video.
    channel: 'chrome',
    // Headless Chrome has no GPU and no longer falls back to software WebGL on its own;
    // the 3D stand needs it (and takes ~10s to get ready on the CPU).
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
