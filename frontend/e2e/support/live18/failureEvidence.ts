import fs from 'fs';
import path from 'path';

import type { Actor, UiAction, LocatorKind } from './contracts';

export const FAILURE_EVIDENCE_SCHEMA = 'aasopharma.live18.browser-failure.v1' as const;

export interface OperationFailureProgress {
  stage: string;
  stepIndex: number | null;
  actor: Actor | null;
  action: UiAction | null;
  locatorKind: LocatorKind | null;
}

export interface OperationFailureEvidence {
  evidence_schema: typeof FAILURE_EVIDENCE_SCHEMA;
  tested_sha: string;
  operation_id: string;
  stage: string;
  step_index: number | null;
  actor: Actor | null;
  action: UiAction | null;
  locator_kind: LocatorKind | null;
  error_kind: string;
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]{0,79}$/;
const SAFE_ERROR_KIND = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;

function safeIdentifier(value: string, label: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`Invalid ${label} for failure evidence.`);
  return value;
}

export function buildOperationFailureEvidence(
  testedSha: string,
  operationId: string,
  progress: OperationFailureProgress,
  error: unknown,
): OperationFailureEvidence {
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  return {
    evidence_schema: FAILURE_EVIDENCE_SCHEMA,
    tested_sha: testedSha,
    operation_id: safeIdentifier(operationId, 'operation ID'),
    stage: safeIdentifier(progress.stage, 'operation stage'),
    step_index: progress.stepIndex,
    actor: progress.actor,
    action: progress.action,
    locator_kind: progress.locatorKind,
    error_kind: SAFE_ERROR_KIND.test(errorName) ? errorName : 'UnknownError',
  };
}

export function writeOperationFailureEvidence(
  evidenceRoot: string,
  evidence: OperationFailureEvidence,
): void {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const destination = path.join(evidenceRoot, `${evidence.operation_id}.failure.json`);
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, destination);
}
