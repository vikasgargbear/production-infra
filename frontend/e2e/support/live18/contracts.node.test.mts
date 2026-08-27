import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertExactCommandTargets, interpolateUiSteps, missingOperationResourceDependencies,
  operationResourceDependencies,
} from './runtimeUiValues.ts';
import {
  Live18BrowserHealth, rejectedPrepareOccurrences,
} from './browserHealth.ts';
import { buildOperationFailureEvidence } from './failureEvidence.ts';
import { isExpectedSessionExchange } from './session.ts';

test('reviewed screenshots stay manual, runner-local, and credential guarded', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const boundary = fs.readFileSync(path.join(
    repositoryRoot, 'frontend/e2e/live18/screenshotEvidence.ts',
  ), 'utf8');
  const spec = fs.readFileSync(path.join(
    repositoryRoot, 'frontend/e2e/live18/canonical-live18.spec.ts',
  ), 'utf8');
  const config = fs.readFileSync(path.join(
    repositoryRoot, 'frontend/e2e/support/live18/config.ts',
  ), 'utf8');
  assert.match(boundary, /LIVE18_PLAYWRIGHT_ARTIFACT_DIR/);
  assert.match(boundary, /path\.isAbsolute\(configuredRoot\)/);
  assert.match(boundary, /input\[type="password"\]:visible/);
  assert.match(boundary, /page\.screenshot\(/);
  assert.match(boundary, /mode: 0o700/);
  assert.match(boundary, /chmodSync\(destination, 0o600\)/);
  assert.match(config, /targetKind !== 'disposable_test'/);
  assert.match(config, /rgihahbmkrmhitjdjvev/);
  assert.equal((spec.match(/captureLive18Screenshot\(/g) || []).length, 2);
  assert.match(spec, /'missing-required'/);
  assert.match(spec, /'posted'/);
  assert.doesNotMatch(spec, /testInfo\.attach|page\.screenshot/);
});

test('session bootstrap accepts only the exact reviewed API origin', () => {
  assert.equal(isExpectedSessionExchange(
    'https://api.railway.example/api/auth/oauth/supabase/session',
    'POST',
    'https://api.railway.example',
  ), true);
  assert.equal(isExpectedSessionExchange(
    'https://api.render.example/api/auth/oauth/supabase/session',
    'POST',
    'https://api.railway.example',
  ), false);
  assert.equal(isExpectedSessionExchange(
    'https://api.railway.example/api/auth/oauth/supabase/session',
    'GET',
    'https://api.railway.example',
  ), false);
});

test('live18 discovery names all 17 ready operations and preserves one explicit deferral', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const matrix = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot, 'backend/tests/live_acceptance/operation_matrix.json',
  ), 'utf8')) as {
    operation_count: number;
    required_operation_count: number;
    deferred_operations: Array<{ id: string; status: 'deferred'; blocker_code: string }>;
    operations: Array<{ id: string }>;
  };
  const readiness = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot, 'docs/testing/live18-ui-template-readiness.json',
  ), 'utf8')) as {
    ready_count: number;
    deferred_count: number;
    operations: Array<{
      id: string;
      status: 'ready' | 'blocked' | 'deferred';
      blocker_code?: string;
    }>;
  };
  const matrixIds = matrix.operations.map(operation => operation.id);
  const readyIds = readiness.operations
    .filter(operation => operation.status === 'ready')
    .map(operation => operation.id);
  assert.equal(matrix.operation_count, 18);
  assert.equal(matrix.required_operation_count, 17);
  assert.equal(matrixIds.length, 18);
  assert.equal(new Set(matrixIds).size, 18);
  assert.equal(readiness.ready_count, 17);
  assert.equal(readiness.deferred_count, 1);
  assert.deepEqual(matrix.deferred_operations, [{
    id: 'expense_claim',
    status: 'deferred',
    blocker_code: 'EXPENSE_EVIDENCE_STORAGE_DEFERRED',
    blocker: 'Expense receipt upload certification is deferred until canonical evidence storage is enabled and least-privilege verified on the selected deployment provider.',
  }]);
  assert.deepEqual(
    readiness.operations.filter(operation => operation.status === 'deferred').map(operation => ({
      id: operation.id,
      blocker_code: operation.blocker_code,
    })),
    [{ id: 'expense_claim', blocker_code: 'EXPENSE_EVIDENCE_STORAGE_DEFERRED' }],
  );
  assert.deepEqual([...readyIds].sort(), matrixIds.filter(id => id !== 'expense_claim').sort());
});

