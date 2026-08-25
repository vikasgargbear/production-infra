import { isCanonicalUuid } from '../../utils/canonicalUuid';
import { normalizeAuthoritativeDecimal } from '../../utils/exactDecimal';

export interface CollectionItem {
  customer_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  customer_address: string | null;
  total_outstanding: string;
  overdue_amount: string;
  days_overdue: number;
  oldest_invoice_date: string | null;
  last_payment_date: string | null;
  collection_status: 'current' | 'overdue';
  priority: 'current' | '1-30' | '31-60' | '61-90' | '90+';
}

export interface CollectionStats {
  total_outstanding: string;
  total_overdue: string;
  collections_today: string;
  collections_mtd: string;
  customers_count: number;
  critical_accounts: number;
  success_rate: null;
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing from the canonical collection response.`);
  }
  return value as Record<string, unknown>;
};

const requiredText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is missing from the canonical collection response.`);
  }
  return value;
};

const optionalText = (value: unknown, label: string): string | null => {
  if (value === null) return null;
  return requiredText(value, label);
};

const money = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, {
  scale: 2, maximumWholeDigits: 20, allowNegative: false,
});

const nonNegativeInteger = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative canonical integer.`);
  }
  return value;
};

const status = (value: unknown): CollectionItem['collection_status'] => {
  if (value !== 'current' && value !== 'overdue') {
    throw new Error('Collection status is not a supported canonical value.');
  }
  return value;
};

const agingBand = (value: unknown): CollectionItem['priority'] => {
  if (!['current', '1-30', '31-60', '61-90', '90+'].includes(String(value))) {
    throw new Error('Collection aging band is not a supported canonical value.');
  }
  return value as CollectionItem['priority'];
};

export function projectCollectionAging(payload: unknown): {
  collections: CollectionItem[];
  stats: CollectionStats;
} {
  const source = record(payload, 'Collection aging');
  if (!Array.isArray(source.parties)) {
    throw new Error('Collection parties must be a canonical array.');
  }
  const summary = record(source.summary, 'Collection summary');
  if (summary.collectionEfficiency !== null) {
    throw new Error('Collection efficiency requires an authoritative target before it can be published.');
  }

  const collections = source.parties.map((value, index): CollectionItem => {
    const party = record(value, `Collection party ${index + 1}`);
    const customerId = requiredText(party.id, `Collection party ${index + 1} customer ID`);
    if (!isCanonicalUuid(customerId)) {
      throw new Error(`Collection party ${index + 1} customer ID is not a canonical UUID.`);
    }
    return {
      customer_id: customerId,
      customer_name: requiredText(party.name, `Collection party ${index + 1} name`),
      customer_phone: optionalText(party.phone, `Collection party ${index + 1} phone`),
      customer_email: optionalText(party.email, `Collection party ${index + 1} email`),
      customer_address: optionalText(party.location, `Collection party ${index + 1} address`),
      total_outstanding: money(party.outstandingAmount, 'Collection outstanding'),
      overdue_amount: money(party.overdueAmount, 'Collection overdue'),
      days_overdue: nonNegativeInteger(party.daysOverdue, 'Collection days overdue'),
      oldest_invoice_date: optionalText(party.oldestInvoiceDate, 'Collection oldest invoice date'),
      last_payment_date: optionalText(party.lastPayment, 'Collection last payment date'),
      collection_status: status(party.agingStatus),
      priority: agingBand(party.agingBand),
    };
  });

  return {
    collections,
    stats: {
      total_outstanding: money(summary.totalOutstanding, 'Collection total outstanding'),
      total_overdue: money(summary.overdueAmount, 'Collection total overdue'),
      collections_today: money(summary.currentDayCollections, 'Collections today'),
      collections_mtd: money(summary.currentMonthCollections, 'Collections month to date'),
      customers_count: collections.length,
      critical_accounts: collections.filter(item => item.priority === '90+').length,
      success_rate: null,
    },
  };
}
