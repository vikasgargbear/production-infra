/**
 * useHashRouter — Minimal hash-based URL adapter for AasoPharma ERP desktop routing.
 *
 * Maps window.location.hash <-> (tab, subpage) state so that:
 *   - Every major module/workflow destination has a stable URL
 *   - Reload/Back/Forward restore the correct view
 *   - react-router-dom is NOT used (existing routerDependency.test enforces this)
 *
 * URL format:  #/<tab>[/<subpage>]
 * Examples:
 *   #/home
 *   #/stock-management
 *   #/stock-management/batch-tracking
 *   #/sales
 *
 * Migration note: Full React Router migration is outstanding. When react-router-dom
 * is eventually added, replace this hook with BrowserRouter + <Route> declarations
 * in App.tsx, and update routerDependency.test.js accordingly.
 */

import { useCallback, useEffect, useState } from 'react';

export interface HashRouterState {
  tab: string;
  subpage: string | null;
}

/** Parse #/<tab>[/<subpage>] — returns defaults if hash is empty or malformed. */
export function parseHash(hash: string): HashRouterState {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  const [, tab, subpage] = stripped.split('/');
  return {
    tab: tab || 'home',
    subpage: subpage || null,
  };
}

/** Serialise (tab, subpage) to a hash string. */
export function buildHash(tab: string, subpage?: string | null): string {
  if (subpage) return `#/${tab}/${subpage}`;
  return `#/${tab}`;
}

const RESERVED_PATHS = new Set(['/oauth/consent', '/e2e/calculation-smoke', '/e2e/mobile-navigation']);

/** Convert an old pathname deep link into the one canonical hash route. */
export function normalizePathnameRoute(
  pathname: string,
  hash: string,
  validTabs: readonly string[]
): HashRouterState {
  if (hash) return parseHash(hash);
  if (RESERVED_PATHS.has(pathname)) return { tab: 'home', subpage: null };
  let segments: string[];
  try {
    segments = pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
  } catch {
    return { tab: 'home', subpage: null };
  }
  const tab = segments[0];
  if (!tab || !validTabs.includes(tab)) return { tab: 'home', subpage: null };
  return { tab, subpage: segments[1] || null };
}

export interface UseHashRouterResult {
  tab: string;
  subpage: string | null;
  /**
   * Navigate to a tab (and optionally a subpage within it).
   * Pushes a new history entry — Back returns here.
   */
  navigateTo: (tab: string, subpage?: string | null) => void;
  /**
   * Update only the subpage within the current tab (replaces history entry so
   * switching sub-modules within a hub does not pollute history).
   */
  setSubpage: (subpage: string | null) => void;
}

export function useHashRouter(
  validTabs: readonly string[],
  hasAccess: (tab: string) => boolean
): UseHashRouterResult {
  const [state, setState] = useState<HashRouterState>(() => {
    const parsed = normalizePathnameRoute(window.location.pathname, window.location.hash, validTabs);
    const tab = validTabs.includes(parsed.tab) ? parsed.tab : 'home';
    return { tab, subpage: parsed.subpage };
  });

  // Keep state in sync when the user presses Back/Forward
  useEffect(() => {
    const onHashChange = () => {
      const parsed = parseHash(window.location.hash);
      const tab = validTabs.includes(parsed.tab) ? parsed.tab : 'home';
      setState({ tab, subpage: parsed.subpage });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [validTabs]);

  // On first mount, write the canonical hash for whatever tab is active (so reload works)
  useEffect(() => {
    const canonical = buildHash(state.tab, state.subpage);
    if (window.location.pathname !== '/' && !RESERVED_PATHS.has(window.location.pathname)) {
      window.history.replaceState(window.history.state, '', `/${window.location.search}${canonical}`);
      return;
    }
    if (window.location.hash !== canonical) {
      window.location.replace(canonical);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateTo = useCallback(
    (requestedTab: string, subpage?: string | null) => {
      if (!validTabs.includes(requestedTab)) return;
      if (requestedTab !== 'home' && !hasAccess(requestedTab)) return;
      const next: HashRouterState = { tab: requestedTab, subpage: subpage ?? null };
      const hash = buildHash(requestedTab, subpage);
      // Push so Back works
      window.location.hash = hash;
      setState(next);
    },
    [validTabs, hasAccess]
  );

  const setSubpage = useCallback((subpage: string | null) => {
    setState(prev => {
      const next = { ...prev, subpage };
      const hash = buildHash(prev.tab, subpage);
      // Replace so sub-module switching within a hub doesn't pollute Back stack
      window.location.replace(hash);
      return next;
    });
  }, []);

  return { tab: state.tab, subpage: state.subpage, navigateTo, setSubpage };
}