test('operation failure evidence excludes messages, locator values, and credentials', () => {
  const failure = buildOperationFailureEvidence(
    'a'.repeat(40),
    'sales_invoice',
    {
      stage: 'prepare_steps',
      stepIndex: 4,
      actor: 'requester',
      action: 'fill',
      locatorKind: 'label',
    },
    new Error('password=must-not-upload; customer=must-not-upload'),
  );
  assert.deepEqual(failure, {
    evidence_schema: 'aasopharma.live18.browser-failure.v1',
    tested_sha: 'a'.repeat(40),
    operation_id: 'sales_invoice',
    stage: 'prepare_steps',
    step_index: 4,
    actor: 'requester',
    action: 'fill',
    locator_kind: 'label',
    error_kind: 'Error',
  });
  assert.doesNotMatch(JSON.stringify(failure), /must-not-upload/);
});

test('browser health evidence fingerprints sensitive diagnostics and strips query strings', () => {
  const listeners = new Map<string, (value: any) => void>();
  const page = {
    on(event: string, listener: (value: any) => void) {
      listeners.set(event, listener);
    },
  };
  const health = new Live18BrowserHealth();
  health.observe(page as any, 'requester', 'https://api.example');
  listeners.get('pageerror')?.(new Error('password=must-not-appear'));
  const failedApiRequest = {
    url: () => 'https://api.example/api/invoices?customer=must-not-appear',
    method: () => 'GET',
    failure: () => ({ errorText: 'token=must-not-appear' }),
  };
  listeners.get('request')?.(failedApiRequest);
  listeners.get('requestfailed')?.(failedApiRequest);
  const errorApiRequest = { method: () => 'GET', url: () => 'https://api.example/api/invoices' };
  listeners.get('request')?.(errorApiRequest);
  listeners.get('response')?.({
    url: () => 'https://api.example/api/invoices?customer=must-not-appear',
    status: () => 500,
    request: () => errorApiRequest,
  });
  const failedHealthRequest = {
    url: () => 'https://api.example/health?token=must-not-appear',
    method: () => 'GET',
    failure: () => ({ errorText: 'cors=must-not-appear' }),
  };
  listeners.get('request')?.(failedHealthRequest);
  listeners.get('requestfailed')?.(failedHealthRequest);
  const readyRequest = { method: () => 'GET', url: () => 'https://api.example/ready' };
  listeners.get('request')?.(readyRequest);
  listeners.get('response')?.({
    url: () => 'https://api.example/ready',
    status: () => 503,
    request: () => readyRequest,
  });
  const foreignRequest = { method: () => 'GET', url: () => 'https://other.example/api/invoices' };
  listeners.get('request')?.(foreignRequest);
  listeners.get('response')?.({
    url: () => 'https://other.example/api/invoices',
    status: () => 200,
    request: () => foreignRequest,
  });
  const evidence = health.snapshot();
  assert.equal(evidence.length, 6);
  assert.deepEqual(evidence.map(item => item.kind), [
    'page_error', 'request_failed', 'response_error', 'request_failed', 'response_error',
    'unexpected_api_origin',
  ]);
  assert.equal(evidence[1].path, '/api/invoices');
  assert.equal(evidence[3].path, '/health');
  assert.equal(evidence[4].path, '/ready');
  assert.deepEqual(evidence.map(item => item.occurrences), [1, 1, 1, 1, 1, 1]);
  assert.doesNotMatch(JSON.stringify(evidence), /must-not-appear|password|token|customer/);
  for (const item of evidence) assert.match(item.fingerprint, /^[0-9a-f]{64}$/);
  health.clear();
  assert.deepEqual(health.snapshot(), []);
});

