import { expect, Page, Response } from '@playwright/test';

import type { Live18BrowserConfig } from './config';

export interface CapturedSession {
  token: string;
  userId: string;
  orgId: string;
  branchIds: string[];
}

const decodeClaims = (token: string): Record<string, unknown> => {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('ERP session token is not a JWT.');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
};

export async function loginAndCaptureSession(
  page: Page,
  appOrigin: string,
  credentials: { email: string; password: string },
): Promise<CapturedSession> {
  await page.goto(appOrigin);
  const exchange = page.waitForResponse((response: Response) => (
    response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/auth/oauth/supabase/session'
  ), { timeout: 45_000 });
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  const response = await exchange;
  expect(response.status(), await response.text()).toBe(200);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('ERP session exchange omitted its access token.');
  const claims = decodeClaims(body.access_token);
  const branchIds = Array.isArray(claims.branch_ids)
    ? claims.branch_ids.map(String)
    : claims.branch_id ? [String(claims.branch_id)] : [];
  return {
    token: body.access_token,
    userId: String(claims.user_id || claims.sub || ''),
    orgId: String(claims.org_id || claims.organization_id || ''),
    branchIds,
  };
}

export function assertSessionIsolation(
  config: Live18BrowserConfig,
  requester: CapturedSession,
  reviewer: CapturedSession,
): void {
  expect(requester.userId).not.toBe(reviewer.userId);
  expect(requester.orgId).toBe(config.expectedOrgId);
  expect(reviewer.orgId).toBe(config.expectedOrgId);
  expect(requester.branchIds).toContain(config.expectedBranchId);
  expect(reviewer.branchIds).toContain(config.expectedBranchId);
}
