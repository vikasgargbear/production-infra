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
    // Unbounded automatic artifacts can contain session state or credentials.
    // The spec captures only two reviewed, disposable-staging screenshots per
    // operation through screenshotEvidence.ts and publishes hashes, not images.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
