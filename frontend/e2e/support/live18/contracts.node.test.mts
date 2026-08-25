import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertExactCommandTargets, interpolateUiSteps,
} from './runtimeUiValues.ts';

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
