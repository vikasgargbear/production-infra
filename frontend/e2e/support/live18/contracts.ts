import fs from 'fs';
import path from 'path';

import { assertExactCommandTargets, runtimeTokens } from './runtimeUiValues';

export type ApprovalPolicy = 'actor_confirmation' | 'separate_approver';

export interface OperationContract {
  id: string;
  command_operation: string | null;
  prepare_tool: string | null;
  approval_policy: ApprovalPolicy;
  rest_readback: string | null;
  mcp_readback_tool: string | null;
  database_relations: string[];
  scenario_steps: string[];
  availability: 'published' | 'blocked';
  blocker?: string;
  certification_status: 'ready' | 'blocked' | 'deferred';
  certification_blocker_code?: string;
  certification_blocker?: string;
}

interface OperationMatrix {
  operation_count: number;
  required_operation_count: number;
  deferred_operations: Array<{
    id: string;
    status: 'deferred';
    blocker_code: string;
    blocker: string;
  }>;
  operations: OperationContract[];
}

interface TemplateReadiness {
  ready_count: number;
  deferred_count: number;
  operations: Array<{
    id: string;
    status: 'ready' | 'blocked' | 'deferred';
    blocker_code?: string;
    blocker?: string;
  }>;
}

export type LocatorKind = 'role' | 'label' | 'placeholder' | 'text' | 'testId';
export type UiAction = 'goto' | 'click' | 'fill' | 'select' | 'setInputFiles' | 'press' | 'expectText' | 'expectDisabled';
export type Actor = 'requester' | 'reviewer';
export type LifecycleMode = 'split' | 'combined_actor_confirmation';

export interface UiStep {
  actor: Actor;
  action: UiAction;
  locator?: { kind: LocatorKind; name: string; role?: string; exact?: boolean };
  value?: string;
}

export interface OperationFixture {
  lifecycle_mode: LifecycleMode;
  missing_required_steps: UiStep[];
  prepare_steps: UiStep[];
  approval_steps: UiStep[];
  execute_steps: UiStep[];
}

export interface Live18Fixture {
  fixture_schema: 'aasopharma.live18.fixture.v1';
  operations: Record<string, OperationFixture>;
  business_variants?: Record<string, OperationFixture>;
}

interface SupportedBusinessVariantRegistry {
  schema: 'aasopharma.live23.supported-business-readiness.v1';
  required_variant_count: number;
  ready_count: number;
  variants: Array<{
    id: string;
    operation_id: string;
    status: 'ready';
    exact_sha_required: true;
    template: string;
    depends_on_resources: string[];
    schedule_after_operation: string;
    command_operation: string;
    prepare_tool: string;
    approval_policy: ApprovalPolicy;
    rest_readback: string;
    mcp_readback_tool: string;
    database_relations: string[];
    posted_heading: string;
  }>;
}

const repositoryRoot = path.resolve(__dirname, '../../../..');

export function loadOperationMatrix(): OperationContract[] {
  const matrixPath = path.join(
    repositoryRoot, 'backend/tests/live_acceptance/operation_matrix.json',
  );
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8')) as OperationMatrix;
  if (matrix.operation_count !== 18 || matrix.operations.length !== matrix.operation_count
    || new Set(matrix.operations.map(item => item.id)).size !== matrix.operation_count
    || !Array.isArray(matrix.deferred_operations)
    || matrix.required_operation_count !== matrix.operation_count - matrix.deferred_operations.length) {
    throw new Error('The live18 matrix must contain 18 catalogued operations and an exact ready scope.');
  }
  const deferred = new Map(matrix.deferred_operations.map(item => {
    if (item.status !== 'deferred' || !item.id || !item.blocker || !/^[A-Z][A-Z0-9_]+$/.test(item.blocker_code)) {
      throw new Error('The live18 matrix contains an invalid deferred operation.');
    }
    return [item.id, item] as const;
  }));
  if (deferred.size !== matrix.deferred_operations.length
    || [...deferred.keys()].some(id => !matrix.operations.some(item => item.id === id))) {
    throw new Error('The live18 matrix deferred operation set is invalid.');
  }
  const contracts = matrix.operations.map(item => {
    const deferredItem = deferred.get(item.id);
    return {
      ...item,
      certification_status: item.availability === 'blocked'
        ? 'blocked' as const
        : deferredItem ? 'deferred' as const : 'ready' as const,
      certification_blocker_code: deferredItem?.blocker_code,
      certification_blocker: deferredItem?.blocker,
    };
  });
  if (contracts.filter(item => item.certification_status === 'ready').length
      !== matrix.required_operation_count) {
    throw new Error('The live18 matrix ready scope does not match its required count.');
  }
  return contracts;
}

