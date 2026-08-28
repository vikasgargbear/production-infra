import { createHash } from 'node:crypto';

import type { ConsoleMessage, Page, Request, Response } from '@playwright/test';

import type { Actor } from './contracts';

export type BrowserFailureKind = 'console_error' | 'page_error' | 'request_failed'
  | 'response_error' | 'unexpected_api_origin';

export interface SafeBrowserFailure {
  actor: Actor;
  kind: BrowserFailureKind;
  method: string | null;
  path: string | null;
  status: number | null;
  fingerprint: string;
  occurrences: number;
}

export function rejectedPrepareOccurrences(
  failures: SafeBrowserFailure[],
  preparePath: string,
): number {
  return failures
    .filter(failure => failure.kind === 'response_error'
      && failure.method === 'POST'
      && failure.path === preparePath
      && (failure.status === 400 || failure.status === 422))
    .reduce((total, failure) => total + failure.occurrences, 0);
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gi;

function monitoredRequest(rawUrl: string, expectedApiOrigin: string): {
  expectedOrigin: boolean;
  path: string;
} | null {
  try {
    const url = new URL(rawUrl);
    if (!(url.pathname.startsWith('/api/')
      || url.pathname === '/health' || url.pathname === '/ready')) return null;
    return {
      expectedOrigin: url.origin === expectedApiOrigin,
      path: url.pathname.replace(UUID_SEGMENT, '/{uuid}'),
    };
  } catch {
    return null;
  }
}

function canonicalApiOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password
    || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Live18 browser health requires one credential-free HTTPS API origin.');
  }
  return url.origin;
}

export class Live18BrowserHealth {
  private readonly failures: SafeBrowserFailure[] = [];

  private generation = 0;

  observe(page: Page, actor: Actor, expectedApiOrigin: string): void {
    const apiOrigin = canonicalApiOrigin(expectedApiOrigin);
    const requestGeneration = new WeakMap<Request, number>();
    page.on('request', request => {
      const monitored = monitoredRequest(request.url(), apiOrigin);
      if (!monitored) return;
      if (!monitored.expectedOrigin) {
        this.add(
          actor,
          'unexpected_api_origin',
          request.method(),
          monitored.path,
          null,
          request.url(),
        );
        return;
      }
      requestGeneration.set(request, this.generation);
    });
    page.on('pageerror', error => {
      this.add(actor, 'page_error', null, null, null, `${error.name}\0${error.message}`);
    });
    page.on('console', (message: ConsoleMessage) => {
      if (message.type() === 'error') {
        this.add(actor, 'console_error', null, null, null, message.text());
      }
    });
    page.on('requestfailed', (request: Request) => {
      const monitored = monitoredRequest(request.url(), apiOrigin);
      if (monitored?.expectedOrigin && requestGeneration.get(request) === this.generation) {
        this.add(
          actor,
          'request_failed',
          request.method(),
          monitored.path,
          null,
          request.failure()?.errorText || 'unknown',
        );
      }
    });
    page.on('response', (response: Response) => {
      const monitored = monitoredRequest(response.url(), apiOrigin);
      const request = response.request();
      if (monitored?.expectedOrigin && requestGeneration.get(request) === this.generation
        && response.status() >= 400) {
        this.add(
          actor,
          'response_error',
          request.method(),
          monitored.path,
          response.status(),
          `${response.status()}\0${request.method()}\0${monitored.path}\0${response.url()}`,
        );
      }
    });
  }

  snapshot(): SafeBrowserFailure[] {
    const unique = new Map<string, SafeBrowserFailure>();
    for (const failure of this.failures) {
      const key = JSON.stringify({ ...failure, occurrences: undefined });
      const prior = unique.get(key);
      if (prior) prior.occurrences += failure.occurrences;
      else unique.set(key, { ...failure });
    }
    return [...unique.values()];
  }

  clear(): void {
    this.failures.length = 0;
    this.generation += 1;
  }

  private add(
    actor: Actor,
    kind: BrowserFailureKind,
    method: string | null,
    path: string | null,
    status: number | null,
    sensitiveDetail: string,
  ): void {
    this.failures.push({
      actor,
      kind,
      method,
      path,
      status,
      fingerprint: fingerprint(sensitiveDetail),
      occurrences: 1,
    });
  }
}
