import { test, expect } from '@playwright/test';

const proposal = { subject: '11111111-1111-4111-8111-111111111111', organization_id: '22222222-2222-4222-8222-222222222222',
  organization_name: 'Migration Test Organization', agent_grant_id: '33333333-3333-4333-8333-333333333333',
  client_id: 'reviewed-assistant', client_display_name: 'Reviewed Assistant',
  membership_id: '44444444-4444-4444-8444-444444444444', proposal_fingerprint: 'a'.repeat(64),
  branch_id: null, branch_name: null, consent_version: 'v1', expires_at: '2099-01-01T00:00:00Z',
  capabilities: [{ capability_code: 'sales.invoice.prepare', operation_mode: 'write', risk_class: 'consequential_write',
    approval_policy: 'actor_confirmation', maximum_amount: '10000.000000', currency_code: 'INR', allow_sensitive_read: true }] };

for (const width of [390, 1440]) {
  test(`explicit reviewed connection at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem('sb-consent-test-auth-token', JSON.stringify({ access_token: 'local-ui-test-token',
        refresh_token: 'local-ui-test-refresh', expires_at: 4070908800, expires_in: 3600, token_type: 'bearer',
        user: { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
          email: 'test@example.invalid', app_metadata: {}, user_metadata: {} } }));
    });
    let empty = false;
    const fakeErpToken = `test.${Buffer.from(JSON.stringify({ user_id: proposal.subject,
      org_id: proposal.organization_id, email: 'test@example.invalid', exp: 4070908800, permissions: {} })).toString('base64url')}.test`;
    await page.route('**/api/auth/oauth/supabase/session', route => route.fulfill({ json: { access_token: fakeErpToken } }));
    await page.route('**/api/auth/oauth/mcp/connections', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ json: { ...route.request().postDataJSON(), confirmed: true, receipt_id: 'receipt-test' } });
      } else await route.fulfill({ json: empty ? [] : [proposal, { ...proposal, organization_name: 'Second Test Organization',
        organization_id: '55555555-5555-4555-8555-555555555555', agent_grant_id: '66666666-6666-4666-8666-666666666666' }] });
    });
    await page.route('https://consent-test.supabase.co/**', route => route.fulfill({ json: {} }));
    await page.goto('/oauth/consent?connection_setup=1');
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm this organization and access' })).toHaveCount(0);
    await page.getByRole('combobox').selectOption('66666666-6666-4666-8666-666666666666');
    await expect(page.getByText('Includes sensitive records')).toBeVisible();
    await expect(page.getByText(/limit INR 10000.00/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`mcp-consent-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Confirm this organization and access' }).click();
    await expect(page.getByRole('button', { name: 'Connection confirmed' })).toBeDisabled();
    empty = true;
    await page.reload();
    await expect(page.getByText(/No reviewed connection grant is available/)).toBeVisible();
    await page.screenshot({ path: info.outputPath(`mcp-no-grant-${width}.png`), fullPage: true });
  });
}
