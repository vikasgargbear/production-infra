type ErrorWithStatus = {
  status?: unknown;
  response?: { status?: unknown; data?: { detail?: unknown } };
  message?: unknown;
};

const detailMessage = (detail: unknown): string[] => {
  if (typeof detail === 'string' && detail.trim()) return [detail];
  if (Array.isArray(detail)) return detail.flatMap(detailMessage);
  if (detail && typeof detail === 'object') {
    const item = detail as { msg?: unknown; loc?: unknown };
    if (typeof item.msg === 'string') {
      const location = Array.isArray(item.loc) ? item.loc.filter(Boolean).join('.') : '';
      return [location ? `${location}: ${item.msg}` : item.msg];
    }
    try {
      return [JSON.stringify(detail)];
    } catch {
      return [];
    }
  }
  return [];
};

/** Convert FastAPI string, object, or validation-array errors to render-safe text. */
export const apiErrorMessages = (error: unknown, fallback: string): string[] => {
  const apiError = (error || {}) as ErrorWithStatus;
  const details = detailMessage(apiError.response?.data?.detail);
  if (details.length > 0) return details;
  if (typeof apiError.message === 'string' && apiError.message.trim()) return [apiError.message];
  return [fallback];
};

export const apiErrorMessage = (error: unknown, fallback: string): string => (
  apiErrorMessages(error, fallback).join('; ')
);

export const apiErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as ErrorWithStatus;
  const value = candidate.response?.status ?? candidate.status;
  return typeof value === 'number' ? value : null;
};

export const isForbiddenApiError = (error: unknown): boolean => apiErrorStatus(error) === 403;
