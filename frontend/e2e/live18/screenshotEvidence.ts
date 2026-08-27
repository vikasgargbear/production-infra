import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import { CANONICAL_STAGING_PROJECT_REF } from '../support/live18/config';
import type { Live18BrowserConfig } from '../support/live18/config';

export type Live18ScreenshotStage = 'missing-required' | 'posted';

export interface Live18ScreenshotEvidence {
  stage: Live18ScreenshotStage;
  filename: string;
  sha256: string;
  byte_size: number;
  width: number;
  height: number;
}

const SAFE_OPERATION_ID = /^[a-z][a-z0-9_]{0,79}$/;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function screenshotEvidenceDirectory(
  config: Pick<Live18BrowserConfig, 'targetKind' | 'stagingProjectRef'>,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  if (config.targetKind !== 'disposable_test') {
    throw new Error('Screenshot evidence is restricted to target kind disposable_test.');
  }
  if (config.stagingProjectRef !== CANONICAL_STAGING_PROJECT_REF) {
    throw new Error('Screenshot evidence is restricted to the exact canonical staging project.');
  }
  const configuredRoot = environment.LIVE18_PLAYWRIGHT_ARTIFACT_DIR?.trim();
  if (!configuredRoot || !path.isAbsolute(configuredRoot)) {
    throw new Error('LIVE18_PLAYWRIGHT_ARTIFACT_DIR must be an absolute runner-temporary path.');
  }
  return path.join(path.resolve(configuredRoot), 'screenshots');
}

export function screenshotEvidenceFilename(
  operationId: string,
  stage: Live18ScreenshotStage,
): string {
  if (!SAFE_OPERATION_ID.test(operationId)) throw new Error('Invalid screenshot operation ID.');
  return `${operationId}-${stage}.png`;
}

function pngDimensions(content: Buffer): { width: number; height: number } {
  if (content.length < 24 || !content.subarray(0, 8).equals(PNG_SIGNATURE)
    || content.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Live18 screenshot output is not a valid PNG image.');
  }
  const width = content.readUInt32BE(16);
  const height = content.readUInt32BE(20);
  if (width < 1 || height < 1) throw new Error('Live18 screenshot has invalid dimensions.');
  return { width, height };
}

export async function captureLive18Screenshot(
  page: Page,
  config: Live18BrowserConfig,
  operationId: string,
  stage: Live18ScreenshotStage,
  collection: 'live18' | 'business-variants' = 'live18',
): Promise<Live18ScreenshotEvidence> {
  const root = screenshotEvidenceDirectory(config);
  const directory = collection === 'business-variants'
    ? path.join(root, 'business-variants')
    : root;
  const filename = screenshotEvidenceFilename(operationId, stage);
  const destination = path.join(directory, filename);
  if (!destination.startsWith(`${directory}${path.sep}`)) {
    throw new Error('Live18 screenshot destination escaped its reviewed artifact directory.');
  }

  const current = new URL(page.url());
  if (current.origin !== config.appOrigin) {
    throw new Error('Live18 screenshot page is outside the exact reviewed application origin.');
  }
  await expect(
    page.locator('input[type="password"]:visible'),
    'Live18 screenshots must never capture a login or password form',
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: /sign in/i }),
    'Live18 screenshots must never capture a sign-in screen',
  ).toHaveCount(0);
  const renderedText = await page.locator('body').innerText();
  for (const secret of [
    config.requester.password, config.reviewer.password, config.denialAccessToken,
  ]) {
    if (secret.length >= 8 && renderedText.includes(secret)) {
      throw new Error('Live18 screenshot page visibly contains a credential or token.');
    }
  }
  if (/\bBearer\s+[A-Za-z0-9._~-]{8,}/i.test(renderedText)
    || /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/.test(renderedText)) {
    throw new Error('Live18 screenshot page visibly contains an access-token-shaped value.');
  }

  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  await page.screenshot({
    path: destination,
    type: 'png',
    fullPage: false,
    animations: 'disabled',
    caret: 'hide',
  });
  fs.chmodSync(destination, 0o600);
  const content = fs.readFileSync(destination);
  const dimensions = pngDimensions(content);
  return {
    stage,
    filename,
    sha256: createHash('sha256').update(content).digest('hex'),
    byte_size: content.length,
    ...dimensions,
  };
}
