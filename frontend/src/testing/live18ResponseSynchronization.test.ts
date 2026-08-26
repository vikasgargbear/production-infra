import { waitForCapturedResponses } from './live18ResponseSynchronization';

interface Response {
  method: string;
  path: string;
  status: number;
}

test('waits for a response captured after the visible click returns', async () => {
  const captured: Response[] = [];
  const pending = new Set<Promise<void>>();
  setTimeout(() => {
    captured.push({ method: 'POST', path: '/api/web/actions/sales.dispatch.prepare/prepare', status: 200 });
  }, 10);

  const matches = await waitForCapturedResponses(
    captured,
    pending,
    response => response.method === 'POST'
      && response.path === '/api/web/actions/sales.dispatch.prepare/prepare',
    { message: 'dispatch prepare response', timeoutMs: 250, pollIntervalMs: 2 },
  );

  expect(matches).toHaveLength(1);
  expect(matches[0].status).toBe(200);
});

test('drains an in-flight response parser before evaluating captured evidence', async () => {
  const captured: Response[] = [];
  const pending = new Set<Promise<void>>();
  const parser = new Promise<void>(resolve => {
    setTimeout(() => {
      captured.push({ method: 'POST', path: '/api/web/actions/commands/command-1/execute', status: 422 });
      resolve();
    }, 10);
  });
  pending.add(parser);

  const matches = await waitForCapturedResponses(
    captured,
    pending,
    response => response.path.endsWith('/execute'),
    { message: 'dispatch execute response', timeoutMs: 250, pollIntervalMs: 2 },
  );

  expect(matches[0].status).toBe(422);
});

test('fails with a bounded operation-specific error when no response arrives', async () => {
  await expect(waitForCapturedResponses<Response>(
    [],
    new Set<Promise<void>>(),
    response => response.path.endsWith('/approve'),
    { message: 'dispatch approval response', timeoutMs: 5, pollIntervalMs: 1 },
  )).rejects.toThrow('dispatch approval response (timed out after 5 ms)');
});