export function loadReadyOperationMatrix(): OperationContract[] {
  const readinessPath = path.join(
    repositoryRoot, 'docs/testing/live18-ui-template-readiness.json',
  );
  const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8')) as TemplateReadiness;
  if (!Number.isInteger(readiness.ready_count) || !Array.isArray(readiness.operations)) {
    throw new Error('The live18 UI readiness registry is invalid.');
  }
  const matrix = loadOperationMatrix();
  const matrixIds = new Set(matrix.map(item => item.id));
  const readinessIds = readiness.operations.map(item => item.id);
  if (readiness.operations.some(item => !['ready', 'blocked', 'deferred'].includes(item.status))) {
    throw new Error('The live18 UI readiness registry contains an invalid status.');
  }
  if (readinessIds.length !== matrix.length
    || new Set(readinessIds).size !== readinessIds.length
    || readinessIds.some(id => !matrixIds.has(id))) {
    throw new Error('The live18 UI readiness registry must cover the exact operation matrix.');
  }
  const readyIds = new Set(
    readiness.operations.filter(item => item.status === 'ready').map(item => item.id),
  );
  if (readyIds.size !== readiness.ready_count) {
    throw new Error('The live18 UI readiness count does not match its ready operations.');
  }
  const deferredRows = readiness.operations.filter(item => item.status === 'deferred');
  if (deferredRows.length !== readiness.deferred_count) {
    throw new Error('The live18 UI deferred count does not match its deferred operations.');
  }
  for (const contract of matrix) {
    const row = readiness.operations.find(item => item.id === contract.id)!;
    if (row.status !== contract.certification_status
      || (row.status === 'deferred' && (
        row.blocker_code !== contract.certification_blocker_code
        || row.blocker !== contract.certification_blocker
      ))) {
      throw new Error(`${contract.id} readiness differs from the authoritative matrix.`);
    }
  }
  return matrix.filter(item => readyIds.has(item.id));
}

export function loadSupportedBusinessVariantMatrix(): Array<OperationContract & {
  posted_heading: string; schedule_after_operation: string;
}> {
  const registry = JSON.parse(fs.readFileSync(path.join(
    repositoryRoot, 'backend/tests/live_acceptance/live23_supported_business_readiness.json',
  ), 'utf8')) as SupportedBusinessVariantRegistry;
  if (registry.schema !== 'aasopharma.live23.supported-business-readiness.v1'
    || registry.required_variant_count !== 7 || registry.ready_count !== 7
    || !Array.isArray(registry.variants) || registry.variants.length !== 7
    || new Set(registry.variants.map(row => row.id)).size !== 7) {
    throw new Error('The supported-business variant registry must contain exactly seven ready variants.');
  }
  const available = new Set([
    'sales_invoice', 'sales_order', 'sales_return', 'purchase_return', 'customer_credit_note',
  ]);
  const schedule: Record<string, string> = {
    customer_receipt_cheque_clearance: 'sales_order',
    customer_cheque_clearance: 'sales_order',
    customer_receipt_cheque_bounce: 'sales_order',
    customer_cheque_bounce: 'sales_order',
    sales_return_reversal: 'sales_return',
    purchase_return_reversal: 'purchase_return',
    adjustment_note_reversal: 'customer_credit_note',
  };
  return registry.variants.map(row => {
    if (row.status !== 'ready' || row.exact_sha_required !== true
      || !row.id || !row.operation_id || !row.command_operation || !row.prepare_tool
      || !row.rest_readback || !row.mcp_readback_tool || !row.posted_heading
      || row.schedule_after_operation !== schedule[row.id]
      || !['actor_confirmation', 'separate_approver'].includes(row.approval_policy)
      || !Array.isArray(row.database_relations) || row.database_relations.length === 0
      || !Array.isArray(row.depends_on_resources) || row.depends_on_resources.length === 0
      || row.depends_on_resources.some(resource => !available.has(resource))) {
      throw new Error(`${row.id || 'unknown'} supported-business contract is incomplete or unordered.`);
    }
    available.add(row.id);
    return {
      id: row.id,
      command_operation: row.command_operation,
      prepare_tool: row.prepare_tool,
      approval_policy: row.approval_policy,
      rest_readback: row.rest_readback,
      mcp_readback_tool: row.mcp_readback_tool,
      database_relations: row.database_relations,
      scenario_steps: [row.id],
      availability: 'published' as const,
      certification_status: 'ready' as const,
      posted_heading: row.posted_heading,
      schedule_after_operation: row.schedule_after_operation,
    };
  });
}

