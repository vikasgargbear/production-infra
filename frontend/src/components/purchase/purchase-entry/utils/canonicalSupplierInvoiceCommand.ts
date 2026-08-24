import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import type { CanonicalSupplierInvoiceContext } from '../../../../services/api/modules/purchase/canonicalSupplierInvoices.api';
import type { CanonicalCommandPreview } from '../../../../services/api/canonicalOperatorActions';

const QUANTITY = /^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;
const MONEY_RATE = /^(?:0|[1-9][0-9]{0,15})(?:\.[0-9]{1,4})?$/;
const DISCOUNT = /^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;

function positiveDecimal(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value) || /^0(?:\.0+)?$/.test(value)) {
    throw new Error(`${label} must be an exact positive decimal string.`);
  }
  return value;
}

function nonnegativeDecimal(value: string, pattern: RegExp, label: string): string {
  if (!pattern.test(value)) throw new Error(`${label} must be an exact non-negative decimal string.`);
  return value;
}

export interface SupplierInvoiceLineInput {
  goodsReceiptLineId: string;
  quotedUnitRate: string;
}

export interface SupplierInvoiceDraftInput {
  idempotencyKey: string;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  receivedDate: string;
  itcBusinessUseAttested: boolean;
  lines: SupplierInvoiceLineInput[];
}

export function buildCanonicalSupplierInvoicePreparePayload(
  context: CanonicalSupplierInvoiceContext,
  draft: SupplierInvoiceDraftInput,
): Record<string, unknown> {
  if (!context.ready || context.blocking_reasons.length || !context.portal_evidence) {
    throw new Error(context.blocking_reasons[0] || 'Canonical supplier-invoice source evidence is incomplete.');
  }
  for (const [label, value] of [
    ['branch', context.branch_id],
    ['supplier', context.supplier_account_id],
    ['supplier GST registration', context.supplier_tax_registration_id],
    ['GSTR-2B portal line', context.portal_evidence.portal_document_line_id],
  ] as const) {
    if (!value || !isCanonicalUuid(value)) throw new Error(`Canonical ${label} identity is missing.`);
  }
  if (!draft.itcBusinessUseAttested) {
    throw new Error('Confirm taxable resale business use and absence of a Section 17 blocked-credit condition.');
  }
  if (!draft.supplierInvoiceNumber.trim()) throw new Error('Supplier invoice number is required.');
  if (draft.receivedDate < draft.invoiceDate) throw new Error('Received date cannot precede invoice date.');
  if (draft.lines.length !== context.lines.length) {
    throw new Error('Every unallocated posted-GRN line must be represented exactly once.');
  }
  const selectedRates = new Map(draft.lines.map((line) => [line.goodsReceiptLineId, line.quotedUnitRate]));
  if (selectedRates.size !== draft.lines.length) throw new Error('A posted-GRN line is repeated.');

  return {
    idempotency_key: draft.idempotencyKey,
    branch_id: context.branch_id,
    invoice_date: draft.invoiceDate,
    document_discount: {
      document_discount_kind: context.document_discount_kind,
      document_discount_basis: context.document_discount_basis,
      document_discount_value: nonnegativeDecimal(
        context.document_discount_value,
        DISCOUNT,
        'Document discount',
      ),
    },
    rounding_policy: context.rounding_policy,
    zero_rated_payment_mode: 'not_applicable',
    supplier_account_id: context.supplier_account_id,
    supplier_tax_registration_id: context.supplier_tax_registration_id,
    supplier_invoice_number: draft.supplierInvoiceNumber.trim(),
    received_date: draft.receivedDate,
    tax_charge_mechanism: 'normal',
    portal_document_line_id: context.portal_evidence.portal_document_line_id,
    goods_receipt_ids: context.goods_receipt_ids,
    lines: context.lines.map((line) => {
      const rate = selectedRates.get(line.goods_receipt_line_id);
      if (rate === undefined) throw new Error(`Rate for ${line.product_name} is missing.`);
      const billed = nonnegativeDecimal(line.remaining_billed_quantity, QUANTITY, `${line.product_name} billed quantity`);
      const free = nonnegativeDecimal(line.remaining_free_quantity, QUANTITY, `${line.product_name} free quantity`);
      if (/^0(?:\.0+)?$/.test(billed) && /^0(?:\.0+)?$/.test(free)) {
        throw new Error(`${line.product_name} has no positive unallocated receipt quantity.`);
      }
      return {
        billed_quantity: billed,
        free_quantity: free,
        free_supply_tax_treatment: line.suggested_free_supply_tax_treatment,
        quoted_unit_rate: positiveDecimal(rate, MONEY_RATE, `${line.product_name} rate`),
        price_basis: line.suggested_price_basis,
        line_discount: {
          line_discount_kind: line.suggested_line_discount_kind,
          line_discount_basis: line.suggested_line_discount_basis,
          line_discount_value: nonnegativeDecimal(
            line.suggested_line_discount_value,
            DISCOUNT,
            `${line.product_name} discount`,
          ),
        },
        document_discount_eligible: true,
        goods_receipt_line_id: line.goods_receipt_line_id,
        allocated_base_billed_quantity: nonnegativeDecimal(
          line.remaining_base_billed_quantity,
          QUANTITY,
          `${line.product_name} billed base allocation`,
        ),
        allocated_base_free_quantity: nonnegativeDecimal(
          line.remaining_base_free_quantity,
          QUANTITY,
          `${line.product_name} free base allocation`,
        ),
        product_inventory_cost_treatment: 'capitalize',
        itc_eligibility: 'eligible',
        itc_eligibility_basis: 'taxable_resale_not_blocked_under_section_17',
      };
    }),
    ...(context.expense_charge_lines.length ? {
      expense_charge_lines: context.expense_charge_lines.map((line) => {
        if (!isCanonicalUuid(line.net_value_account_id)) {
          throw new Error(`Canonical expense account for ${line.expense_charge_code} is missing.`);
        }
        return {
          expense_charge_code: line.expense_charge_code,
          quoted_amount: nonnegativeDecimal(
            line.quoted_amount,
            /^(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,2})?$/,
            `${line.expense_charge_code} charge`,
          ),
          expense_price_basis: line.expense_price_basis,
          expense_document_discount_eligible: line.expense_document_discount_eligible,
          charge_inventory_cost_treatment: 'expense',
          net_value_account_id: line.net_value_account_id,
          itc_eligibility: 'eligible',
          itc_eligibility_basis: 'taxable_resale_not_blocked_under_section_17',
        };
      }),
    } : {}),
  };
}

