import { normalizeReturnStatus, projectReturnsHistoryRows, returnsHistoryCsv } from './returnsHistoryProjection';

describe('returns history canonical presentation', () => {
    it('preserves original document identity and canonical lifecycle status', () => {
        const [row] = projectReturnsHistoryRows([{
            return_id: 'r-1', return_number: 'DEMO-SR-1', return_date: '2026-08-24',
            customer_name: 'Demo Customer', original_document_no: 'DEMO-SI-1',
            status: 'posted', reason: 'DAMAGED', total_amount: '112.00', items_count: 1,
        }], 'sales');
        expect(row).toEqual(expect.objectContaining({
            original_document_no: 'DEMO-SI-1', status: 'posted', total_amount: '112.00', items_count: 1,
        }));
        expect(normalizeReturnStatus(row.status).label).toBe('Posted');
        expect(returnsHistoryCsv([row])).toContain('"DEMO-SI-1"');
        expect(returnsHistoryCsv([row])).toContain('"Posted"');
        expect(returnsHistoryCsv([{ ...row, return_no: '  =2+2', customer_name: '@attacker' }]))
            .toContain('"\'  =2+2"');
    });
});
