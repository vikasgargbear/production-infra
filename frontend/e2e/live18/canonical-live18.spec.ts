/* eslint-disable jest/valid-expect, jest/valid-title */
import fs from 'fs';
import path from 'path';

import {
  APIRequestContext, APIResponse, Browser, expect, Page, request, Response, test, TestInfo,
} from '@playwright/test';

import { loadBrowserConfig, verifyDeployedSha } from '../support/live18/config';
import {
  loadFixture, loadOperationMatrix, OperationContract, OperationFixture, UiStep,
} from '../support/live18/contracts';
import {
  interpolateUiSteps, RuntimeUiValues,
} from '../support/live18/runtimeUiValues';
import {
  assertSessionIsolation, loginAndCaptureSession, sessionIdentityFromToken,
} from '../support/live18/session';
import { runUiStep } from '../support/live18/uiDriver';

const requiredLiveRun = process.env.LIVE18_REQUIRED === 'true';
const matrix = loadOperationMatrix();
const fixture = loadFixture(requiredLiveRun);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PREVIEW_HASH = /^sha256:[0-9a-f]{64}$/i;

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
  actor: 'requester' | 'reviewer', response: Response,
): Promise<CapturedResponse | null> {
  const url = new URL(response.url());
  if (!url.pathname.startsWith('/api/')) return null;
  const text = await response.text().catch(() => '');
  const parsed = jsonObject(text) || { raw: text };
  return {
    actor,
    method: response.request().method(),
    path: `${url.pathname}${url.search}`,
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
): Promise<void> {
  for (const step of interpolateUiSteps(steps, runtime, phase)) {
    await runUiStep(step.actor === 'requester' ? requester : reviewer, appOrigin, step);
  }
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
  testInfo: TestInfo,
): Promise<void> {
  const config = loadBrowserConfig();
  const requesterContext = await browser.newContext();
  const reviewerContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();
  const reviewerPage = await reviewerContext.newPage();
  const captured: CapturedResponse[] = [];
  const pending = new Set<Promise<void>>();
  const listen = (actor: 'requester' | 'reviewer') => (response: Response) => {
    const task = captureResponse(actor, response).then(item => { if (item) captured.push(item); })
      .finally(() => pending.delete(task));
    pending.add(task);
  };
  requesterPage.on('response', listen('requester'));
  reviewerPage.on('response', listen('reviewer'));

  try {
    const requesterSession = await loginAndCaptureSession(requesterPage, config.appOrigin, config.requester);
    const reviewerSession = await loginAndCaptureSession(reviewerPage, config.appOrigin, config.reviewer);
    assertSessionIsolation(config, requesterSession, reviewerSession);
    const denialIdentity = sessionIdentityFromToken(config.denialAccessToken);
    expect(denialIdentity.orgId, 'denial token must carry an organization claim').toBeTruthy();
    expect(denialIdentity.orgId, 'denial token must map to the provisioned denial organization')
      .toBe(config.expectedDenialOrgId);
    const requesterApi = await apiClient(config.apiOrigin, requesterSession.token);
    const reviewerApi = await apiClient(config.apiOrigin, reviewerSession.token);
    const denialApi = await apiClient(config.apiOrigin, config.denialAccessToken);
    const prePrepareRuntime: RuntimeUiValues = { run_token: config.runToken };
    try {
      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.missing_required_steps,
        prePrepareRuntime, `${contract.id}.missing_required_steps`,
      );
      await Promise.all([...pending]);
      const preparePath = `/api/web/actions/${contract.command_operation}/prepare`;
      const invalidPrepare = captured.filter(item => item.method === 'POST'
        && item.path === preparePath && item.status >= 200 && item.status < 300);
      expect(
        invalidPrepare,
        `${contract.id} missing-required-fields path must not prepare a command`,
      ).toHaveLength(0);
      await requesterPage.screenshot({
        path: testInfo.outputPath(`${contract.id}-missing-required.png`), fullPage: true,
      });

      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.prepare_steps,
        prePrepareRuntime, `${contract.id}.prepare_steps`,
      );
      await Promise.all([...pending]);
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
        command_request_id: commandId,
        preview_hash: previewHash,
        run_token: config.runToken,
      };

      const review = await responseJson(await reviewerApi.get(`/api/web/actions/commands/${commandId}/review`));
      expect(findDeep(review, 'preview_hash')).toBe(previewHash);
      assertExactScalars(review);

      let selfApprovalProbe: { status: number; body: Record<string, unknown> } | null = null;
      if (contract.approval_policy === 'separate_approver') {
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
        commandRuntime, `${contract.id}.approval_steps`,
      );
      await Promise.all([...pending]);
      const approvals = captured.filter(item => item.method === 'POST'
        && item.path === `/api/web/actions/commands/${commandId}/approve`);
      expect(approvals).toHaveLength(1);
      expect(approvals[0].actor).toBe(contract.approval_policy === 'separate_approver' ? 'reviewer' : 'requester');

      const staleHash = `${previewHash.slice(0, -1)}${previewHash.endsWith('0') ? '1' : '0'}`;
      const stale = await requesterApi.post(`/api/web/actions/commands/${commandId}/execute`, {
        data: { preview_hash: staleHash, idempotency_key: `live18-stale-${commandId}` },
      });
      expect([409, 422]).toContain(stale.status());

      await runSteps(
        requesterPage, reviewerPage, config.appOrigin, operationFixture.execute_steps,
        commandRuntime, `${contract.id}.execute_steps`,
      );
      await Promise.all([...pending]);
      const executions = captured.filter(item => item.method === 'POST'
        && item.path === `/api/web/actions/commands/${commandId}/execute` && item.status < 300);
      expect(executions, `${contract.id} must execute exactly once through visible UI`).toHaveLength(1);
      const resourceId = requireUuid(findDeep(executions[0].responseBody, 'resource_id'), 'resource UUID');

      const readbackPath = resolveReadbackPath(contract, commandId, resourceId);
      const readback = await responseJson(await requesterApi.get(readbackPath));
      assertExactScalars(readback);
      expect(JSON.stringify(readback)).toContain(resourceId);

      const replay = await requesterApi.post(`/api/web/actions/commands/${commandId}/execute`, {
        data: executions[0].requestBody || {},
      });
      const replayBody = await responseJson(replay);
      expect(findDeep(replayBody, 'resource_id')).toBe(resourceId);

      const denied = await denialApi.get(readbackPath);
      expect([403, 404]).toContain(denied.status());

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
        missing_required_http_evidence: captured.filter(item => item.method === 'POST'
          && item.path === preparePath && item.status >= 400),
        http_evidence: captured,
        cleanup_id: findDeep(executions[0].responseBody, 'reversal_command_id') || null,
      };
      const evidenceRoot = process.env.LIVE18_EVIDENCE_DIR?.trim();
      if (!evidenceRoot) throw new Error('LIVE18_EVIDENCE_DIR is required for UUID reconciliation.');
      fs.mkdirSync(evidenceRoot, { recursive: true });
      const evidencePath = path.join(evidenceRoot, `${contract.id}.json`);
      fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
      await testInfo.attach(`${contract.id}-canonical-evidence`, {
        body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json',
      });
      await requesterPage.screenshot({ path: testInfo.outputPath(`${contract.id}-readback.png`), fullPage: true });
    } finally {
      await requesterApi.dispose();
      await reviewerApi.dispose();
      await denialApi.dispose();
    }
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
    test(`${contract.id}: UI to REST readback emits canonical UUID evidence`, async ({ browser }, testInfo) => {
      expect(contract.availability, contract.blocker || '').toBe('published');
      const operationFixture = fixture?.operations[contract.id];
      expect(operationFixture, `${contract.id} lacks reviewed UI driver input`).toBeTruthy();
      await runOperation(browser, contract, operationFixture!, testInfo);
    });
  }
});