export function validateCanonicalSupplierInvoicePreview(
  preview: CanonicalCommandPreview,
  context: CanonicalSupplierInvoiceContext,
): CanonicalCommandPreview {
  if (preview.command_type !== 'procurement.supplier_invoice.post') {
    throw new Error('Canonical prepare returned the wrong supplier-invoice command type.');
  }
  const financial = Array.isArray(preview.financial_impact) ? preview.financial_impact : [];
  const inventory = Array.isArray(preview.inventory_impact) ? preview.inventory_impact : [];
  const tax = Array.isArray(preview.tax_impact) ? preview.tax_impact : [];
  const payable = financial[0] as Record<string, unknown> | undefined;
  const stock = inventory[0] as Record<string, unknown> | undefined;
  const inputTax = tax[0] as Record<string, unknown> | undefined;
  const exactMoney = /^(?:0|[1-9][0-9]{0,17})\.[0-9]{2}$/;
  if (
    financial.length !== 1
    || !payable
    || payable.currency_code !== 'INR'
    || typeof payable.supplier_payable !== 'string'
    || !exactMoney.test(payable.supplier_payable)
  ) {
    throw new Error('Canonical supplier-invoice preview has no exact INR payable impact.');
  }
  if (
    inventory.length !== 1
    || !stock
    || stock.effect !== 'receipt_cost_match_no_landed_cost'
    || stock.inventory_value_delta !== '0.00'
  ) {
    throw new Error('Canonical supplier-invoice preview must confirm zero second inventory movement.');
  }
  if (
    tax.length !== 1
    || !inputTax
    || inputTax.itc_eligibility !== 'eligible'
    || inputTax.portal_document_line_id !== context.portal_evidence?.portal_document_line_id
  ) {
    throw new Error('Canonical supplier-invoice preview does not match the selected GSTR-2B ITC evidence.');
  }
  for (const field of ['cgst_total', 'sgst_total', 'igst_total', 'cess_total']) {
    if (typeof inputTax[field] !== 'string' || !exactMoney.test(inputTax[field] as string)) {
      throw new Error(`Canonical supplier-invoice preview has invalid exact ${field}.`);
    }
  }
  return preview;
}
