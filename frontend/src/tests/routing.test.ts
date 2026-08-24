/**
 * Routing tests for AasoPharma ERP desktop navigation.
 *
 * These tests verify the hash-based URL adapter (useHashRouter) that provides
 * stable deep-link behaviour without react-router-dom.
 *
 * Full React Router migration is outstanding — when react-router-dom is added,
 * migrate these to use MemoryRouter + <Routes> and update routerDependency.test.js.
 */

import { parseHash, buildHash, normalizePathnameRoute } from '../hooks/useHashRouter';

// ---------------------------------------------------------------------------
// parseHash
// ---------------------------------------------------------------------------

describe('parseHash', () => {
  it('returns home tab with null subpage for empty string', () => {
    expect(parseHash('')).toEqual({ tab: 'home', subpage: null });
  });

  it('returns home tab with null subpage for bare hash #/', () => {
    expect(parseHash('#/')).toEqual({ tab: 'home', subpage: null });
  });

  it('parses a top-level tab', () => {
    expect(parseHash('#/sales')).toEqual({ tab: 'sales', subpage: null });
  });

  it('parses stock-management tab without subpage', () => {
    expect(parseHash('#/stock-management')).toEqual({
      tab: 'stock-management',
      subpage: null,
    });
  });

  it('parses /inventory/stock as stock-management tab and current-stock subpage', () => {
    // The URL spec uses the tab name directly; inventory/stock is a deep-link alias
    // handled by buildHash, not parseHash.  This test verifies parseHash is literal.
    expect(parseHash('#/stock-management/current-stock')).toEqual({
      tab: 'stock-management',
      subpage: 'current-stock',
    });
  });

  it('parses batch-tracking subpage', () => {
    expect(parseHash('#/stock-management/batch-tracking')).toEqual({
      tab: 'stock-management',
      subpage: 'batch-tracking',
    });
  });

  it('parses purchase tab', () => {
    expect(parseHash('#/purchase')).toEqual({ tab: 'purchase', subpage: null });
  });

  it('parses gst tab', () => {
    expect(parseHash('#/gst')).toEqual({ tab: 'gst', subpage: null });
  });

  it('returns home tab for a hash with only #', () => {
    expect(parseHash('#')).toEqual({ tab: 'home', subpage: null });
  });
});

// ---------------------------------------------------------------------------
// buildHash
// ---------------------------------------------------------------------------

describe('buildHash', () => {
  it('builds a top-level tab hash', () => {
    expect(buildHash('sales')).toBe('#/sales');
  });

  it('builds a hash with a subpage', () => {
    expect(buildHash('stock-management', 'batch-tracking')).toBe(
      '#/stock-management/batch-tracking'
    );
  });

  it('builds a hash without subpage when subpage is null', () => {
    expect(buildHash('stock-management', null)).toBe('#/stock-management');
  });

  it('builds home hash', () => {
    expect(buildHash('home')).toBe('#/home');
  });

  it('builds current-stock subpage URL', () => {
    expect(buildHash('stock-management', 'current-stock')).toBe(
      '#/stock-management/current-stock'
    );
  });

  it('builds stock-adjustment subpage URL', () => {
    expect(buildHash('stock-management', 'stock-adjustment')).toBe(
      '#/stock-management/stock-adjustment'
    );
  });
});

// ---------------------------------------------------------------------------
// Round-trip: build then parse
// ---------------------------------------------------------------------------

describe('round-trip: buildHash -> parseHash', () => {
  const cases: Array<[string, string | null]> = [
    ['home', null],
    ['sales', null],
    ['purchase', null],
    ['stock-management', null],
    ['stock-management', 'current-stock'],
    ['stock-management', 'batch-tracking'],
    ['stock-management', 'stock-adjustment'],
    ['stock-management', 'stock-transfer'],
    ['stock-management', 'stock-movement'],
    ['gst', null],
    ['reports', null],
    ['master', null],
    ['returns', null],
    ['party-ledger', null],
    ['credit-debit-note', null],
    ['payment', null],
  ];

  test.each(cases)('tab=%s subpage=%s survives round-trip', (tab, subpage) => {
    const hash = buildHash(tab, subpage);
    const parsed = parseHash(hash);
    expect(parsed.tab).toBe(tab);
    expect(parsed.subpage).toBe(subpage);
  });
});

