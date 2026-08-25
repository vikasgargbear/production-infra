import fs from 'fs';
import path from 'path';

const e2e = (name: string) => fs.readFileSync(
  path.resolve(process.cwd(), 'e2e', name),
  'utf8',
);

const support = (name: string) => fs.readFileSync(
  path.resolve(process.cwd(), 'e2e', 'support', name),
  'utf8',
);

test('explicit live writes cannot skip the sales-chain API because its fixture is absent', () => {
  const source = e2e('live-sales-chain-api.spec.ts');

  expect(source).toContain("const enabled = /^https:\\/\\//.test(baseURL) && Boolean(email && password) && writes;");
  expect(source).toContain('test.beforeAll(() => { requiredFixture(); });');
  expect(source).toContain('this acceptance test must not skip');
  expect(source).not.toContain('Boolean(email && password && fixtureText)');
});

test('live GST acceptance unconditionally requests and proves the previous organization period', () => {
  const source = e2e('live-history-gst-readonly.spec.ts');

  expect(source).toContain("gstResponseFor(page, 'gstr3b', ranges.previous)");
  expect(source).toContain("gstResponseFor(page, 'gstr1', ranges.previous)");
  expect(source).toContain('.not.toBe(currentSignature)');
  expect(source).not.toMatch(/if\s*\(currentSignature\s*!==\s*previousSignature\)/);
});

test('live core API calendar inputs use the authoritative organization clock', () => {
  const core = e2e('live-canonical-core-api.spec.ts');
  const sales = e2e('live-sales-chain-api.spec.ts');

  expect(core).toContain("'/canonical/business-context'");
  expect(sales).toContain("'/canonical/business-context'");
  expect(`${core}\n${sales}`).not.toMatch(/todayIst|Asia\/Kolkata/);
});

test('live browser organization binding resolves the backend origin before fetching context', () => {
  const source = support('live-erp.ts');
  const contextFetch = `fetch(\`\${origin}/api/canonical/business-context\``;

  expect(source).toContain("new URL((await apiReference).url()).origin");
  expect(source).toContain(contextFetch);
  expect(source).not.toContain("fetch('/api/canonical/business-context'");
});

test('live Stock Hub readback binds API calls to the authenticated backend origin', () => {
  const source = e2e('live-stock-hub-ui.spec.ts');
  const backendFetch = `fetch(\`\${apiOrigin}/api\${path}\``;
  const relativeFetch = `fetch(\`/api\${path}\``;

  expect(source).toContain('const apiOrigin = new URL((await contextResponsePromise).url()).origin;');
  expect(source).toContain(backendFetch);
  expect(source).not.toContain(relativeFetch);
});
