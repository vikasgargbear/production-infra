/* eslint-disable jest/valid-expect, jest/valid-title, testing-library/prefer-screen-queries */
import fs from 'fs';
import path from 'path';

import {
  APIRequestContext, APIResponse, Browser, expect, Locator, Page, request, Response, test,
} from '@playwright/test';

import { loadBrowserConfig, verifyDeployedSha } from '../support/live18/config';
import {
  loadFixture, loadReadyOperationMatrix, loadSupportedBusinessVariantMatrix,
  OperationContract, OperationFixture, UiStep,
} from '../support/live18/contracts';
import {
  buildOperationFailureEvidence, OperationFailureProgress, writeOperationFailureEvidence,
} from '../support/live18/failureEvidence';
import {
  Live18BrowserHealth, rejectedPrepareOccurrences,
} from '../support/live18/browserHealth';
import {
  interpolateUiSteps, missingOperationResourceDependencies, RuntimeUiValues,
} from '../support/live18/runtimeUiValues';
import {
  assertSessionIsolation, loginAndCaptureSession, sessionIdentityFromToken,
} from '../support/live18/session';
import { runUiStep } from '../support/live18/uiDriver';
import { waitForCapturedResponses } from '../../src/testing/live18ResponseSynchronization';
import { captureLive18Screenshot } from './screenshotEvidence';
import type { Live18ScreenshotEvidence } from './screenshotEvidence';

const requiredLiveRun = process.env.LIVE18_REQUIRED === 'true';
const requiredBusinessVariantRun = process.env.LIVE23_BUSINESS_VARIANTS_REQUIRED === 'true';
const matrix = loadReadyOperationMatrix();
const businessVariantMatrix = loadSupportedBusinessVariantMatrix();
const fixture = loadFixture(requiredLiveRun);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_HASH = /^sha256:[0-9a-f]{64}$/i;

const POSTED_UI_HEADING: Record<string, string> = {
  bank_reconciliation: 'Matched and reconciled',
  customer_credit_note: 'Posted and reconciled',
  customer_receipt: 'Receipt posted and reconciled against the authoritative invoice balance.',
  delivery_challan: 'Challan Created Successfully!',
  destruction: 'Posted and reconciled',
  expense_claim: 'Posted and reconciled',
  goods_receipt: 'Receipt UUID:',
  purchase_order: 'Purchase Order Created!',
  purchase_return: 'Posted reconciliation',
  sales_invoice: 'Invoice Created!',
  sales_order: 'Sales Order Created!',
  sales_return: 'Posted reconciliation',
  stock_adjustment: 'Adjustment posted',
  stock_transfer: 'Posted and read back:',
  supplier_advance: 'Supplier advance posted and reconciled',
  supplier_debit_note: 'Posted and reconciled',
  supplier_invoice: 'Supplier Invoice Posted',
  supplier_payment: 'Supplier payment reconciled',
  customer_receipt_cheque_clearance: 'Customer advance posted and reconciled against the authoritative goods order.',
  customer_cheque_clearance: 'Cheque terminal action posted and reconciled',
  customer_receipt_cheque_bounce: 'Customer advance posted and reconciled against the authoritative goods order.',
  customer_cheque_bounce: 'Cheque terminal action posted and reconciled',
  sales_return_reversal: 'Authoritative compensating readback',
  purchase_return_reversal: 'Authoritative compensating readback',
  adjustment_note_reversal: 'Authoritative compensating readback',
};

type CompletedResources = Record<`resource_${string}`, string>;

function evidenceRoot(): string {
  const value = process.env.LIVE18_EVIDENCE_DIR?.trim();
  if (!value) throw new Error('LIVE18_EVIDENCE_DIR is required for UUID reconciliation.');
  return value;
}

const businessVariantIds = new Set(businessVariantMatrix.map(({ id }) => id));

