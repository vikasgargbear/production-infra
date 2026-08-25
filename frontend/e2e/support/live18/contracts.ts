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
}

interface OperationMatrix {
  required_operation_count: number;
  operations: OperationContract[];
}

export type LocatorKind = 'role' | 'label' | 'placeholder' | 'text' | 'testId';
export type UiAction = 'goto' | 'click' | 'fill' | 'select' | 'press' | 'expectText';
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
}

const repositoryRoot = path.resolve(__dirname, '../../../..');

export function loadOperationMatrix(): OperationContract[] {
  const matrixPath = path.join(
    repositoryRoot, 'backend/tests/live_acceptance/operation_matrix.json',
  );
  const matrix = JSON.parse(fs.readFileSync(matrixPath, 'utf8')) as OperationMatrix;
  if (matrix.required_operation_count !== 18 || matrix.operations.length !== 18) {
    throw new Error('The live18 matrix must contain exactly 18 operations.');
  }
  return matrix.operations;
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
  const operationMatrix = loadOperationMatrix();
  const expected = operationMatrix.map(item => item.id).sort();
  const actual = Object.keys(fixture.operations).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('The reviewed live18 fixture must name exactly the 18 registered operations.');
  }
  const supportedActions: UiAction[] = [
    'goto', 'click', 'fill', 'select', 'press', 'expectText',
  ];
  const supportedActors: Actor[] = ['requester', 'reviewer'];
  for (const [operationId, operation] of Object.entries(fixture.operations)) {
    const operationContract = operationMatrix.find(item => item.id === operationId)!;
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
        runtimeTokens(step.value, `${operationId}.${phase}.value`);
        runtimeTokens(step.locator?.name, `${operationId}.${phase}.locator.name`);
      }
    }
    if (!operation.missing_required_steps.some(step => step.action === 'expectText')) {
      throw new Error(`${operationId}.missing_required_steps must assert a visible validation error.`);
    }
    if (operation.prepare_steps[0].action !== 'goto') {
      throw new Error(`${operationId}.prepare_steps must restart from an application route.`);
    }
  }
  assertExactCommandTargets(fixture.operations);
  return fixture;
}
