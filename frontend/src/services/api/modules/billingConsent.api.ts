import { apiHelpers } from '../apiClient';

export interface BillingConsentSnapshot {
  can_manage: boolean;
  branches: Array<{ id: string; name: string }>;
  grants: Array<{ id: string; branch_id: string; maximum_amount: string; expires_at: string; status: string; row_version: number }>;
}
export interface BillingConsentRequest {
  branch_id: string; maximum_amount: string; expires_at: string;
  idempotency_key: string; confirmed: boolean;
}
const exact = { preserveExactDecimals: true };
export const billingConsentApi = {
  read: () => apiHelpers.get<BillingConsentSnapshot>('/web/billing-consent', exact),
  create: (body: BillingConsentRequest) => apiHelpers.post<BillingConsentSnapshot>('/web/billing-consent', body, exact),
  revoke: (id: string, rowVersion: number) => apiHelpers.post<BillingConsentSnapshot>(`/web/billing-consent/${encodeURIComponent(id)}/revoke`, { expected_row_version: rowVersion }, exact),
};
