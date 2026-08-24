/** Boundary between return UI state and backend-owned calculations. */

import {
    returnCalculationsApi,
    ReturnCalculationRequest,
    type ReturnCalculationPreviewLine,
    type ReturnCalculationPreviewTotals,
} from '../api/modules/sales/returnCalculations.api';
import {
    addExactDecimals,
    compareExactDecimals,
    exactDecimalUnits,
    normalizeAuthoritativeDecimal,
    normalizeExactDecimal,
} from '../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const moneyOptions = { scale: 2, maximumWholeDigits: 20 } as const;
const signedMoneyOptions = { ...moneyOptions, allowNegative: true } as const;

function entityId(value: unknown): number | string | undefined {
    if (typeof value === 'string' && value.trim()) return value;
    return undefined;
}

export interface ReturnPreviewResult {
    items: Array<Record<string, unknown>>;
    totals: ReturnCalculationPreviewTotals & {
        subtotal_amount: string;
        total_tax_amount: string;
        final_amount: string;
    };
    gst_type: 'CGST/SGST' | 'IGST';
}

const inputQuantity = (value: unknown, label: string): string =>
    normalizeExactDecimal(value, label, quantityOptions);
const inputRate = (value: unknown, label: string): string =>
    normalizeExactDecimal(value, label, rateOptions);
const outputQuantity = (value: unknown, label: string): string =>
    normalizeAuthoritativeDecimal(value, label, quantityOptions);
const outputRate = (value: unknown, label: string): string =>
    normalizeAuthoritativeDecimal(value, label, rateOptions);
const outputMoney = (value: unknown, label: string): string =>
    normalizeAuthoritativeDecimal(value, label, moneyOptions);

function positiveQuantity(value: unknown, label: string): boolean {
    return exactDecimalUnits(value, label, quantityOptions) > 0n;
}

function normalizeLine(line: ReturnCalculationPreviewLine, index: number) {
    const label = `Return preview lines[${index}]`;
    return {
        ...line,
        return_quantity: outputQuantity(line.return_quantity, `${label}.return_quantity`),
        taxable_quantity: outputQuantity(line.taxable_quantity, `${label}.taxable_quantity`),
        unit_price: outputRate(line.unit_price, `${label}.unit_price`),
        discount_percent: outputRate(line.discount_percent, `${label}.discount_percent`),
        discount_amount: outputMoney(line.discount_amount, `${label}.discount_amount`),
        tax_percent: outputRate(line.tax_percent, `${label}.tax_percent`),
        taxable_amount: outputMoney(line.taxable_amount, `${label}.taxable_amount`),
        cgst_amount: outputMoney(line.cgst_amount, `${label}.cgst_amount`),
        sgst_amount: outputMoney(line.sgst_amount, `${label}.sgst_amount`),
        igst_amount: outputMoney(line.igst_amount, `${label}.igst_amount`),
        tax_amount: outputMoney(line.tax_amount, `${label}.tax_amount`),
        total_amount: outputMoney(line.total_amount, `${label}.total_amount`),
    };
}

function normalizeTotals(totals: ReturnCalculationPreviewTotals): ReturnCalculationPreviewTotals {
    return {
        ...totals,
        subtotal: outputMoney(totals.subtotal, 'Return preview totals.subtotal'),
        tax_amount: outputMoney(totals.tax_amount, 'Return preview totals.tax_amount'),
        cgst_amount: outputMoney(totals.cgst_amount, 'Return preview totals.cgst_amount'),
        sgst_amount: outputMoney(totals.sgst_amount, 'Return preview totals.sgst_amount'),
        igst_amount: outputMoney(totals.igst_amount, 'Return preview totals.igst_amount'),
        round_off_amount: normalizeAuthoritativeDecimal(
            totals.round_off_amount,
            'Return preview totals.round_off_amount',
            signedMoneyOptions,
        ),
        total_amount: outputMoney(totals.total_amount, 'Return preview totals.total_amount'),
        total_return_quantity: outputQuantity(
            totals.total_return_quantity,
            'Return preview totals.total_return_quantity',
        ),
    };
}

