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
  reporter: [['line']],
  use: {
    ...devices['Desktop Chrome'],
    // Authenticated traces, screenshots, and videos can contain session state or
    // business data. Live18 publishes a separate fixed-schema evidence manifest.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
