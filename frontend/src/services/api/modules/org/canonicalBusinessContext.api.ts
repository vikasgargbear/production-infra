import { apiHelpers } from '../../apiClient';


export interface CanonicalBusinessContext {
  organization_id: string;
  organization_timezone: string;
  business_date: string;
  document_policy: CanonicalDocumentPolicy;
}

export interface CanonicalDocumentPolicy {
  allowed_rounding_policies: Array<'none'>;
  default_rounding_policy: 'none';
  allowed_zero_rated_payment_modes: Array<'not_applicable' | 'with_igst'>;
  default_zero_rated_payment_mode: 'not_applicable';
  allowed_tax_charge_mechanisms: Array<'normal'>;
  default_tax_charge_mechanism: 'normal';
  allowed_price_bases: Array<'tax_exclusive'>;
  default_price_basis: 'tax_exclusive';
  logistics_modes: Array<{
    transport_mode: 'in_person';
    display_name: string;
    requires_transporter_party: false;
    requires_vehicle: false;
    requires_transport_document: false;
  }>;
  default_transport_mode: 'in_person';
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const singleton = <T extends string>(
  values: unknown,
  selected: unknown,
  expected: T,
  label: string,
): T => {
  if (!Array.isArray(values) || values.length !== 1 || values[0] !== expected || selected !== expected) {
    throw new Error(`The canonical API returned ambiguous ${label} policy.`);
  }
  return expected;
};

const supportedZeroRatedPaymentModes = (
  values: unknown,
  selected: unknown,
): Array<'not_applicable' | 'with_igst'> => {
  if (!Array.isArray(values)
      || values.length !== 2
      || values[0] !== 'not_applicable'
      || values[1] !== 'with_igst'
      || selected !== 'not_applicable') {
    throw new Error('The canonical API returned ambiguous zero-rated payment policy.');
  }
  return values;
};

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
  const policy = (context as Partial<CanonicalBusinessContext>).document_policy as Partial<CanonicalDocumentPolicy> | undefined;
  if (!policy) throw new Error('The canonical API returned no commercial document policy.');
  singleton(policy.allowed_rounding_policies, policy.default_rounding_policy, 'none', 'rounding');
  supportedZeroRatedPaymentModes(
    policy.allowed_zero_rated_payment_modes,
    policy.default_zero_rated_payment_mode,
  );
  singleton(
    policy.allowed_tax_charge_mechanisms,
    policy.default_tax_charge_mechanism,
    'normal',
    'tax charge mechanism',
  );
  singleton(policy.allowed_price_bases, policy.default_price_basis, 'tax_exclusive', 'price basis');
  if (!Array.isArray(policy.logistics_modes) || policy.logistics_modes.length !== 1
      || policy.default_transport_mode !== policy.logistics_modes[0]?.transport_mode
      || policy.logistics_modes[0].transport_mode !== 'in_person'
      || !policy.logistics_modes[0].display_name?.trim()
      || policy.logistics_modes[0].requires_transporter_party !== false
      || policy.logistics_modes[0].requires_vehicle !== false
      || policy.logistics_modes[0].requires_transport_document !== false) {
    throw new Error('The canonical API returned ambiguous physical logistics policy.');
  }
  return context as CanonicalBusinessContext;
}

export const canonicalBusinessContextApi = {
  async get(): Promise<CanonicalBusinessContext> {
    const response = await apiHelpers.get<CanonicalBusinessContext>('/canonical/business-context');
    return requireCanonicalBusinessContext(response.data);
  },
};
