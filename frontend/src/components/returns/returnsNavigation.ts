export const RETURN_SUBPAGE_IDS = [
  'sales-return',
  'purchase-return',
  'commercial-reversal',
  'returns-history',
  'approval-inbox',
  'resume-post',
] as const;

export type ReturnSubpage = (typeof RETURN_SUBPAGE_IDS)[number];
