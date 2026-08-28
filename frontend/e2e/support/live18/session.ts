import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

import type { Live18BrowserConfig } from './config';

export interface CapturedSession {
  token: string;
  userId: string;
  orgId: string;
  branchIds: string[];
  branchScope: 'all' | 'multi' | 'single';
}

const decodeClaims = (token: string): Record<string, unknown> => {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('ERP session token is not a JWT.');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<string, unknown>;
};

export function sessionIdentityFromToken(token: string): Omit<CapturedSession, 'token'> {
  const claims = decodeClaims(token);
  const branchScope = String(claims.branch_scope || '');
  if (!['all', 'multi', 'single'].includes(branchScope)) {
    throw new Error('ERP session token omitted its canonical branch scope.');
  }
  const branchIds = Array.isArray(claims.branch_ids)
    ? claims.branch_ids.map(String)
    : claims.branch_id ? [String(claims.branch_id)] : [];
  return {
    userId: String(claims.user_id || claims.sub || ''),
    orgId: String(claims.org_id || claims.organization_id || ''),
    branchIds,
    branchScope: branchScope as CapturedSession['branchScope'],
  };
}

export function isExpectedSessionExchange(
  responseUrl: string,
  method: string,
  apiOrigin: string,
): boolean {
  const response = new URL(responseUrl);
  return method === 'POST'
    && response.origin === new URL(apiOrigin).origin
    && response.pathname === '/api/auth/oauth/supabase/session';
}

export function supabaseSessionStorageKey(supabaseOrigin: string): string {
  const origin = new URL(supabaseOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash
    || !origin.hostname.endsWith('.supabase.co')) {
    throw new Error('Supabase session bootstrap requires one credential-free HTTPS project origin.');
  }
  const projectRef = origin.hostname.slice(0, -'.supabase.co'.length);
  if (!/^[a-z0-9]{20}$/.test(projectRef)) {
    throw new Error('Supabase session bootstrap requires one canonical project reference.');
  }
  return `sb-${projectRef}-auth-token`;
}

async function disposableSupabaseSession(
  config: Live18BrowserConfig,
  credentials: { email: string; password: string },
): Promise<Session> {
  const supabase = createClient(config.supabaseOrigin, config.supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await supabase.auth.signInWithPassword(credentials);
  if (error || !data.session || !data.user) {
    const status = error?.status ? ` HTTP ${error.status}` : '';
    const code = error?.code ? ` (${error.code})` : '';
    throw new Error(`Disposable Supabase identity bootstrap failed${status}${code}.`);
  }
  if (data.user.email?.toLowerCase() !== credentials.email.toLowerCase()) {
    throw new Error('Disposable Supabase identity bootstrap returned the wrong user.');
  }
  return data.session;
}

async function seedDisposableBrowserSession(
  page: Page,
  config: Live18BrowserConfig,
  session: Session,
): Promise<void> {
  const bootstrapUrl = `${config.appOrigin}/__live18_supabase_session_bootstrap__`;
  await page.route(bootstrapUrl, async route => {
    await route.fulfill({
      body: '<!doctype html><html><body>Live18 session bootstrap</body></html>',
      contentType: 'text/html',
      status: 200,
    });
  });
  try {
    await page.goto(bootstrapUrl);
    await page.evaluate(({ storageKey, value }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    }, {
      storageKey: supabaseSessionStorageKey(config.supabaseOrigin),
      value: session,
    });
  } finally {
    await page.unroute(bootstrapUrl);
  }
}

export async function loginAndCaptureSession(
  page: Page,
  config: Live18BrowserConfig,
  credentials: { email: string; password: string },
): Promise<CapturedSession> {
  const supabaseSession = await disposableSupabaseSession(config, credentials);
  await seedDisposableBrowserSession(page, config, supabaseSession);
  const exchange = page.waitForResponse((response: Response) => isExpectedSessionExchange(
    response.url(), response.request().method(), config.apiOrigin,
  ), { timeout: 45_000 });
  await page.goto(config.appOrigin);
  const response = await exchange;
  expect(
    response.status(),
    'frontend Supabase session exchange must succeed against the reviewed API origin',
  ).toBe(200);
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error('ERP session exchange omitted its access token.');
  await expect(
    page.getByText('Core Operations', { exact: true }),
    'successful session exchange must finish rendering the authenticated ERP before navigation',
  ).toBeVisible({ timeout: 45_000 });
  const identity = sessionIdentityFromToken(body.access_token);
  return {
    token: body.access_token,
    ...identity,
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
  for (const session of [requester, reviewer]) {
    if (session.branchScope === 'all') {
      expect(session.branchIds).toEqual([]);
    } else {
      expect(session.branchIds).toContain(config.expectedBranchId);
    }
  }
}
