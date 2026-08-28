/**
 * Error used when a live screen has no canonical API command yet.
 *
 * The UI must never fall back to a legacy endpoint, IndexedDB, or a replay
 * queue. Callers can keep their read paths available while presenting the
 * write action as explicitly disabled.
 */
export class CanonicalWriteUnavailableError extends Error {
  readonly code = 'CANONICAL_WRITE_UNAVAILABLE';

  constructor(capability: string) {
    super(`${capability} is read-only until a canonical API command is available.`);
    this.name = 'CanonicalWriteUnavailableError';
  }
}

export const rejectCanonicalWrite = (capability: string): Promise<never> =>
  Promise.reject(new CanonicalWriteUnavailableError(capability));

