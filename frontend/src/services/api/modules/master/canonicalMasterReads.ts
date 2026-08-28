import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

type JsonRecord = Record<string, unknown>;
type ExactDecimal = string | number;

const record = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonRecord;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
};

const uuid = (value: unknown, label: string): string => {
  if (!isCanonicalUuid(value)) throw new Error(`${label} must be a canonical UUID`);
  return String(value);
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
};

const nullableText = (value: unknown, label: string): string | null => {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be text or null`);
  return value;
};

const boolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
};

const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return Number(value);
};

const positiveInteger = (value: unknown, label: string): number => {
  const parsed = integer(value, label);
  if (parsed < 1) throw new Error(`${label} must be a positive integer`);
  return parsed;
};

const decimal = (value: unknown, label: string): ExactDecimal => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) return value;
  throw new Error(`${label} must be an explicit decimal`);
};

const money = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(value)) {
    throw new Error(`${label} must be an exact two-decimal string`);
  }
  return value;
};

const nullableDecimal = (value: unknown, label: string): ExactDecimal | null => (
  value === null ? null : decimal(value, label)
);

export interface CanonicalCustomerRead {
  customer_id: string;
  party_id: string;
  customer_code: string;
  customer_name: string;
  trade_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  contact_person_name: string | null;
  pan_number: string | null;
  gst_number: string | null;
  gst_verification_status: string | null;
  place_of_supply_state_code: string | null;
  credit_limit: ExactDecimal;
  credit_days: number;
  current_outstanding: ExactDecimal;
  customer_type: string;
  is_active: boolean;
  status: string;
  account_row_version: number;
  party_row_version: number;
  created_at: string;
  updated_at: string;
}

export const decodeCanonicalCustomer = (value: unknown, index = 0): CanonicalCustomerRead => {
  const row = record(value, `Customer row ${index + 1}`);
  const label = `Customer row ${index + 1}`;
  return {
    customer_id: uuid(row.customer_id, `${label} identity`),
    party_id: uuid(row.party_id, `${label} party identity`),
    customer_code: text(row.customer_code, `${label} code`),
    customer_name: text(row.customer_name, `${label} name`),
    trade_name: nullableText(row.trade_name, `${label} trade name`),
    primary_phone: nullableText(row.primary_phone, `${label} phone`),
    primary_email: nullableText(row.primary_email, `${label} email`),
    contact_person_name: nullableText(row.contact_person_name, `${label} contact person`),
    pan_number: nullableText(row.pan_number, `${label} PAN`),
    gst_number: nullableText(row.gst_number, `${label} GSTIN`),
    gst_verification_status: nullableText(row.gst_verification_status, `${label} GST status`),
    place_of_supply_state_code: nullableText(row.place_of_supply_state_code, `${label} place of supply`),
    credit_limit: money(row.credit_limit, `${label} credit limit`),
    credit_days: integer(row.credit_days, `${label} credit days`),
    current_outstanding: money(row.current_outstanding, `${label} outstanding`),
    customer_type: text(row.customer_type, `${label} type`),
    is_active: boolean(row.is_active, `${label} active state`),
    status: text(row.status, `${label} status`),
    account_row_version: positiveInteger(row.account_row_version, `${label} account row version`),
    party_row_version: positiveInteger(row.party_row_version, `${label} party row version`),
    created_at: text(row.created_at, `${label} created timestamp`),
    updated_at: text(row.updated_at, `${label} updated timestamp`),
  };
};

export interface CanonicalCustomerList {
  customers: CanonicalCustomerRead[];
  total: number;
  skip: number;
  limit: number;
}

export const decodeCanonicalCustomerList = (value: unknown): CanonicalCustomerList => {
  const payload = record(value, 'Customer response');
  return {
    customers: array(payload.customers, 'Customer response customers').map(decodeCanonicalCustomer),
    total: integer(payload.total, 'Customer response total'),
    skip: integer(payload.skip, 'Customer response skip'),
    limit: integer(payload.limit, 'Customer response limit'),
  };
};

export interface CanonicalSupplierRead {
  supplier_id: string;
  party_id: string;
  supplier_code: string;
  supplier_name: string;
  trade_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  contact_person: string | null;
  pan_number: string | null;
  gst_number: string | null;
  gst_verification_status: string | null;
  payment_days: number;
  current_outstanding: ExactDecimal;
  supplier_type: string;
  is_active: boolean;
  status: string;
  account_row_version: number;
  party_row_version: number;
  created_at: string;
  updated_at: string;
}

export const decodeCanonicalSupplierList = (value: unknown): CanonicalSupplierRead[] => (
  array(value, 'Supplier response').map((item, index) => {
    const row = record(item, `Supplier row ${index + 1}`);
    const label = `Supplier row ${index + 1}`;
    return {
      supplier_id: uuid(row.supplier_id, `${label} identity`),
      party_id: uuid(row.party_id, `${label} party identity`),
      supplier_code: text(row.supplier_code, `${label} code`),
      supplier_name: text(row.supplier_name, `${label} name`),
      trade_name: nullableText(row.trade_name, `${label} trade name`),
      primary_phone: nullableText(row.primary_phone, `${label} phone`),
      primary_email: nullableText(row.primary_email, `${label} email`),
      contact_person: nullableText(row.contact_person, `${label} contact person`),
      pan_number: nullableText(row.pan_number, `${label} PAN`),
      gst_number: nullableText(row.gst_number, `${label} GSTIN`),
      gst_verification_status: nullableText(row.gst_verification_status, `${label} GST status`),
      payment_days: integer(row.payment_days, `${label} payment days`),
      current_outstanding: money(row.current_outstanding, `${label} outstanding`),
      supplier_type: text(row.supplier_type, `${label} type`),
      is_active: boolean(row.is_active, `${label} active state`),
      status: text(row.status, `${label} status`),
      account_row_version: positiveInteger(row.account_row_version, `${label} account row version`),
      party_row_version: positiveInteger(row.party_row_version, `${label} party row version`),
      created_at: text(row.created_at, `${label} created timestamp`),
      updated_at: text(row.updated_at, `${label} updated timestamp`),
    };
  })
);

export interface CanonicalProductRead {
  product_id: string;
  product_code: string;
  product_name: string;
  generic_name: string | null;
  product_type: string;
  unit: string;
  uom_conversion_id: string | null;
  taxability: string | null;
  gst_percent: ExactDecimal | null;
  hsn_code: string | null;
  current_stock: ExactDecimal;
  is_active: boolean;
  status: string;
  row_version: number;
}

const decodeCanonicalProductRows = (value: unknown): CanonicalProductRead[] => (
  array(value, 'Product response products').map((item, index) => {
    const row = record(item, `Product row ${index + 1}`);
    const label = `Product row ${index + 1}`;
    return {
      ...row,
      product_id: uuid(row.product_id, `${label} identity`),
      product_code: text(row.product_code, `${label} code`),
      product_name: text(row.product_name, `${label} name`),
      generic_name: nullableText(row.generic_name, `${label} generic name`),
      product_type: text(row.product_type, `${label} type`),
      unit: text(row.unit, `${label} unit`),
      uom_conversion_id: row.uom_conversion_id === null
        ? null : uuid(row.uom_conversion_id, `${label} UOM conversion`),
      taxability: nullableText(row.taxability, `${label} taxability`),
      gst_percent: nullableDecimal(row.gst_percent, `${label} GST rate`),
      hsn_code: nullableText(row.hsn_code, `${label} HSN`),
      current_stock: decimal(row.current_stock, `${label} current stock`),
      is_active: boolean(row.is_active, `${label} active state`),
      status: text(row.status, `${label} status`),
      row_version: integer(row.row_version, `${label} row version`),
    } as CanonicalProductRead;
  })
);

export const decodeCanonicalProductList = (value: unknown) => {
  const payload = record(value, 'Product response');
  return {
    products: decodeCanonicalProductRows(payload.products),
    total: integer(payload.total, 'Product response total'),
    offset: integer(payload.offset, 'Product response offset'),
    limit: integer(payload.limit, 'Product response limit'),
  };
};

export interface CanonicalBranchRead {
  branch_id: string;
  branch_code: string;
  branch_name: string;
  is_active: true;
  status: 'active';
}

export const decodeCanonicalBranchList = (value: unknown): { branches: CanonicalBranchRead[]; total: number } => {
  const payload = record(value, 'Branch response');
  const branches = array(payload.branches, 'Branch response branches').map((item, index) => {
    const row = record(item, `Branch row ${index + 1}`);
    if (row.is_active !== true || row.status !== 'active') {
      throw new Error(`Branch row ${index + 1} is not active`);
    }
    return {
      ...row,
      branch_id: uuid(row.branch_id, `Branch row ${index + 1} identity`),
      branch_code: text(row.branch_code, `Branch row ${index + 1} code`),
      branch_name: text(row.branch_name, `Branch row ${index + 1} name`),
      is_active: true,
      status: 'active',
    } as CanonicalBranchRead;
  });
  const total = integer(payload.total, 'Branch response total');
  if (total !== branches.length) throw new Error('Branch response total does not reconcile');
  return { branches, total };
};

export interface CanonicalEmployeeRead {
  employee_id: string;
  employee_code: string;
  employee_name: string;
  full_name: string;
  designation: string | null;
  personal_email: string | null;
  personal_mobile: string | null;
  branch_id: string | null;
  branch_name: string | null;
  department_id: string | null;
  department_name: string | null;
  employment_status: string;
  is_active: boolean;
}

export const decodeCanonicalEmployeeList = (value: unknown) => {
  const payload = record(value, 'Employee response');
  const employees = array(payload.employees, 'Employee response employees').map((item, index) => {
    const row = record(item, `Employee row ${index + 1}`);
    const optionalUuid = (identity: unknown, label: string) => identity === null ? null : uuid(identity, label);
    return {
      ...row,
      employee_id: uuid(row.employee_id, `Employee row ${index + 1} identity`),
      employee_code: text(row.employee_code, `Employee row ${index + 1} code`),
      employee_name: text(row.employee_name, `Employee row ${index + 1} name`),
      full_name: text(row.full_name, `Employee row ${index + 1} legal name`),
      designation: nullableText(row.designation, `Employee row ${index + 1} designation`),
      personal_email: nullableText(row.personal_email, `Employee row ${index + 1} email`),
      personal_mobile: nullableText(row.personal_mobile, `Employee row ${index + 1} phone`),
      branch_id: optionalUuid(row.branch_id, `Employee row ${index + 1} branch`),
      branch_name: nullableText(row.branch_name, `Employee row ${index + 1} branch name`),
      department_id: optionalUuid(row.department_id, `Employee row ${index + 1} department`),
      department_name: nullableText(row.department_name, `Employee row ${index + 1} department name`),
      employment_status: text(row.employment_status, `Employee row ${index + 1} status`),
      is_active: boolean(row.is_active, `Employee row ${index + 1} active state`),
    } as CanonicalEmployeeRead;
  });
  return {
    employees,
    total: integer(payload.total, 'Employee response total'),
    offset: integer(payload.offset, 'Employee response offset'),
    limit: integer(payload.limit, 'Employee response limit'),
  };
};

export interface CanonicalBankAccountRead {
  bank_account_id: string;
  settlement_account_id: string;
  settlement_account_code: string;
  settlement_account_name: string;
  bank_name: string;
  account_holder_name: string;
  ifsc: string;
  currency_code: 'INR';
  allows_bank_reconciliation: boolean;
  status: 'active';
}

export const decodeCanonicalBankAccountList = (value: unknown) => {
  const payload = record(value, 'Bank-account response');
  const bankAccounts = array(payload.bank_accounts, 'Bank-account response accounts').map((item, index) => {
    const row = record(item, `Bank account ${index + 1}`);
    if (row.currency_code !== 'INR' || row.status !== 'active') {
      throw new Error(`Bank account ${index + 1} is outside the active INR contract`);
    }
    return {
      bank_account_id: uuid(row.bank_account_id, `Bank account ${index + 1} identity`),
      settlement_account_id: uuid(row.settlement_account_id, `Bank account ${index + 1} settlement account`),
      settlement_account_code: text(row.settlement_account_code, `Bank account ${index + 1} settlement code`),
      settlement_account_name: text(row.settlement_account_name, `Bank account ${index + 1} settlement name`),
      bank_name: text(row.bank_name, `Bank account ${index + 1} bank name`),
      account_holder_name: text(row.account_holder_name, `Bank account ${index + 1} holder`),
      ifsc: text(row.ifsc, `Bank account ${index + 1} IFSC`),
      currency_code: 'INR' as const,
      allows_bank_reconciliation: boolean(
        row.allows_bank_reconciliation,
        `Bank account ${index + 1} reconciliation capability`,
      ),
      status: 'active' as const,
    };
  });
  const total = integer(payload.total, 'Bank-account response total');
  if (total !== bankAccounts.length) throw new Error('Bank-account response total does not reconcile');
  return { bank_accounts: bankAccounts, total };
};
