// Unified API base URL resolver for frontend services
// Provides a single source of truth for the backend origin across runtime environments

let cachedApiBaseUrl;

const ENV_FALLBACK_KEYS = [
  'REACT_APP_API_BASE_URL',
];

const RUNTIME_GLOBAL_KEYS = [
  '__API_BASE_URL',
];

function sanitizeUrl(candidate) {
  if (!candidate || typeof candidate !== 'string') {
    return undefined;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    const normalizedCandidate = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    const url = new URL(normalizedCandidate);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    let base = `${url.origin}${normalizedPath}`;

    if (base.endsWith('/api')) {
      base = base.slice(0, -4);
    }

    return base;
  } catch (error) {
    return undefined;
  }
}

function readEnvValue() {
  for (const key of ENV_FALLBACK_KEYS) {
    const value = process.env?.[key];
    const sanitized = sanitizeUrl(value);
    if (sanitized) {
      return sanitized;
    }
  }
  return undefined;
}

function readRuntimeValue() {
  if (typeof window === 'undefined') {
    return undefined;
  }

  for (const key of RUNTIME_GLOBAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(window, key)) {
      const sanitized = sanitizeUrl(window[key]);
      if (sanitized) {
        return sanitized;
      }
    }
  }

  const metaTag = document?.querySelector?.('meta[name="api-base-url"]');
  if (metaTag) {
    const sanitized = sanitizeUrl(metaTag.getAttribute('content'));
    if (sanitized) {
      return sanitized;
    }
  }

  if (window.location?.origin) {
    return sanitizeUrl(window.location.origin);
  }

  return undefined;
}

function readDefaultValue() {
  // Development fallback for non-browser environments (e.g. Jest)
  // Allows tests to execute without relying on a specific backend hostname
  return sanitizeUrl('http://localhost:8000');
}

export function getApiBaseUrl() {
  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  const resolved = readEnvValue() || readRuntimeValue() || readDefaultValue();
  cachedApiBaseUrl = resolved;
  return cachedApiBaseUrl;
}

export function getApiUrl(path = '') {
  const base = getApiBaseUrl();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export default getApiBaseUrl;
