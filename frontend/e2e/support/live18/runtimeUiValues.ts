export interface RuntimeUiValues {
  command_request_id?: string;
  preview_hash?: string;
  run_token: string;
  [resourceToken: `resource_${string}`]: string | undefined;
}

interface RuntimeTemplatedStep {
  value?: string;
  locator?: { name: string };
}

interface RuntimeTemplatedOperation {
  missing_required_steps: RuntimeTemplatedStep[];
  prepare_steps: RuntimeTemplatedStep[];
  approval_steps: RuntimeTemplatedStep[];
  execute_steps: RuntimeTemplatedStep[];
}

export type ResourceRuntimeToken = `resource_${string}`;

const RUNTIME_TOKEN = /\{\{([a-z_][a-z0-9_]*)\}\}/gi;
const ALLOWED_RUNTIME_TOKENS = new Set<keyof RuntimeUiValues>([
  'command_request_id', 'preview_hash', 'run_token',
]);
const RESOURCE_RUNTIME_TOKEN = /^resource_[a-z][a-z0-9_]*$/;

export function runtimeTokens(value: string | undefined, label: string): string[] {
  if (!value) return [];
  const found: string[] = [];
  for (const match of value.matchAll(RUNTIME_TOKEN)) {
    const token = match[1].toLowerCase();
    if (!ALLOWED_RUNTIME_TOKENS.has(token as keyof RuntimeUiValues)
      && !RESOURCE_RUNTIME_TOKEN.test(token)) {
      throw new Error(`${label} contains unsupported runtime token {{${match[1]}}}.`);
    }
    found.push(token);
  }
  if (value.includes('{{') || value.includes('}}')) {
    const stripped = value.replace(RUNTIME_TOKEN, '');
    if (stripped.includes('{{') || stripped.includes('}}')) {
      throw new Error(`${label} contains a malformed runtime token.`);
    }
  }
  return found;
}

export function operationResourceDependencies(
  operation: RuntimeTemplatedOperation,
): ResourceRuntimeToken[] {
  const dependencies = new Set<ResourceRuntimeToken>();
  for (const phase of [
    'missing_required_steps', 'prepare_steps', 'approval_steps', 'execute_steps',
  ] as const) {
    const steps = operation[phase];
    for (const [stepIndex, step] of steps.entries()) {
      const label = `${phase}[${stepIndex}]`;
      for (const token of [
        ...runtimeTokens(step.value, `${label}.value`),
        ...runtimeTokens(step.locator?.name, `${label}.locator.name`),
      ]) {
        if (RESOURCE_RUNTIME_TOKEN.test(token)) {
          dependencies.add(token as ResourceRuntimeToken);
        }
      }
    }
  }
  return [...dependencies].sort();
}

export function missingOperationResourceDependencies(
  operation: RuntimeTemplatedOperation,
  completedResources: Partial<Record<ResourceRuntimeToken, string>>,
): ResourceRuntimeToken[] {
  return operationResourceDependencies(operation)
    .filter(token => !completedResources[token]);
}

function interpolate(value: string | undefined, runtime: RuntimeUiValues, label: string): string | undefined {
  runtimeTokens(value, label);
  return value?.replace(RUNTIME_TOKEN, (_whole, rawToken: string) => {
    const token = rawToken.toLowerCase() as keyof RuntimeUiValues;
    const replacement = runtime[token];
    if (!replacement) throw new Error(`${label} requires unavailable runtime token {{${token}}}.`);
    return replacement;
  });
}

export function interpolateUiSteps<T extends RuntimeTemplatedStep>(
  steps: T[], runtime: RuntimeUiValues, phase = 'UI steps',
): T[] {
  return steps.map((step, index) => ({
    ...step,
    value: interpolate(step.value, runtime, `${phase}[${index}].value`),
    locator: step.locator ? {
      ...step.locator,
      name: interpolate(step.locator.name, runtime, `${phase}[${index}].locator.name`)!,
    } : undefined,
  } as T));
}

export function assertExactCommandTargets(operations: Record<string, {
  approval_steps: RuntimeTemplatedStep[];
  execute_steps: RuntimeTemplatedStep[];
}>): void {
  for (const [operationId, operation] of Object.entries(operations)) {
    for (const phase of ['approval_steps', 'execute_steps'] as const) {
      const usesCapturedCommand = operation[phase].some(step => [step.value, step.locator?.name]
        .some(value => runtimeTokens(value, `${operationId}.${phase}`).includes('command_request_id')));
      if (!usesCapturedCommand) {
        throw new Error(
          `${operationId}.${phase} must target the captured {{command_request_id}}; `
          + 'selecting an ambiguous pending row is forbidden.',
        );
      }
    }
  }
}
