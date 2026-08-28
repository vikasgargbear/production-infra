import { expect, test, type Locator, type Page } from '@playwright/test';

const viewports = [
  { name: '360x800', width: 360, height: 800 },
  { name: '412x915', width: 412, height: 915 },
] as const;

async function openFlow(page: Page, flow: string, viewport: typeof viewports[number]) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`/e2e/mobile-workflows?flow=${flow}`);
  await expect(page.locator('html')).toBeAttached();
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
    });

    for (const fixture of [
      { flow: 'product', title: 'New product draft', submit: 'Save product draft', input: /Product name/ },
      { flow: 'customer', title: 'New Customer', submit: 'Save Customer', input: /Customer Name/ },
      { flow: 'supplier', title: 'Add New Supplier', submit: 'Save Supplier', input: /Supplier Name/ },
    ]) {
      test(`${fixture.flow} form keeps one reachable primary CTA and focuses validation`, async ({ page }) => {
        await openFlow(page, fixture.flow, viewport);
        await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
        await expectTapTarget(page.getByLabel(fixture.input));
        const primary = page.getByRole('button', { name: fixture.submit });
        await expectTapTarget(primary);
        const box = await primary.boundingBox();
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        await primary.click();
        const alert = page.getByRole('alert');
        await expect(alert).toBeVisible();
        await expect(alert).toBeFocused();
      });
    }

    test('return editing uses cards, decimal keyboards, and a reachable review action', async ({ page }) => {
      await openFlow(page, 'returns', viewport);
      const cards = page.getByTestId('sales-return-mobile-lines');
      await expect(cards).toBeVisible();
      const returnSelection = page.getByRole('checkbox', { name: 'Mobile return Paracetamol 500 mg' });
      await expect(returnSelection).toBeVisible();
      await expectTapTarget(returnSelection.locator('..'));
      const billed = page.getByLabel('Billed quantity');
      const free = page.getByLabel('Free quantity');
      await expectTapTarget(billed);
      await expectTapTarget(free);
      await expect(billed).toHaveAttribute('inputmode', 'decimal');
      await expect(free).toHaveAttribute('inputmode', 'decimal');
      await billed.fill('2');
      await expect(billed).toHaveValue('2');
      await expectTapTarget(page.getByRole('button', { name: 'Review return' }));
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
      expect(primaryBox!.y + primaryBox!.height).toBeLessThanOrEqual(viewport.height);
    });
  });
}
