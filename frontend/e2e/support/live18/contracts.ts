import fs from 'fs';
import path from 'path';

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

export interface UiStep {
  actor: Actor;
  action: UiAction;
  locator?: { kind: LocatorKind; name: string; role?: string; exact?: boolean };
  value?: string;
}

export interface OperationFixture {
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
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as Live18Fixture;
  if (fixture.fixture_schema !== 'aasopharma.live18.fixture.v1'
    || !fixture.operations || typeof fixture.operations !== 'object') {
    throw new Error('The reviewed live18 fixture has an invalid schema or operations object.');
  }
  const expected = loadOperationMatrix().map(item => item.id).sort();
  const actual = Object.keys(fixture.operations).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('The reviewed live18 fixture must name exactly the 18 registered operations.');
  }
  for (const [operationId, operation] of Object.entries(fixture.operations)) {
    for (const phase of ['prepare_steps', 'approval_steps', 'execute_steps'] as const) {
      if (!Array.isArray(operation[phase]) || operation[phase].length === 0) {
        throw new Error(`${operationId}.${phase} must contain visible UI steps.`);
      }
    }
  }
  return fixture;
}