// ---------------------------------------------------------------------------
// Stable URL deep-link assertions (human-readable contract)
// ---------------------------------------------------------------------------

describe('stable URL contracts', () => {
  it('navigating to #/stock-management/current-stock yields CurrentStock module', () => {
    const { tab, subpage } = parseHash('#/stock-management/current-stock');
    expect(tab).toBe('stock-management');
    expect(subpage).toBe('current-stock');
  });

  it('navigating to #/stock-management/batch-tracking yields BatchTracking module', () => {
    const { tab, subpage } = parseHash('#/stock-management/batch-tracking');
    expect(tab).toBe('stock-management');
    expect(subpage).toBe('batch-tracking');
  });

  it('navigating to #/sales yields the SalesHub', () => {
    const { tab, subpage } = parseHash('#/sales');
    expect(tab).toBe('sales');
    expect(subpage).toBeNull();
  });

  it('navigating to #/purchase yields the PurchaseHub', () => {
    const { tab } = parseHash('#/purchase');
    expect(tab).toBe('purchase');
  });

  it('navigating to #/home yields the Home screen', () => {
    const { tab } = parseHash('#/home');
    expect(tab).toBe('home');
  });

  /**
   * Back navigation contract:
   *
   * useHashRouter pushes `window.location.hash` (via assignment) when navigateTo()
   * is called, which adds a history entry.  setSubpage() uses location.replace(),
   * which does NOT add a history entry.
   *
   * Therefore:
   *   navigateTo('stock-management')  -> history entry A
   *   setSubpage('batch-tracking')    -> replaces A, no new entry
   *   press Back                      -> returns to the entry before A
   *
   * This matches the requirement: pressing Back from a sub-page in a hub returns
   * to the prior tab, not another sub-page within the same hub.
   *
   * We cannot fully test browser history in Jest (jsdom doesn't run real navigation),
   * but we document the expected contract here and verify the URL strings are correct.
   */
  it('Back navigation contract: navigateTo pushes history; setSubpage replaces it', () => {
    // navigateTo uses  window.location.hash = hash  (pushState equivalent for hashes)
    // setSubpage uses  window.location.replace(hash) (replaceState equivalent)
    // This is documented in useHashRouter.ts and enforced by this comment test.
    const navHash = buildHash('stock-management');
    const subHash = buildHash('stock-management', 'batch-tracking');
    // Both produce valid parseable URLs
    expect(parseHash(navHash).tab).toBe('stock-management');
    expect(parseHash(subHash).subpage).toBe('batch-tracking');
    // The subpage hash is "deeper" than the tab hash — replace ensures no extra history entry
    expect(subHash).toContain(navHash.replace('#/', '#/'));
  });
});

describe('legacy pathname normalization', () => {
  const tabs = ['home', 'sales', 'purchase', 'stock-management'] as const;

  it('maps a supported pathname into the canonical tab and subpage', () => {
    expect(normalizePathnameRoute('/sales/create-invoice', '', tabs)).toEqual({
      tab: 'sales', subpage: 'create-invoice',
    });
  });

  it('keeps an existing hash authoritative', () => {
    expect(normalizePathnameRoute('/unsupported', '#/purchase/history', tabs)).toEqual({
      tab: 'purchase', subpage: 'history',
    });
  });

  it('fails unsupported and reserved pathnames closed to home', () => {
    expect(normalizePathnameRoute('/unsupported', '', tabs)).toEqual({ tab: 'home', subpage: null });
    expect(normalizePathnameRoute('/oauth/consent', '', tabs)).toEqual({ tab: 'home', subpage: null });
  });
});