test('browser health preserves repeated failure counts and rejects path-bearing API origins', () => {
  const listeners = new Map<string, (value: any) => void>();
  const page = {
    on(event: string, listener: (value: any) => void) {
      listeners.set(event, listener);
    },
  };
  const health = new Live18BrowserHealth();
  assert.throws(
    () => health.observe(page as any, 'requester', 'https://api.example/base'),
    /requires one credential-free HTTPS API origin/,
  );
  health.observe(page as any, 'requester', 'https://api.example/');
  const rejectedRequest = {
    url: () => 'https://api.example/api/web/actions/sales.invoice.prepare/prepare',
    method: () => 'POST',
  };
  listeners.get('request')?.(rejectedRequest);
  const rejected = {
    url: () => 'https://api.example/api/web/actions/sales.invoice.prepare/prepare',
    status: () => 422,
    request: () => rejectedRequest,
  };
  listeners.get('response')?.(rejected);
  listeners.get('response')?.(rejected);
  const [failure] = health.snapshot();
  assert.equal(failure.occurrences, 2);
});

test('browser health redacts UUID paths and ignores failures started before a phase clear', () => {
  const listeners = new Map<string, (value: any) => void>();
  const page = { on(event: string, listener: (value: any) => void) { listeners.set(event, listener); } };
  const health = new Live18BrowserHealth();
  health.observe(page as any, 'reviewer', 'https://api.example');
  const request = {
    url: () => 'https://api.example/api/web/actions/commands/d3000000-0000-7000-8000-000000000041/review',
    method: () => 'GET',
    failure: () => ({ errorText: 'navigation aborted' }),
  };
  listeners.get('request')?.(request);
  health.clear();
  listeners.get('requestfailed')?.(request);
  assert.deepEqual(health.snapshot(), []);
  listeners.get('request')?.(request);
  listeners.get('requestfailed')?.(request);
  const [failure] = health.snapshot();
  assert.equal(failure.path, '/api/web/actions/commands/{uuid}/review');
});

test('browser health rejects a foreign API request before it can cross a phase clear', () => {
  const listeners = new Map<string, (value: any) => void>();
  const page = { on(event: string, listener: (value: any) => void) { listeners.set(event, listener); } };
  const health = new Live18BrowserHealth();
  health.observe(page as any, 'requester', 'https://api.example');
  const request = {
    url: () => 'https://old-api.example/api/web/actions/sales.invoice.prepare/prepare',
    method: () => 'POST',
  };
  listeners.get('request')?.(request);
  const beforeClear = health.snapshot();
  assert.equal(beforeClear.length, 1);
  assert.equal(beforeClear[0].kind, 'unexpected_api_origin');
  health.clear();
  listeners.get('response')?.({
    url: request.url,
    status: () => 200,
    request: () => request,
  });
  assert.deepEqual(health.snapshot(), []);
});

test('missing-required health counts distinct 400 and 422 prepare failures together', () => {
  const failures = [400, 422].map(status => ({
    actor: 'requester' as const,
    kind: 'response_error' as const,
    method: 'POST',
    path: '/api/web/actions/sales.invoice.prepare/prepare',
    status,
    fingerprint: String(status).padStart(64, '0'),
    occurrences: 1,
  }));
  assert.equal(rejectedPrepareOccurrences(
    failures,
    '/api/web/actions/sales.invoice.prepare/prepare',
  ), 2);
});

test('runtime values target the exact prepared command in value and locator name', () => {
  const [step] = interpolateUiSteps(
    [{
      actor: 'reviewer',
      action: 'fill',
      locator: { kind: 'label', name: 'Command {{command_request_id}}' },
      value: '{{command_request_id}}|{{preview_hash}}|REF-{{run_token}}',
    }],
    {
      command_request_id: 'd3000000-0000-7000-8000-000000000001',
      preview_hash: `sha256:${'a'.repeat(64)}`,
      run_token: '12345-2',
    },
    'sales_invoice.approval_steps',
  );

  assert.equal(step.locator?.name, 'Command d3000000-0000-7000-8000-000000000001');
  assert.equal(
    step.value,
    `d3000000-0000-7000-8000-000000000001|sha256:${'a'.repeat(64)}|REF-12345-2`,
  );
});