function operationEvidenceRoot(operationId: string): string {
  return businessVariantIds.has(operationId)
    ? path.join(evidenceRoot(), 'business-variants')
    : evidenceRoot();
}

function resourceStatePath(): string {
  return path.join(evidenceRoot(), 'completed-resources.json');
}

function loadCompletedResources(): CompletedResources {
  const statePath = resourceStatePath();
  if (!fs.existsSync(statePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Live18 completed-resource state must be a JSON object.');
  }
  const state: CompletedResources = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!key.startsWith('resource_') || typeof value !== 'string' || !UUID.test(value)) {
      throw new Error(`Invalid Live18 completed-resource state at ${key}.`);
    }
    state[key as `resource_${string}`] = value;
  }
  return state;
}

function persistCompletedResource(operationId: string, resourceId: string): void {
  const root = evidenceRoot();
  fs.mkdirSync(root, { recursive: true });
  const statePath = resourceStatePath();
  const next = {
    ...loadCompletedResources(),
    [`resource_${operationId}`]: resourceId,
  } satisfies CompletedResources;
  const temporaryPath = `${statePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, statePath);
}

interface CapturedResponse {
  actor: 'requester' | 'reviewer';
  method: string;
  path: string;
  status: number;
  requestId: string | null;
  requestBody: Record<string, unknown> | null;
  responseBody: Record<string, any>;
}

const jsonObject = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

async function captureResponse(
  actor: 'requester' | 'reviewer', response: Response, expectedApiOrigin: string,
): Promise<CapturedResponse | null> {
  const url = new URL(response.url());
  if (url.origin !== expectedApiOrigin || !url.pathname.startsWith('/api/web/actions/')) return null;
  const text = await response.text().catch(() => '');
  const parsed = jsonObject(text) || {};
  return {
    actor,
    method: response.request().method(),
    path: url.pathname,
    status: response.status(),
    requestId: response.headers()['x-request-id'] || response.headers()['x-render-request-id'] || null,
    requestBody: jsonObject(response.request().postData()),
    responseBody: parsed,
  };
}

async function runSteps(
  requester: Page,
  reviewer: Page,
  appOrigin: string,
  steps: UiStep[],
  runtime: RuntimeUiValues,
  phase: string,
  progress: OperationFailureProgress,
): Promise<void> {
  const interpolated = interpolateUiSteps(steps, runtime, phase);
  for (const [index, step] of interpolated.entries()) {
    const phaseParts = phase.split('.');
    progress.stage = phaseParts[phaseParts.length - 1] || 'ui_steps';
    progress.stepIndex = index;
    progress.actor = step.actor;
    progress.action = step.action;
    progress.locatorKind = step.locator?.kind || null;
    await runUiStep(step.actor === 'requester' ? requester : reviewer, appOrigin, step);
  }
}

function beginStage(progress: OperationFailureProgress, stage: string): void {
  progress.stage = stage;
  progress.stepIndex = null;
  progress.actor = null;
  progress.action = null;
  progress.locatorKind = null;
}

function findDeep(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findDeep(child, key);
      if (found !== undefined) return found;
    }
  } else if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (key in object) return object[key];
    for (const child of Object.values(object)) {
      const found = findDeep(child, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function requireUuid(value: unknown, label: string): string {
  const text = String(value || '');
  expect(text, label).toMatch(UUID);
  return text;
}

function assertExactScalars(value: unknown, trail: string[] = []): void {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertExactScalars(child, [...trail, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const moneyOrQuantity = /(?:amount|quantity|rate|taxable|subtotal|total|discount|cess|cgst|sgst|igst|debit|credit|value|balance|mrp|cost)$/i.test(key)
      && !/(?:count|line_number|row_version)$/i.test(key);
    if (moneyOrQuantity && child !== null) {
      expect(typeof child, `${[...trail, key].join('.')} must be an exact decimal string`).toBe('string');
      expect(String(child), [...trail, key].join('.')).toMatch(/^-?\d+(?:\.\d+)?$/);
    } else {
      assertExactScalars(child, [...trail, key]);
    }
  }
}

async function apiClient(origin: string, token: string): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function responseJson(response: APIResponse): Promise<Record<string, any>> {
  const text = await response.text();
  expect(response.ok(), `${response.status()} ${response.url()} ${text}`).toBe(true);
  return text ? JSON.parse(text) as Record<string, any> : {};
}

function resolveReadbackPath(contract: OperationContract, commandId: string, resourceId: string): string {
  if (!contract.rest_readback) throw new Error(`${contract.id} lacks REST readback.`);
  return contract.rest_readback
    .replace('{command_request_id}', commandId)
    .replace('{resource_id}', resourceId);
}

async function runOperation(
  browser: Browser,
  contract: OperationContract,
  operationFixture: OperationFixture,
): Promise<void> {
  const config = loadBrowserConfig();
  const requesterContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();
  const reviewerPage = await reviewerContext.newPage();
  const progress: OperationFailureProgress = {
    stage: 'requester_login', stepIndex: null, actor: 'requester', action: null, locatorKind: null,
  };
  const captured: CapturedResponse[] = [];
  let missingRequiredHttpEvidence: CapturedResponse[] = [];
  const browserHealth = new Live18BrowserHealth();
  const pending = new Set<Promise<void>>();
  const listen = (actor: 'requester' | 'reviewer') => (response: Response) => {
    const task = captureResponse(actor, response, config.apiOrigin)
      .then(item => { if (item) captured.push(item); })
      .finally(() => pending.delete(task));
    pending.add(task);
  };
  requesterPage.on('response', listen('requester'));
  reviewerPage.on('response', listen('reviewer'));
  browserHealth.observe(requesterPage, 'requester', config.apiOrigin);
  browserHealth.observe(reviewerPage, 'reviewer', config.apiOrigin);

  try {
    const requesterSession = await loginAndCaptureSession(
      requesterPage, config, config.requester,
    );
    beginStage(progress, 'reviewer_login');
    progress.actor = 'reviewer';
    const reviewerSession = await loginAndCaptureSession(
      reviewerPage, config, config.reviewer,
    );
    beginStage(progress, 'identity_assertion');
    assertSessionIsolation(config, requesterSession, reviewerSession);
    const denialIdentity = sessionIdentityFromToken(config.denialAccessToken);
    expect(denialIdentity.orgId, 'denial token must carry an organization claim').toBeTruthy();
    expect(denialIdentity.orgId, 'denial token must map to the provisioned denial organization')
      .toBe(config.expectedDenialOrgId);
    const requesterApi = await apiClient(config.apiOrigin, requesterSession.token);
    const reviewerApi = await apiClient(config.apiOrigin, reviewerSession.token);
    const denialApi = await apiClient(config.apiOrigin, config.denialAccessToken);
    const completedResources = loadCompletedResources();
    const prePrepareRuntime: RuntimeUiValues = {
      run_token: config.runToken,
      ...completedResources,
    };
    try {
      const screenshotEvidence: Live18ScreenshotEvidence[] = [];
      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.missing_required_steps,
        prePrepareRuntime, `${contract.id}.missing_required_steps`, progress,
      );
      beginStage(progress, 'missing_required_assertion');
      await Promise.all([...pending]);
      const preparePath = `/api/web/actions/${contract.command_operation}/prepare`;
      const invalidPrepare = captured.filter(item => item.method === 'POST'
        && item.path === preparePath && item.status >= 200 && item.status < 300);
      expect(
        invalidPrepare,
        `${contract.id} missing-required-fields path must not prepare a command`,
      ).toHaveLength(0);
      const missingRequiredFailures = browserHealth.snapshot();
      expect(
        rejectedPrepareOccurrences(missingRequiredFailures, preparePath),
        `${contract.id} missing-required path must not retry a rejected prepare request`,
      ).toBeLessThanOrEqual(1);
      const unexpectedMissingRequiredFailures = missingRequiredFailures.filter(failure => !(
        failure.kind === 'response_error'
        && failure.method === 'POST'
        && failure.path === preparePath
        && (failure.status === 400 || failure.status === 422)
      ));
      expect(
        unexpectedMissingRequiredFailures,
        `${contract.id} missing-required path must fail cleanly without unrelated browser errors`,
      ).toEqual([]);
      missingRequiredHttpEvidence = captured.filter(item => item.method === 'POST'
        && item.path === preparePath && (item.status === 400 || item.status === 422));
      screenshotEvidence.push(await captureLive18Screenshot(
        requesterPage, config, contract.id, 'missing-required',
        businessVariantIds.has(contract.id) ? 'business-variants' : 'live18',
      ));
      browserHealth.clear();
      captured.length = 0;
      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.prepare_steps,
        prePrepareRuntime, `${contract.id}.prepare_steps`, progress,
      );
      beginStage(progress, 'prepare_assertion');
      await waitForCapturedResponses(
        captured,
        pending,
        item => item.method === 'POST' && item.path === preparePath,
        { message: `${contract.id} visible prepare did not yield an HTTP response` },
      );
      const prepared = captured.filter(item => item.method === 'POST' && item.path === preparePath
        && item.status >= 200 && item.status < 300);
      expect(prepared, `${contract.id} must prepare exactly once through its visible UI`).toHaveLength(1);
      expect(prepared[0].actor).toBe('requester');
      expect(prepared[0].status).toBeGreaterThanOrEqual(200);
      expect(prepared[0].status).toBeLessThan(300);
      const commandId = requireUuid(findDeep(prepared[0].responseBody, 'command_request_id'), 'command UUID');
      const previewHash = String(findDeep(prepared[0].responseBody, 'preview_hash') || '');
      expect(previewHash).toMatch(PREVIEW_HASH);
      const commandRuntime: RuntimeUiValues = {
        ...completedResources,
        command_request_id: commandId,
        preview_hash: previewHash,
        run_token: config.runToken,
      };

      beginStage(progress, 'review_readback');
      const review = await responseJson(await reviewerApi.get(`/api/web/actions/commands/${commandId}/review`));
      expect(findDeep(review, 'preview_hash')).toBe(previewHash);
      assertExactScalars(review);

      let selfApprovalProbe: { status: number; body: Record<string, unknown> } | null = null;
      if (contract.approval_policy === 'separate_approver') {
        beginStage(progress, 'self_approval_probe');
        const selfApproval = await requesterApi.post(
          `/api/web/actions/commands/${commandId}/approve`,
          {
            data: {
              preview_hash: previewHash,
              approval_intent: 'approve',
              idempotency_key: `live18-self-approval-${commandId}`,
            },
          },
        );
        const selfApprovalText = await selfApproval.text();
        expect(selfApproval.status(), selfApprovalText).toBe(403);
        selfApprovalProbe = {
          status: selfApproval.status(),
          body: jsonObject(selfApprovalText) || { raw: selfApprovalText },
        };
      }

      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.approval_steps,
        commandRuntime, `${contract.id}.approval_steps`, progress,
      );
      beginStage(progress, 'approval_assertion');
      if (operationFixture.lifecycle_mode === 'split') {
        await waitForCapturedResponses(
          captured,
          pending,
          item => item.method === 'POST'
            && item.path === `/api/web/actions/commands/${commandId}/approve`,
          { message: `${contract.id} visible approval did not yield an HTTP response` },
        );
      } else {
        await Promise.all([...pending]);
      }
      const approvalsBeforeExecute = captured.filter(item => item.method === 'POST'
        && item.path === `/api/web/actions/commands/${commandId}/approve`);
      if (operationFixture.lifecycle_mode === 'split') {
        expect(approvalsBeforeExecute).toHaveLength(1);
      } else {
        expect(
          approvalsBeforeExecute,
          `${contract.id} combined confirmation must not approve before its reviewed execute action`,
        ).toHaveLength(0);
      }

      beginStage(progress, 'stale_hash_probe');
      const staleHash = `${previewHash.slice(0, -1)}${previewHash.endsWith('0') ? '1' : '0'}`;
      const stale = await requesterApi.post(`/api/web/actions/commands/${commandId}/execute`, {
        data: { preview_hash: staleHash, idempotency_key: `live18-stale-${commandId}` },
      });
      expect([409, 422]).toContain(stale.status());

      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.execute_steps,
        commandRuntime, `${contract.id}.execute_steps`, progress,
      );
      beginStage(progress, 'execute_assertion');
      await waitForCapturedResponses(
        captured,
        pending,
        item => item.method === 'POST'
          && item.path === `/api/web/actions/commands/${commandId}/approve`,
        { message: `${contract.id} visible confirmation did not yield an approval response` },
      );
      await waitForCapturedResponses(
        captured,
        pending,
        item => item.method === 'POST'
          && item.path === `/api/web/actions/commands/${commandId}/execute`,
        { message: `${contract.id} visible confirmation did not yield an execute response` },
      );
      const approvals = captured.filter(item => item.method === 'POST'
        && item.path === `/api/web/actions/commands/${commandId}/approve`);
      expect(approvals).toHaveLength(1);
      expect(approvals[0].actor).toBe(contract.approval_policy === 'separate_approver' ? 'reviewer' : 'requester');
      const executions = captured.filter(item => item.method === 'POST'
        && item.path === `/api/web/actions/commands/${commandId}/execute` && item.status < 300);
      expect(executions, `${contract.id} must execute exactly once through visible UI`).toHaveLength(1);
      const resourceId = requireUuid(findDeep(executions[0].responseBody, 'resource_id'), 'resource UUID');
      const postedHeading = POSTED_UI_HEADING[contract.id];
      expect(postedHeading, `${contract.id} lacks a visible posted-state contract`).toBeTruthy();
      await expect(
        requesterPage.getByText(postedHeading, { exact: false }),
        `${contract.id} must show its operation-specific posted/readback state`,
      ).toBeVisible();
      const explicitResourceEvidence = requesterPage.getByTestId('canonical-posted-resource-id');
      let postedResourceEvidence: Locator;
      if (await explicitResourceEvidence.count()) {
        postedResourceEvidence = explicitResourceEvidence;
        await expect(
          postedResourceEvidence,
          `${contract.id} must visibly identify the exact canonical resource it posted`,
        ).toBeVisible();
        await expect(postedResourceEvidence).toHaveText(resourceId);
      } else {
        postedResourceEvidence = requesterPage.getByText(resourceId, { exact: false });
        await expect(
          postedResourceEvidence,
          `${contract.id} must visibly identify the exact canonical resource it posted`,
        ).toBeVisible();
      }
      await postedResourceEvidence.scrollIntoViewIfNeeded();
      screenshotEvidence.push(await captureLive18Screenshot(
        requesterPage, config, contract.id, 'posted',
        businessVariantIds.has(contract.id) ? 'business-variants' : 'live18',
      ));

      beginStage(progress, 'rest_readback');
      const readbackPath = resolveReadbackPath(contract, commandId, resourceId);
      const readback = await responseJson(await requesterApi.get(readbackPath));
      assertExactScalars(readback);
      expect(JSON.stringify(readback)).toContain(resourceId);

      beginStage(progress, 'replay_probe');
      const replay = await requesterApi.post(`/api/web/actions/commands/${commandId}/execute`, {
        data: executions[0].requestBody || {},
      });
      const replayBody = await responseJson(replay);
      expect(findDeep(replayBody, 'resource_id')).toBe(resourceId);

      beginStage(progress, 'denial_probe');
      const denied = await denialApi.get(readbackPath);
      expect([403, 404]).toContain(denied.status());
      await Promise.all([...pending]);
      expect(
        browserHealth.snapshot(),
        `${contract.id} browser must have no console, page, request, or API response failures`,
      ).toEqual([]);
      persistCompletedResource(contract.id, resourceId);

      beginStage(progress, 'evidence_write');
      const evidence = {
        evidence_schema: 'aasopharma.live18.browser.v1',
        tested_sha: config.expectedSha,
        operation_id: contract.id,
        command_operation: contract.command_operation,
        command_request_id: commandId,
        resource_id: resourceId,
        preview_hash: previewHash,
        requester_user_id: requesterSession.userId,
        reviewer_user_id: reviewerSession.userId,
        organization_id: config.expectedOrgId,
        branch_id: config.expectedBranchId,
        rest_readback: readback,
        self_approval_probe: selfApprovalProbe,
        missing_required_http_evidence: missingRequiredHttpEvidence,
        http_evidence: [...missingRequiredHttpEvidence, ...captured],
        screenshots: screenshotEvidence,
        cleanup_id: findDeep(executions[0].responseBody, 'reversal_command_id') || null,
      };
      const root = operationEvidenceRoot(contract.id);
      fs.mkdirSync(root, { recursive: true });
      const evidencePath = path.join(root, `${contract.id}.json`);
      fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
    } finally {
      await requesterApi.dispose();
      await reviewerApi.dispose();
      await denialApi.dispose();
    }
  } catch (error) {
    try {
      writeOperationFailureEvidence(
        operationEvidenceRoot(contract.id),
        buildOperationFailureEvidence(config.expectedSha, contract.id, progress, error),
      );
    } catch (evidenceError) {
      const kind = evidenceError instanceof Error ? evidenceError.name : 'UnknownError';
      console.error(`Safe Live18 failure evidence write failed: ${kind}`);
    }
    throw error;
  } finally {
    await requesterContext.close();
    await reviewerContext.close();
  }
}

test.describe('canonical ERP live18 desktop certification', () => {
  test.skip(!requiredLiveRun, 'Discovery only. Set LIVE18_REQUIRED=true for an exact-SHA disposable live run.');

  test.beforeAll(async () => {
    await verifyDeployedSha(loadBrowserConfig());
  });

  for (const contract of matrix) {
    test(`${contract.id}: UI to REST readback emits canonical UUID evidence`, async ({ browser }) => {
      expect(contract.availability, contract.blocker || '').toBe('published');
      const operationFixture = fixture?.operations[contract.id];
      expect(operationFixture, `${contract.id} lacks reviewed UI driver input`).toBeTruthy();
      const missingResources = missingOperationResourceDependencies(
        operationFixture!, loadCompletedResources(),
      );
      test.skip(
        missingResources.length > 0,
        `${contract.id} requires canonical predecessor readback(s) that did not complete: `
          + missingResources.join(', '),
      );
      await runOperation(browser, contract, operationFixture!);
    });
    for (const variant of businessVariantMatrix.filter(
      candidate => candidate.schedule_after_operation === contract.id,
    )) {
      test(`${variant.id}: visible variant UI to REST readback emits canonical UUID evidence`, async ({ browser }) => {
        test.skip(
          !requiredBusinessVariantRun,
          'Set LIVE23_BUSINESS_VARIANTS_REQUIRED=true for the exact-SHA supported-business run.',
        );
        const operationFixture = fixture?.business_variants?.[variant.id];
        expect(operationFixture, `${variant.id} lacks reviewed supported-business UI input`).toBeTruthy();
        const missingResources = missingOperationResourceDependencies(
          operationFixture!, loadCompletedResources(),
        );
        test.skip(
          missingResources.length > 0,
          `${variant.id} requires exact predecessor readback(s): ${missingResources.join(', ')}`,
        );
        await runOperation(browser, variant, operationFixture!);
      });
    }
  }
});
