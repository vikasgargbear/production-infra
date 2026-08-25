export interface RuntimeUiValues {
  command_request_id?: string;
  preview_hash?: string;
  run_token: string;
}

interface RuntimeTemplatedStep {
  value?: string;
  locator?: { name: string };
}

const RUNTIME_TOKEN = /\{\{([a-z_][a-z0-9_]*)\}\}/gi;
const ALLOWED_RUNTIME_TOKENS = new Set<keyof RuntimeUiValues>([
  'command_request_id', 'preview_hash', 'run_token',
]);

export function runtimeTokens(value: string | undefined, label: string): string[] {
  if (!value) return [];
  const found: string[] = [];
  for (const match of value.matchAll(RUNTIME_TOKEN)) {
    const token = match[1].toLowerCase();
    if (!ALLOWED_RUNTIME_TOKENS.has(token as keyof RuntimeUiValues)) {
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
