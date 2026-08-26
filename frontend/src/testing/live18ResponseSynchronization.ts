export interface CapturedHttpResponse {
  method: string;
  path: string;
  status: number;
}

interface WaitOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  message: string;
}

/**
 * Wait until the browser response listener has fully captured the expected
 * response. A Playwright click only dispatches the DOM event; it does not wait
 * for an async React handler's HTTP lifecycle to finish.
 */
export async function waitForCapturedResponses<T extends CapturedHttpResponse>(
  captured: T[],
  pending: Set<Promise<void>>,
  predicate: (response: T) => boolean,
  options: WaitOptions,
): Promise<T[]> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const pollIntervalMs = options.pollIntervalMs ?? 25;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const matches = captured.filter(predicate);
    if (matches.length > 0) return matches;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const interval = Math.min(pollIntervalMs, remainingMs);
    const tick = new Promise<void>(resolve => setTimeout(resolve, interval));
    if (pending.size > 0) {
      await Promise.race([Promise.all([...pending]), tick]);
    } else {
      await tick;
    }
  }

  throw new Error(`${options.message} (timed out after ${timeoutMs} ms)`);
}
