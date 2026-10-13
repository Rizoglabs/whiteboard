import { defineConfig } from '@playwright/test';

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
    { name: 'prod', use: { baseURL: 'https://whiteboard-rizoglabs.vercel.app' } },
  ],
  webServer: {
    command: 'npm run preview -- --port 5199 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