test('runtime interpolation rejects unknown and unavailable tokens', () => {
  const runtime = { run_token: '12345-2' };
  assert.throws(
    () => interpolateUiSteps(
      [{ actor: 'requester', action: 'fill', value: '{{invoice_id}}' }], runtime,
    ),
    /unsupported runtime token \{\{invoice_id\}\}/,
  );
  assert.throws(
    () => interpolateUiSteps(
      [{ actor: 'reviewer', action: 'fill', value: '{{command_request_id}}' }], runtime,
    ),
    /unavailable runtime token \{\{command_request_id\}\}/,
  );
});

test('runtime interpolation accepts only explicitly supplied prior-operation resources', () => {
  const [step] = interpolateUiSteps(
    [{ actor: 'requester', action: 'fill', value: '{{resource_purchase_order}}' }],
    {
      run_token: '12345-2',
      resource_purchase_order: 'd3000000-0000-7000-8000-000000000041',
    },
  );
  assert.equal(step.value, 'd3000000-0000-7000-8000-000000000041');
  assert.throws(
    () => interpolateUiSteps(
      [{ actor: 'requester', action: 'fill', value: '{{resource_purchase_order}}' }],
      { run_token: '12345-2' },
    ),
    /unavailable runtime token \{\{resource_purchase_order\}\}/,
  );
});

test('operation resource dependencies are exact, deduplicated, and fail closed until propagated', () => {
  const steps = (overrides: Record<string, unknown> = {}) => ([{
    actor: 'requester',
    action: 'expectText',
    locator: { kind: 'text', name: 'Visible validation', exact: true },
    ...overrides,
  }]);
  const operation = {
    lifecycle_mode: 'split',
    missing_required_steps: steps({
      locator: {
        kind: 'role', role: 'button', exact: true,
        name: 'Receive {{resource_purchase_order}}',
      },
    }),
    prepare_steps: steps({ value: '{{resource_purchase_order}}' }),
    approval_steps: steps({ value: '{{command_request_id}}' }),
    execute_steps: steps({ value: '{{resource_goods_receipt}}' }),
  };

  assert.deepEqual(operationResourceDependencies(operation), [
    'resource_goods_receipt', 'resource_purchase_order',
  ]);
  assert.deepEqual(missingOperationResourceDependencies(operation, {}), [
    'resource_goods_receipt', 'resource_purchase_order',
  ]);
  assert.deepEqual(missingOperationResourceDependencies(operation, {
    resource_purchase_order: 'd3000000-0000-7000-8000-000000000041',
  }), ['resource_goods_receipt']);
  assert.deepEqual(missingOperationResourceDependencies(operation, {
    resource_purchase_order: 'd3000000-0000-7000-8000-000000000041',
    resource_goods_receipt: 'd3000000-0000-7000-8000-000000000042',
  }), []);
});

test('all 18 reviewed routes must target their captured command during approval and execute', () => {
  const operations = Object.fromEntries(Array.from({ length: 18 }, (_value, index) => [
    `operation_${index + 1}`,
    {
      approval_steps: [{
        actor: 'reviewer', action: 'fill', locator: { kind: 'label', name: 'Command ID' },
        value: '{{command_request_id}}',
      }],
      execute_steps: [{
        actor: 'requester', action: 'click',
        locator: { kind: 'role', role: 'button', name: 'Execute {{command_request_id}}' },
      }],
    },
  ]));
  assert.doesNotThrow(() => assertExactCommandTargets(operations));
  operations.operation_1.approval_steps[0].value = 'first pending';
  assert.throws(
    () => assertExactCommandTargets(operations),
    /must target the captured \{\{command_request_id\}\}/,
  );
});