export function loadFixture(required: boolean): Live18Fixture | null {
  const fixturePath = process.env.LIVE18_FIXTURE_PATH?.trim();
  if (!fixturePath) {
    if (required) throw new Error('LIVE18_FIXTURE_PATH is required for a live run.');
    return null;
  }
  if (!path.isAbsolute(fixturePath)) {
    throw new Error('LIVE18_FIXTURE_PATH must be an absolute path outside the repository.');
  }
  const relativeFixturePath = path.relative(repositoryRoot, fixturePath);
  if (!relativeFixturePath.startsWith('..') && !path.isAbsolute(relativeFixturePath)) {
    throw new Error('LIVE18_FIXTURE_PATH must remain outside the repository.');
  }
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Live18Fixture;
  if (fixture.fixture_schema !== 'aasopharma.live18.fixture.v1'
    || !fixture.operations || typeof fixture.operations !== 'object') {
    throw new Error('The reviewed live18 fixture has an invalid schema or operations object.');
  }
  const operationMatrix = loadReadyOperationMatrix();
  if (required && operationMatrix.length === 0) {
    throw new Error('A required live18 run must discover the complete ready operation scope.');
  }
  const expected = operationMatrix.map(item => item.id).sort();
  const actual = Object.keys(fixture.operations).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('The reviewed live18 fixture must name exactly the release-ready operations.');
  }
  const businessVariantsRequired = process.env.LIVE23_BUSINESS_VARIANTS_REQUIRED === 'true';
  const businessMatrix = loadSupportedBusinessVariantMatrix();
  if (businessVariantsRequired) {
    const expectedVariants = businessMatrix.map(item => item.id).sort();
    const actualVariants = Object.keys(fixture.business_variants || {}).sort();
    if (JSON.stringify(actualVariants) !== JSON.stringify(expectedVariants)) {
      throw new Error('The reviewed fixture must name exactly seven supported-business variants.');
    }
  }
  const supportedActions: UiAction[] = [
    'goto', 'click', 'fill', 'select', 'setInputFiles', 'press', 'expectText', 'expectDisabled',
  ];
  const supportedActors: Actor[] = ['requester', 'reviewer'];
  for (const [operationId, operation] of Object.entries(fixture.operations)) {
    const operationContract = operationMatrix.find(item => item.id === operationId)!;
    const operationIndex = operationMatrix.findIndex(item => item.id === operationId);
    if (!['split', 'combined_actor_confirmation'].includes(operation.lifecycle_mode)) {
      throw new Error(`${operationId}.lifecycle_mode is unsupported.`);
    }
    if (operation.lifecycle_mode === 'combined_actor_confirmation'
      && operationContract.approval_policy !== 'actor_confirmation') {
      throw new Error(
        `${operationId}.combined_actor_confirmation requires actor_confirmation policy.`,
      );
    }
    for (const phase of [
      'missing_required_steps', 'prepare_steps', 'approval_steps', 'execute_steps',
    ] as const) {
      if (!Array.isArray(operation[phase]) || operation[phase].length === 0) {
        throw new Error(`${operationId}.${phase} must contain visible UI steps.`);
      }
      for (const step of operation[phase]) {
        if (!supportedActors.includes(step.actor) || !supportedActions.includes(step.action)) {
          throw new Error(`${operationId}.${phase} contains an unsupported actor or action.`);
        }
        if (step.action !== 'goto') {
          if (!step.locator?.name) {
            throw new Error(`${operationId}.${phase} contains an action without a locator.`);
          }
          if (step.locator.kind !== 'testId' && step.locator.exact !== true) {
            throw new Error(
              `${operationId}.${phase} must use an exact accessible locator or canonical test ID.`,
            );
          }
        }
        const tokens = [
          ...runtimeTokens(step.value, `${operationId}.${phase}.value`),
          ...runtimeTokens(step.locator?.name, `${operationId}.${phase}.locator.name`),
        ];
        for (const token of tokens.filter(value => value.startsWith('resource_'))) {
          const sourceOperation = token.slice('resource_'.length);
          const sourceIndex = operationMatrix.findIndex(item => item.id === sourceOperation);
          if (sourceIndex < 0 || sourceIndex >= operationIndex) {
            throw new Error(
              `${operationId}.${phase} references unavailable prior operation ${sourceOperation}.`,
            );
          }
        }
      }
    }
    if (!operation.missing_required_steps.some(step => step.action === 'expectText')) {
      throw new Error(`${operationId}.missing_required_steps must assert a visible validation error.`);
    }
    const missingBoundary = operation.missing_required_steps.some(step =>
      (step.action === 'click' || step.action === 'expectDisabled')
        && step.locator?.kind === 'role' && step.locator.role === 'button')
      || operation.missing_required_steps.some(step =>
        step.action === 'press' && step.value === 'Control+s');
    if (!missingBoundary) {
      throw new Error(
        `${operationId}.missing_required_steps must activate or prove disabled a write-boundary CTA.`,
      );
    }
    const previewAssertions = operation.approval_steps.filter(step =>
      step.action === 'expectText'
        && step.locator?.kind === 'testId'
        && step.locator.name === 'canonical-immutable-preview'
        && Boolean(step.value)
        && step.value !== '{{command_request_id}}'
        && step.value !== '{{preview_hash}}');
    if (previewAssertions.length !== 1) {
      throw new Error(
        `${operationId}.approval_steps must assert one operation-specific immutable preview fact.`,
      );
    }
    if (operation.prepare_steps[0].action !== 'goto') {
      throw new Error(`${operationId}.prepare_steps must restart from an application route.`);
    }
  }
  assertExactCommandTargets(fixture.operations);
  if (fixture.business_variants) {
    for (const [variantId, operation] of Object.entries(fixture.business_variants)) {
      const contract = businessMatrix.find(item => item.id === variantId);
      if (!contract) throw new Error(`${variantId} is not a reviewed supported-business variant.`);
      if (!['split', 'combined_actor_confirmation'].includes(operation.lifecycle_mode)
        || (operation.lifecycle_mode === 'combined_actor_confirmation'
          && contract.approval_policy !== 'actor_confirmation')) {
        throw new Error(`${variantId} has an invalid lifecycle policy.`);
      }
      for (const phase of [
        'missing_required_steps', 'prepare_steps', 'approval_steps', 'execute_steps',
      ] as const) {
        if (!Array.isArray(operation[phase]) || operation[phase].length === 0) {
          throw new Error(`${variantId}.${phase} must contain visible UI steps.`);
        }
      }
    }
    assertExactCommandTargets(fixture.business_variants);
  }
  return fixture;
}
