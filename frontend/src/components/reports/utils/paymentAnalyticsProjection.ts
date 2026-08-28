export interface PaymentData {
  id: string;
  amount: number;
  method: string;
  status: string;
  date: string;
  reference: string;
  customer: string | null;
  type: 'received' | 'sent';
}

export interface PaymentSummary {
  totalReceived: number;
  totalSent: number;
  netFlow: number;
  pendingPayments: number;
  completedPayments: number;
  failedPayments: number;
  avgTransactionValue: number;
}

export interface PaymentSeries {
  labels: string[];
  received: number[];
  sent: number[];
}

export interface DailyPaymentSeries {
  labels: string[];
  inflow: number[];
  outflow: number[];
}

export interface PaymentAnalyticsData {
  payments: PaymentData[];
  summary: PaymentSummary;
  methodBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
  trends: PaymentSeries;
  dailyFlow: DailyPaymentSeries;
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is missing from the canonical API response.`);
  }
  return value as Record<string, unknown>;
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is missing from the canonical API response.`);
  }
  return value;
};

const optionalText = (value: unknown, label: string): string | null => {
  if (value === null) return null;
  return text(value, label);
};

const number = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is missing or invalid in the canonical API response.`);
  }
  return value;
};

const count = (value: unknown, label: string): number => {
  const parsed = number(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
};

const numberMap = (value: unknown, label: string): Record<string, number> => {
  const source = record(value, label);
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [
    text(key, `${label} key`),
    number(item, `${label}.${key}`),
  ]));
};

const stringSeries = (value: unknown, label: string): string[] => (
  array(value, label).map((item, index) => text(item, `${label}[${index}]`))
);

const numberSeries = (value: unknown, label: string): number[] => (
  array(value, label).map((item, index) => number(item, `${label}[${index}]`))
);

const requireAlignedSeries = (label: string, labels: string[], ...series: number[][]): void => {
  if (series.some(values => values.length !== labels.length)) {
    throw new Error(`${label} values do not align with their canonical labels.`);
  }
};

export function projectPaymentAnalytics(
  listPayload: unknown,
  summaryPayload: unknown,
  trendsPayload: unknown,
): PaymentAnalyticsData {
  const list = record(listPayload, 'Payment list');
  const summary = record(summaryPayload, 'Payment summary');
  const trends = record(trendsPayload, 'Payment trends');
  const monthly = record(trends.monthly, 'Payment monthly trends');
  const daily = record(trends.daily, 'Payment daily trends');

  const monthlyLabels = stringSeries(monthly.labels, 'Payment monthly labels');
  const monthlyReceived = numberSeries(monthly.received, 'Payment monthly receipts');
  const monthlySent = numberSeries(monthly.sent, 'Payment monthly disbursements');
  requireAlignedSeries('Payment monthly trends', monthlyLabels, monthlyReceived, monthlySent);

  const dailyLabels = stringSeries(daily.labels, 'Payment daily labels');
  const dailyInflow = numberSeries(daily.inflow, 'Payment daily receipts');
  const dailyOutflow = numberSeries(daily.outflow, 'Payment daily disbursements');
  requireAlignedSeries('Payment daily trends', dailyLabels, dailyInflow, dailyOutflow);

  return {
    payments: array(list.payments, 'Payments').map((item, index) => {
      const payment = record(item, `Payment ${index + 1}`);
      const direction = text(payment.type, `Payment ${index + 1} direction`);
      if (direction !== 'received' && direction !== 'sent') {
        throw new Error(`Payment ${index + 1} has an unsupported canonical direction.`);
      }
      return {
        id: text(payment.id, `Payment ${index + 1} ID`),
        amount: number(payment.amount, `Payment ${index + 1} amount`),
        method: text(payment.method, `Payment ${index + 1} method`),
        status: text(payment.status, `Payment ${index + 1} status`),
        date: text(payment.date, `Payment ${index + 1} date`),
        reference: text(payment.reference, `Payment ${index + 1} reference`),
        customer: optionalText(payment.customer, `Payment ${index + 1} party`),
        type: direction,
      };
    }),
    summary: {
      totalReceived: number(summary.total_received, 'Total received'),
      totalSent: number(summary.total_sent, 'Total sent'),
      netFlow: number(summary.net_flow, 'Net payment flow'),
      pendingPayments: count(summary.pending_payments, 'Pending payment count'),
      completedPayments: count(summary.completed_payments, 'Completed payment count'),
      failedPayments: count(summary.failed_payments, 'Failed payment count'),
      avgTransactionValue: number(summary.avg_transaction_value, 'Average payment value'),
    },
    methodBreakdown: numberMap(summary.method_breakdown, 'Payment method breakdown'),
    statusBreakdown: numberMap(summary.status_breakdown, 'Payment status breakdown'),
    trends: { labels: monthlyLabels, received: monthlyReceived, sent: monthlySent },
    dailyFlow: { labels: dailyLabels, inflow: dailyInflow, outflow: dailyOutflow },
  };
}
