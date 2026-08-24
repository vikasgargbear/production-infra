import { apiHelpers } from '../../apiClient';


export interface CanonicalBusinessContext {
  organization_id: string;
  organization_timezone: string;
  business_date: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireCanonicalBusinessContext(value: unknown): CanonicalBusinessContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The canonical API returned no organization business clock.');
  }
  const context = value as Partial<CanonicalBusinessContext>;
  if (!context.organization_id || !context.organization_timezone
      || !DATE_PATTERN.test(String(context.business_date ?? ''))) {
    throw new Error('The canonical API returned an invalid organization business clock.');
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: context.organization_timezone }).format();
  } catch {
    throw new Error('The canonical API returned an invalid organization timezone.');
  }
  return context as CanonicalBusinessContext;
}

export const canonicalBusinessContextApi = {
  async get(): Promise<CanonicalBusinessContext> {
    const response = await apiHelpers.get<CanonicalBusinessContext>('/canonical/business-context');
    return requireCanonicalBusinessContext(response.data);
  },
};
