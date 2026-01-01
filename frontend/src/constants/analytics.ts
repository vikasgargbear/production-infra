export const TIME_PERIODS = {
    ALL: 'all',
    TODAY: 'today',
    YESTERDAY: 'yesterday',
    THIS_WEEK: 'thisWeek',
    LAST_WEEK: 'lastWeek',
    THIS_MONTH: 'thisMonth',
    LAST_MONTH: 'lastMonth',
    THIS_QUARTER: 'thisQuarter',
    LAST_QUARTER: 'lastQuarter',
    THIS_YEAR: 'thisYear',
    LAST_YEAR: 'lastYear',
    LAST_30_DAYS: '30days',
    LAST_6_MONTHS: '6months',
    CUSTOM: 'custom',
} as const;

export const REPORT_TYPES = {
    SUMMARY: 'summary',
    DETAILED: 'detailed',
    TREND: 'trend',
} as const;

export const GROUP_BY = {
    DAY: 'day',
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year',
} as const;

export const STATUS_FILTERS = {
    ALL: 'all',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    PAID: 'paid',
    PENDING: 'pending',
    OVERDUE: 'overdue',
} as const;
