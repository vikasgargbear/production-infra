import { expect, test } from '@playwright/test';

const viewports = [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
  { width: 1280, height: 900 },
];

for (const viewport of viewports) {
  test(`login is Google-only and usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Pharma ERP' })).toBeVisible();
    await expect(page.getByText('Continue with Google to create or join an organization')).toBeVisible();
    const googleButton = page.getByRole('button', { name: 'Continue with Google' });
    await expect(googleButton).toBeVisible();
    await expect(googleButton).toBeEnabled();
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByText(/email and password/i)).toHaveCount(0);
    await expect(page.getByRole('button')).toHaveCount(1);

    const buttonBox = await googleButton.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);

    await page.screenshot({
      path: `test-results/artifacts/google-only-login/${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  });
}
