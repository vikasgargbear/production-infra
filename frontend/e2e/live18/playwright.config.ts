import { defineConfig, devices } from '@playwright/test';
import os from 'os';
import path from 'path';

const artifactRoot = process.env.LIVE18_PLAYWRIGHT_ARTIFACT_DIR
  || path.join(os.tmpdir(), 'aasopharma-live18-playwright');

export default defineConfig({
  testDir: '.',
  testMatch: /canonical-live18\.spec\.ts/,
  outputDir: path.join(artifactRoot, 'artifacts'),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  maxFailures: 0,
  retries: 0,
  reporter: [['line'], ['html', { open: 'never', outputFolder: path.join(artifactRoot, 'report') }]],
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
