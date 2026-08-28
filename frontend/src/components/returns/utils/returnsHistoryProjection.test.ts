import { normalizeReturnStatus, projectReturnHistoryRow, returnsHistoryCsv } from './returnsHistoryProjection';

describe('returns history canonical presentation', () => {
    it('preserves original document identity and canonical lifecycle status', () => {
        const row = projectReturnHistoryRow({
            document_kind: 'sales_return',
            document_id: '0198ea37-2b1c-7c8d-9123-123456789abc',
            branch_id: '0198ea37-2b1d-7c8d-9123-123456789abc',
            document_number: 'DEMO-SR-1',
            document_date: '2026-08-24',
            due_date: null,
            status: 'posted',
            party_account_id: '0198ea37-2b1e-7c8d-9123-123456789abc',
            party_name: 'Demo Customer',
            source_document_type: 'sales_invoice',
            source_document_id: '0198ea37-2b1f-7c8d-9123-123456789abc',
            source_document_number: 'DEMO-SI-1',
            line_count: 1,
            total_quantity: '1.000000',
            minimum_unit_rate: '100.0000',
            maximum_unit_rate: '100.0000',
            taxable_amount: '100.00',
            total_tax: '12.00',
            total_amount: '112.00',
            paid_amount: null,
            outstanding_amount: null,
            payment_status: null,
            created_at: '2026-08-24T10:00:00+05:30',
            updated_at: '2026-08-24T10:00:00+05:30',
        });
        expect(row).toEqual(expect.objectContaining({
            original_document_no: 'DEMO-SI-1', status: 'posted', total_amount: '112.00', items_count: 1,
        }));
        expect(normalizeReturnStatus(row.status).label).toBe('Posted');
        expect(returnsHistoryCsv([row])).toContain('"DEMO-SI-1"');
        expect(returnsHistoryCsv([row])).toContain('"Posted"');
        expect(returnsHistoryCsv([{ ...row, return_no: '  =2+2', customer_name: '@attacker' }]))
            .toContain('"\'  =2+2"');
    });

    it('rejects non-return documents and missing canonical totals', () => {
        const base = {
            document_kind: 'sales_return', document_id: 'x', branch_id: 'y', document_number: 'SR-1',
            document_date: '2026-08-24', due_date: null, status: 'posted', party_account_id: 'z',
            party_name: 'Party', source_document_type: null, source_document_id: null,
            source_document_number: null, line_count: 0, total_quantity: '0', minimum_unit_rate: null,
            maximum_unit_rate: null, taxable_amount: null, total_tax: null, total_amount: null,
            paid_amount: null, outstanding_amount: null, payment_status: null,
            created_at: 'x', updated_at: 'x',
        } as any;
        expect(() => projectReturnHistoryRow(base)).toThrow(/amount is unavailable/i);
        expect(() => projectReturnHistoryRow({ ...base, document_kind: 'sales_invoice', total_amount: '0.00' }))
            .toThrow(/non-return/i);
    });
});
