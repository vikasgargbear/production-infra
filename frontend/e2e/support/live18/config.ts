import { expect, request } from '@playwright/test';

const SHA = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for live18 certification.`);
  return value;
};

const httpsOrigin = (name: string): string => {
  const value = required(name).replace(/\/$/, '');
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    throw new Error(`${name} must be a non-local HTTPS origin.`);
  }
  return value;
};

export interface Live18BrowserConfig {
  appOrigin: string;
  apiOrigin: string;
  expectedSha: string;
  expectedOrgId: string;
  expectedBranchId: string;
  metadataUrls: string[];
  requester: { email: string; password: string };
  reviewer: { email: string; password: string };
  denialAccessToken: string;
}

export function loadBrowserConfig(): Live18BrowserConfig {
  if (required('LIVE18_WRITE_ACK') !== 'canonical-disposable-only') {
    throw new Error('LIVE18_WRITE_ACK must be exactly canonical-disposable-only.');
  }
  const expectedSha = required('LIVE18_EXPECTED_DEPLOYED_SHA').toLowerCase();
  if (!SHA.test(expectedSha)) throw new Error('A full lowercase deployed git SHA is required.');
  const expectedOrgId = required('LIVE18_EXPECTED_ORG_ID');
  const expectedBranchId = required('LIVE18_EXPECTED_BRANCH_ID');
  if (!UUID.test(expectedOrgId) || !UUID.test(expectedBranchId)) {
    throw new Error('Canonical organization and branch UUIDs are required.');
  }
  const metadataUrls = JSON.parse(required('LIVE18_METADATA_URLS_JSON')) as unknown;
  if (!Array.isArray(metadataUrls) || metadataUrls.length < 2
    || !metadataUrls.every(value => typeof value === 'string' && /^https:\/\//.test(value))) {
    throw new Error('Distinct HTTPS app and API metadata URLs are required.');
  }
  if (new Set(metadataUrls).size !== metadataUrls.length) {
    throw new Error('App and API metadata URLs must be distinct.');
  }
  const requester = {
    email: required('LIVE18_REQUESTER_EMAIL').toLowerCase(),
    password: required('LIVE18_REQUESTER_PASSWORD'),
  };
  const reviewer = {
    email: required('LIVE18_REVIEWER_EMAIL').toLowerCase(),
    password: required('LIVE18_REVIEWER_PASSWORD'),
  };
  if (requester.email === reviewer.email) throw new Error('Requester and reviewer must be distinct users.');
  return {
    appOrigin: httpsOrigin('LIVE18_APP_ORIGIN'),
    apiOrigin: httpsOrigin('LIVE18_API_ORIGIN'),
    expectedSha,
    expectedOrgId,
    expectedBranchId,
    metadataUrls,
    requester,
    reviewer,
    denialAccessToken: required('LIVE18_DENIAL_ACCESS_TOKEN'),
  };
}

export async function verifyDeployedSha(config: Live18BrowserConfig): Promise<void> {
  const client = await request.newContext();
  try {
    for (const url of config.metadataUrls) {
      const response = await client.get(url);
      expect(response.ok(), `metadata probe failed: ${url} (${response.status()})`).toBe(true);
      const body = await response.text();
      expect(body, `metadata ${url} does not expose the exact deployed SHA`).toContain(config.expectedSha);
    }
  } finally {
    await client.dispose();
  }
}
