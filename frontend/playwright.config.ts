import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 3102);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const browserChannel = process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === 'true' ? 'chrome' : undefined;

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/artifacts',
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  workers: process.env.CI ? 1 : undefined,
  maxFailures: process.env.CI ? 10 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [
        ['line'],
        ['html', { open: 'never', outputFolder: 'playwright-report' }],
        ['junit', { outputFile: 'test-results/e2e-junit.xml' }]
      ]
    : [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    testIdAttribute: 'data-testid'
  },
  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER === 'true'
    ? undefined
    : {
        command: `BROWSER=none HOST=127.0.0.1 PORT=${port} REACT_APP_ENABLE_E2E_HARNESS=true npm start`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      },
  projects: [
    {
      name: 'desktop-chrome',
      testMatch: /(?:calculation-smoke|live-production-smoke)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        ...(browserChannel ? { channel: browserChannel } : {})
      }
    },
    {
      name: 'mobile-chrome',
      testMatch: /(?:mobile-navigation|live-production-smoke)\.spec\.ts/,
      use: {
        ...devices['Pixel 7'],
        ...(browserChannel ? { channel: browserChannel } : {})
      }
    }
  ]
});
