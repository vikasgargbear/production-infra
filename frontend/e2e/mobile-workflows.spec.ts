import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '412x915', width: 412, height: 915 },
] as const;

async function openFlow(page: Page, flow: string, viewport: typeof viewports[number]) {
  await page.route('**/api/settings/features', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ features: { customer_mode: 'hybrid', require_gst_for_b2b: false, default_customer_type: 'organization' } }),
  }));
  await page.route('**/api/canonical/reference/gst-jurisdictions**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([]),
  }));
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`/e2e/mobile-workflows?flow=${flow}`);
  await expect(page.locator('html')).toBeAttached();
  await expectNoHorizontalOverflow(page, flow);
}

async function expectNoHorizontalOverflow(page: Page, flow: string) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content, `${flow} must not scroll horizontally`).toBeLessThanOrEqual(dimensions.viewport);
}

async function expectTapTarget(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
}

async function expectWithinViewport(locator: Locator, height: number) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height);
}

for (const viewport of viewports) {
  test.describe(`mobile workflow contracts at ${viewport.name}`, () => {
    test('onboarding fits, exposes clear choices, and uses thumb-sized inputs', async ({ page }) => {
      await openFlow(page, 'onboarding', viewport);
      await expect(page.getByRole('heading', { name: 'Set up your pharmacy' })).toBeVisible();
      await expectTapTarget(page.getByRole('button', { name: 'Create new organization' }));
      await expectTapTarget(page.getByRole('button', { name: 'Join with invitation' }));
      const legalName = page.getByLabel(/Legal name/);
      await expectTapTarget(legalName);
      await legalName.fill('Mobile Pharmacy');
      await expect(legalName).toBeFocused();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const create = page.getByRole('button', { name: 'Create organization' });
      await expectTapTarget(create);
      await expectWithinViewport(create, viewport.height);
      await expect(page.getByLabel(/GST state code/)).toHaveAttribute('inputmode', 'numeric');
      await expect(page.getByLabel(/Postal code/)).toHaveAttribute('inputmode', 'numeric');
      await expectNoHorizontalOverflow(page, 'onboarding after full scroll');
    });

    for (const fixture of [
      { flow: 'product', title: 'New product draft', submit: 'Save product draft', input: /Product name/, close: 'Close product form', secondary: null, finalControl: 'select' },
      { flow: 'customer', title: 'New Customer', submit: 'Save Customer', input: /Customer Name/, close: 'Close customer form', secondary: 'Cancel', finalControl: 'input[type="number"][max="365"]' },
      { flow: 'supplier', title: 'Add New Supplier', submit: 'Save Supplier', input: /Supplier Name/, close: 'Close supplier form', secondary: 'Cancel', finalControl: 'input[placeholder="Enter 0–180"]' },
    ]) {
      test(`${fixture.flow} form keeps one primary CTA through scroll, focus, and validation`, async ({ page }) => {
        await openFlow(page, fixture.flow, viewport);
        await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
        await expectTapTarget(page.getByLabel(fixture.input));
        const primary = page.locator('button:visible').filter({ hasText: fixture.submit });
        await expect(primary).toHaveCount(1);
        await expectTapTarget(primary);
        await expectWithinViewport(primary, viewport.height);
        const close = page.getByRole('button', { name: fixture.close });
        await expectTapTarget(close);
        const secondary = fixture.secondary
          ? page.locator('button:visible').filter({ hasText: fixture.secondary })
          : close;
        await expectTapTarget(secondary);
        if (fixture.secondary) await expect(secondary).toHaveCount(1);

        const actions = page.getByTestId('master-form-actions');
        await expect(actions).toBeVisible();
        const actionsBox = await actions.boundingBox();
        expect(actionsBox).not.toBeNull();
        expect(Math.abs(actionsBox!.y + actionsBox!.height - viewport.height)).toBeLessThanOrEqual(1);

        const scrollRegion = page.getByTestId('master-form-scroll');
        const start = await scrollRegion.evaluate(element => ({
          top: element.scrollTop,
          height: element.clientHeight,
          total: element.scrollHeight,
          overflowY: getComputedStyle(element).overflowY,
        }));
        expect(start.top).toBe(0);
        expect(['auto', 'scroll']).toContain(start.overflowY);
        await scrollRegion.evaluate(element => element.scrollTo(0, element.scrollHeight));
        const end = await scrollRegion.evaluate(element => ({
          top: element.scrollTop,
          height: element.clientHeight,
          total: element.scrollHeight,
        }));
        expect(end.top + end.height).toBeGreaterThanOrEqual(end.total - 1);
        await expectWithinViewport(primary, viewport.height);
        await expectNoHorizontalOverflow(page, `${fixture.flow} after full scroll`);

        const finalControl = scrollRegion.locator(fixture.finalControl).last();
        await finalControl.focus();
        await expect(finalControl).toBeFocused();
        await expectWithinViewport(finalControl, viewport.height);
        await expectWithinViewport(primary, viewport.height);
        await primary.click();
        const alert = page.getByRole('alert');
        await expect(alert).toBeVisible();
        await expect(alert).toBeFocused();
        await expectWithinViewport(alert, viewport.height);
        await expectWithinViewport(primary, viewport.height);
        await expectNoHorizontalOverflow(page, `${fixture.flow} after validation`);
        await secondary.click();
        await expect(page.getByRole('heading', { name: 'Workflow closed' })).toBeVisible();
      });
    }

    test('return editing uses cards, decimal keyboards, and a reachable review action', async ({ page }) => {
      await openFlow(page, 'returns', viewport);
      const cards = page.getByTestId('sales-return-mobile-lines');
      await expect(cards).toBeVisible();
      const returnSelection = page.getByRole('checkbox', { name: 'Mobile return Paracetamol 500 mg' });
      await expect(returnSelection).toBeVisible();
      await expectTapTarget(returnSelection.locator('..'));
      const billed = page.getByRole('textbox', { name: 'Billed quantity', exact: true });
      const free = page.getByRole('textbox', { name: 'Free quantity', exact: true });
      await expectTapTarget(billed);
      await expectTapTarget(free);
      await expect(billed).toHaveAttribute('inputmode', 'decimal');
      await expect(free).toHaveAttribute('inputmode', 'decimal');
      await billed.fill('2');
      await expect(billed).toHaveValue('2');
      const remove = page.getByRole('button', { name: 'Remove Paracetamol 500 mg' });
      await expectTapTarget(remove);
      const primary = page.getByRole('button', { name: 'Review return' });
      const reset = page.getByRole('button', { name: 'Reset' });
      await expectTapTarget(primary);
      await expectTapTarget(reset);
      await expectWithinViewport(primary, viewport.height);
      expect(await page.locator('button:visible').filter({ hasText: 'Review return' }).count()).toBe(1);
      const actions = page.getByTestId('erp-action-footer');
      const actionsBox = await actions.boundingBox();
      expect(actionsBox).not.toBeNull();
      expect(actionsBox!.y + actionsBox!.height).toBeLessThanOrEqual(viewport.height);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectWithinViewport(primary, viewport.height);
      await expectNoHorizontalOverflow(page, 'returns after full scroll');
      await remove.click();
      await expect(returnSelection).toBeHidden();
      await expect(primary).toBeDisabled();
      await reset.click();
      await expect(page.getByRole('checkbox', { name: 'Mobile return Paracetamol 500 mg' })).toBeVisible();
      await expect(primary).toBeEnabled();
    });

    test('shared review footer preserves a single dominant full-width action', async ({ page }) => {
      await openFlow(page, 'footer', viewport);
      const primary = page.getByRole('button', { name: 'Review invoice' });
      await expectTapTarget(primary);
      const reset = page.getByRole('button', { name: 'Reset' });
      await expectTapTarget(reset);
      const primaryBox = await primary.boundingBox();
      const resetBox = await reset.boundingBox();
      expect(primaryBox!.width).toBeGreaterThan(resetBox!.width);
      await expectWithinViewport(primary, viewport.height);
      expect(await page.locator('button:visible').filter({ hasText: 'Review invoice' }).count()).toBe(1);
      const actions = page.getByTestId('erp-action-footer');
      const actionsBox = await actions.boundingBox();
      expect(actionsBox).not.toBeNull();
      expect(Math.abs(actionsBox!.y + actionsBox!.height - viewport.height)).toBeLessThanOrEqual(1);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await expectWithinViewport(primary, viewport.height);
      await expectNoHorizontalOverflow(page, 'shared footer after full scroll');
    });
  });
}
