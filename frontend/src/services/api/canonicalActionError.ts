type ErrorRecord = Record<string, unknown>;

const record = (value: unknown): ErrorRecord | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as ErrorRecord
    : null
);

const nonempty = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

/**
 * Return a reviewed user-facing error without serializing response payloads.
 * Canonical APIs may attach request/input objects to validation diagnostics;
 * those values must never be copied into browser messages or CI evidence.
 */
export function canonicalActionErrorMessage(error: unknown, fallback: string): string {
  const response = record(error)?.response;
  const detail = record(record(response)?.data)?.detail;
  if (Array.isArray(detail)) {
    const messages = detail.slice(0, 8).flatMap(entry => {
      const issue = record(entry);
      const message = nonempty(issue?.msg);
      if (!message) return [];
      const location = Array.isArray(issue?.loc)
        ? issue.loc.filter(part => typeof part === 'string' || typeof part === 'number').join('.')
        : '';
      return [location ? `${location}: ${message}` : message];
    });
    if (messages.length) return messages.join('\n');
  }
  const structured = record(detail);
  const structuredMessage = nonempty(structured?.message);
  if (structuredMessage) return structuredMessage;

  // Local validation errors are authored in this codebase. Raw HTTP detail,
  // response bodies, and Axios error serialization are intentionally ignored.
  if (!response && error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}
