import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.', testMatch: 'mcp-connection-consent.spec.ts', workers: 1,
  outputDir: '../test-results/mcp-consent',
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3139', channel: 'chrome' },
});
