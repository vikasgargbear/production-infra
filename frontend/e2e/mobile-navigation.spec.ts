import { expect, test } from '@playwright/test';

test.describe('mobile ERP navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/e2e/mobile-navigation');
    await expect(page.getByTestId('mobile-navigation-harness')).toBeVisible();
  });

  test('pins the primary bar to the bottom safe area with clear destinations', async ({ page }) => {
    const navigation = page.getByRole('navigation', { name: 'Primary mobile navigation' });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    await expect(navigation.getByRole('button', { name: 'Sales' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Purchase' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'Stock' })).toBeVisible();
    await expect(navigation.getByRole('button', { name: 'More' })).toBeVisible();

    const box = await navigation.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs((box!.y + box!.height) - 844)).toBeLessThanOrEqual(1);
    expect(box!.x).toBe(0);
    expect(box!.width).toBe(390);
  });

  test('opens More above the bar and uses labeled module tabs inside a hub', async ({ page }) => {
    const primaryNavigation = page.getByRole('navigation', { name: 'Primary mobile navigation' });
    await primaryNavigation.getByRole('button', { name: 'More' }).click();

    const moreSheet = page.getByRole('region', { name: 'More modules' });
    await expect(moreSheet).toBeVisible();
    await expect(moreSheet.getByRole('button', { name: 'Returns' })).toBeVisible();
    await expect(moreSheet.getByRole('button', { name: 'Finance' })).toBeVisible();
    await expect(moreSheet.getByRole('button', { name: 'Master Data' })).toBeVisible();

    const sheetBox = await moreSheet.boundingBox();
    const navigationBox = await primaryNavigation.boundingBox();
    expect(sheetBox).not.toBeNull();
    expect(navigationBox).not.toBeNull();
    expect(sheetBox!.y + sheetBox!.height).toBeLessThanOrEqual(navigationBox!.y + 1);

    await page.getByRole('button', { name: 'Close more modules' }).click();
    await primaryNavigation.getByRole('button', { name: 'Sales' }).click();

    const moduleNavigation = page.getByRole('navigation', { name: 'Sales modules' });
    await expect(moduleNavigation).toBeVisible();
    await expect(moduleNavigation.getByRole('button', { name: 'Create Invoice' })).toHaveAttribute('aria-current', 'page');
    await expect(moduleNavigation.getByRole('button', { name: 'Sales History' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  });

  test('hides the mobile bar at desktop width', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Primary mobile navigation' })).toBeHidden();
  });
});
