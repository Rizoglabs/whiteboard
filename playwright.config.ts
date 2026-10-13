import { defineConfig } from '@playwright/test';

/**
 * The sandbox reaches the public internet through an egress proxy that needs
 * basic auth. Playwright does not pick proxy credentials up from env vars, so
 * we parse them here (never hard-coded) for the project that hits the
 * production URL. Outside the sandbox the env var is absent and the browser
 * connects directly.
 */
function proxyFromEnv(): { server: string; username: string; password: string } | undefined {
  const raw = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.hostname) return undefined;
    return {
      server: `${u.protocol}//${u.hostname}:${u.port}`,
      username: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
    };
  } catch {
    return undefined;
  }
}

const prodProxy = proxyFromEnv();

// E2E audit suite for the whiteboard app.
// Runs the same specs against the local production build and the deployed URL:
//   npx playwright test --project=local
//   npx playwright test --project=prod
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  use: {
    viewport: { width: 1280, height: 800 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'local', use: { baseURL: 'http://127.0.0.1:5199' } },
    {
      name: 'prod',
      use: {
        baseURL: 'https://whiteboard-rizoglabs.vercel.app',
        ...(prodProxy ? { proxy: prodProxy } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 5199 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
