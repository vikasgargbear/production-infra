import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertExactCommandTargets, interpolateUiSteps,
} from './runtimeUiValues.ts';
import { buildOperationFailureEvidence } from './failureEvidence.ts';
import { isExpectedSessionExchange } from './session.ts';

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

test('live18 discovery names exactly 18 unique ready operations', () => {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const matrix = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot, 'backend/tests/live_acceptance/operation_matrix.json',
  ), 'utf8')) as { required_operation_count: number; operations: Array<{ id: string }> };
  const readiness = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot, 'docs/testing/live18-ui-template-readiness.json',
  ), 'utf8')) as {
    ready_count: number;
    operations: Array<{ id: string; status: 'ready' | 'blocked' }>;
  };
  const matrixIds = matrix.operations.map(operation => operation.id);
  const readyIds = readiness.operations
    .filter(operation => operation.status === 'ready')
    .map(operation => operation.id);
  assert.equal(matrix.required_operation_count, 18);
  assert.equal(matrixIds.length, 18);
  assert.equal(new Set(matrixIds).size, 18);
  assert.equal(readiness.ready_count, 18);
  assert.deepEqual([...readyIds].sort(), [...matrixIds].sort());
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
