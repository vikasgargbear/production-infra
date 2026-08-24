import { expect, Page, TestInfo } from '@playwright/test';

const VISIBLE_FAILURE = /failed to|permission check failed|sync error|something went wrong|unexpected error|access denied/i;
const BENIGN_CONSOLE_ERROR = /resizeobserver loop|favicon\.ico|source map/i;

export interface BrowserFailureCollector {
  assertClean(testInfo: TestInfo): Promise<void>;
}

export function collectBrowserFailures(page: Page): BrowserFailureCollector {
  const failures: string[] = [];
  const pendingDiagnostics = new Set<Promise<void>>();

  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error' && !BENIGN_CONSOLE_ERROR.test(message.text())) {
      failures.push(`console: ${message.text()}`);
    }
  });
  page.on('requestfailed', request => {
    if (/\/api\//.test(request.url())) {
      failures.push(`requestfailed: ${request.method()} ${request.url()} (${request.failure()?.errorText || 'unknown'})`);
    }
  });
  page.on('response', response => {
    if (/\/api\//.test(response.url()) && response.status() >= 400) {
      const diagnostic = response.text()
        .catch(() => '<response body unavailable>')
        .then(body => {
          failures.push(
            `response: ${response.status()} ${response.request().method()} ${response.url()} `
            + `${body.slice(0, 1500)}`,
          );
        })
        .finally(() => pendingDiagnostics.delete(diagnostic));
      pendingDiagnostics.add(diagnostic);
    }
  });

  return {
    async assertClean(testInfo: TestInfo) {
      await Promise.all([...pendingDiagnostics]);
      const uniqueFailures = [...new Set(failures)];
      if (uniqueFailures.length > 0) {
        await testInfo.attach('browser-failures', {
          body: Buffer.from(JSON.stringify(uniqueFailures, null, 2)),
          contentType: 'application/json',
        });
      }
      expect(uniqueFailures, 'browser, console, and API failures').toEqual([]);
    },
  };
}

export async function loginToLiveErp(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/');
  const signIn = page.getByRole('button', { name: 'Sign In', exact: true });
  if (await signIn.isVisible().catch(() => false)) {
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await signIn.click();
  }
  await expect(page.getByText('Core Operations')).toBeVisible({ timeout: 45_000 });
}

export async function assertNoVisibleFailure(page: Page): Promise<void> {
  const possibleFailures = page.getByText(VISIBLE_FAILURE);
  const visible: string[] = [];
  for (let index = 0; index < await possibleFailures.count(); index += 1) {
    const item = possibleFailures.nth(index);
    if (await item.isVisible().catch(() => false)) {
      visible.push((await item.innerText()).trim());
    }
  }
  expect(visible, 'visible ERP failure messages').toEqual([]);
}

export async function waitForErpToSettle(page: Page): Promise<void> {
  const loaders = page.getByText(/Loading\.\.\.|Loading (products|customers|suppliers|dashboard data)/i);
  await expect.poll(async () => {
    let visible = 0;
    for (let index = 0; index < await loaders.count(); index += 1) {
      if (await loaders.nth(index).isVisible().catch(() => false)) visible += 1;
    }
    return visible;
  }, { timeout: 30_000, message: 'ERP loaders should settle' }).toBe(0);
  await page.waitForTimeout(500);
  await assertNoVisibleFailure(page);
}

export async function openHomeAction(page: Page, action: string): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^${action}\\b`, 'i') }).click();
  await page.waitForTimeout(250);
}

export async function returnHome(page: Page): Promise<void> {
  const mobileHome = page.getByRole('navigation', { name: 'Primary mobile navigation' })
    .getByRole('button', { name: 'Home', exact: true });
  if (await mobileHome.isVisible().catch(() => false)) {
    await mobileHome.click();
  } else {
    await page.getByRole('button', { name: 'Back to Home' }).click();
  }
  await expect(page.getByText('Core Operations')).toBeVisible();
}

export async function openMobileDestination(page: Page, destination: string): Promise<void> {
  const navigation = page.getByRole('navigation', { name: 'Primary mobile navigation' });
  const primary = navigation.getByRole('button', { name: destination, exact: true });
  if (await primary.isVisible().catch(() => false)) {
    await primary.click();
    return;
  }
  await navigation.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('region', { name: 'More modules' })
    .getByRole('button', { name: destination, exact: true }).click();
}

export async function chooseHubModule(page: Page, hub: string, module: string): Promise<void> {
  await page.getByRole('navigation', { name: `${hub} modules` })
    .getByRole('button', { name: module, exact: true }).click();
  await waitForErpToSettle(page);
}

export async function expectSuccessfulWrite(
  page: Page,
  endpoint: RegExp,
  action: () => Promise<void>,
): Promise<void> {
  const responsePromise = page.waitForResponse(response => (
    endpoint.test(response.url())
    && ['POST', 'PUT', 'PATCH'].includes(response.request().method())
  ), { timeout: 30_000 });
  await action();
  const response = await responsePromise;
  const body = response.status() >= 300
    ? await response.text().catch(() => '<response body unavailable>')
    : '';
  const evidence = `${response.request().method()} ${response.url()} ${body.slice(0, 1500)}`;
  expect(response.status(), evidence).toBeGreaterThanOrEqual(200);
  expect(response.status(), evidence).toBeLessThan(300);
}