function assertReconciled(
    request: ReturnCalculationRequest,
    lines: ReturnType<typeof normalizeLine>[],
    totals: ReturnCalculationPreviewTotals,
) {
    if (lines.length !== request.items.length) {
        throw new Error('Return preview line count does not match the submitted calculation lines.');
    }
    lines.forEach((line, index) => {
        if (compareExactDecimals(
            line.return_quantity,
            request.items[index].return_quantity,
            `Return preview lines[${index}] quantity`,
            quantityOptions,
        ) !== 0) {
            throw new Error(`Return preview lines[${index}] changed the submitted return quantity.`);
        }
        if (compareExactDecimals(
            line.unit_price,
            request.items[index].unit_price,
            `Return preview lines[${index}] unit rate`,
            rateOptions,
        ) !== 0) {
            throw new Error(`Return preview lines[${index}] changed the submitted unit rate.`);
        }
    });
    const expectedQuantity = addExactDecimals(
        request.items.map(item => item.return_quantity),
        'Return preview requested quantity total',
        quantityOptions,
    );
    if (compareExactDecimals(
        totals.total_return_quantity,
        expectedQuantity,
        'Return preview total quantity reconciliation',
        quantityOptions,
    ) !== 0) {
        throw new Error('Return preview total quantity does not reconcile to its lines.');
    }
    const expectedSubtotal = addExactDecimals(
        lines.map(line => line.taxable_amount),
        'Return preview line taxable total',
        moneyOptions,
    );
    const expectedTax = addExactDecimals(
        lines.map(line => line.tax_amount),
        'Return preview line tax total',
        moneyOptions,
    );
    const expectedCgst = addExactDecimals(
        lines.map(line => line.cgst_amount),
        'Return preview line CGST total',
        moneyOptions,
    );
    const expectedSgst = addExactDecimals(
        lines.map(line => line.sgst_amount),
        'Return preview line SGST total',
        moneyOptions,
    );
    const expectedIgst = addExactDecimals(
        lines.map(line => line.igst_amount),
        'Return preview line IGST total',
        moneyOptions,
    );
    const expectedBeforeRounding = addExactDecimals(
        lines.map(line => line.total_amount),
        'Return preview line grand total',
        moneyOptions,
    );
    const expectedTotal = addExactDecimals(
        [expectedBeforeRounding, totals.round_off_amount],
        'Return preview rounded grand total',
        signedMoneyOptions,
    );
    if (
        compareExactDecimals(totals.subtotal, expectedSubtotal, 'Return preview subtotal reconciliation', moneyOptions) !== 0
        || compareExactDecimals(totals.tax_amount, expectedTax, 'Return preview tax reconciliation', moneyOptions) !== 0
        || compareExactDecimals(totals.cgst_amount, expectedCgst, 'Return preview CGST reconciliation', moneyOptions) !== 0
        || compareExactDecimals(totals.sgst_amount, expectedSgst, 'Return preview SGST reconciliation', moneyOptions) !== 0
        || compareExactDecimals(totals.igst_amount, expectedIgst, 'Return preview IGST reconciliation', moneyOptions) !== 0
        || compareExactDecimals(totals.total_amount, expectedTotal, 'Return preview grand-total reconciliation', signedMoneyOptions) !== 0
    ) {
        throw new Error('Return preview totals do not reconcile to their authoritative lines.');
    }
}

export async function calculateReturnPreview(
    returnData: any,
    returnType: 'sales' | 'purchase'
): Promise<ReturnPreviewResult> {
    const selectedItems = (returnData.items || []).filter((item: any) => {
        if (item.selected === false) return false;
        try {
            return positiveQuantity(item.return_quantity ?? item.quantity, 'Return quantity');
        } catch {
            return false;
        }
    });
    if (!selectedItems.length) throw new Error('At least one exact return quantity is required.');
    const includeGst = returnType === 'sales'
        ? !Boolean(returnData.withhold_gst)
        : returnData.include_gst !== false;

    const request: ReturnCalculationRequest = {
        return_type: returnType,
        customer_id: returnType === 'sales' && returnData.customer_id
            ? entityId(returnData.customer_id)
            : undefined,
        supplier_id: returnType === 'purchase' && returnData.supplier_id
            ? entityId(returnData.supplier_id)
            : undefined,
        gst_type: returnData.gst_type,
        include_gst: includeGst,
        items: selectedItems.map((item: any, index: number) => {
            const label = `Return calculation items[${index}]`;
            const paidQuantity = inputQuantity(
                item.return_paid_qty ?? item.paid_quantity,
                `${label}.paid_quantity`,
            );
            const freeQuantity = inputQuantity(
                item.return_free_qty ?? item.free_quantity ?? '0',
                `${label}.free_quantity`,
            );
            const totalQuantity = addExactDecimals(
                [paidQuantity, freeQuantity],
                `${label}.return_quantity`,
                quantityOptions,
            );
            if (!positiveQuantity(totalQuantity, `${label}.return_quantity`)) {
                throw new Error(`${label}.return_quantity must be positive.`);
            }
            if (compareExactDecimals(
                item.return_quantity,
                totalQuantity,
                `${label}.billed/free reconciliation`,
                quantityOptions,
            ) !== 0) {
                throw new Error(`${label}.return_quantity does not match its billed/free split.`);
            }
            return {
                product_id: entityId(item.product_id),
                return_quantity: totalQuantity,
                paid_quantity: paidQuantity,
                free_quantity: freeQuantity,
                unit_price: inputRate(item.unit_price ?? item.rate, `${label}.unit_price`),
                discount_percent: inputRate(item.discount_percent ?? '0', `${label}.discount_percent`),
                tax_percent: inputRate(item.tax_percent ?? item.gst_percent ?? '0', `${label}.tax_percent`),
            };
        }),
    };
    const response = await returnCalculationsApi.preview(request);
    if (response.data.success !== true || !Array.isArray(response.data.line_items)) {
        throw new Error('Return preview response is not the reviewed calculation contract.');
    }
    if (response.data.gst_type !== 'CGST/SGST' && response.data.gst_type !== 'IGST') {
        throw new Error('Return preview response has an unsupported GST treatment.');
    }
    const totals = normalizeTotals(response.data.totals);
    const normalizedLines = response.data.line_items.map(normalizeLine);
    assertReconciled(request, normalizedLines, totals);
    const items = normalizedLines.map((line, index) => ({
        ...(selectedItems[index] || {}),
        ...line,
        return_value: line.taxable_amount,
        gst_amount: line.tax_amount,
        line_total: line.total_amount,
    }));
    return {
        items,
        totals: {
            ...totals,
            subtotal_amount: totals.subtotal,
            total_tax_amount: totals.tax_amount,
            final_amount: totals.total_amount,
        },
        gst_type: response.data.gst_type
    };
}
