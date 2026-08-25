import { applyNoteAdjustments, classifyGSTR1Notes } from './gstCalculations';

test('GSTR-1 classifies only canonical outward sales notes', () => {
    const notes = [
        { note_type: 'sales_credit', cgst_amount: '6', sgst_amount: '6', igst_amount: 0 },
        { side: 'sales', direction: 'debit', cgst_amount: 3, sgst_amount: 3, igst_amount: 0 },
        { note_type: 'purchase_debit', cgst_amount: 50, sgst_amount: 50, igst_amount: 0 },
        { note_type: 'unknown', cgst_amount: 100, sgst_amount: 100, igst_amount: 0 },
    ];

    expect(classifyGSTR1Notes(notes).map(note => note.gstr1Direction)).toEqual(['credit', 'debit']);
    expect(applyNoteAdjustments({
        totalInvoices: 1,
        totalTaxableValue: 100,
        totalCGST: 9,
        totalSGST: 9,
        totalIGST: 0,
        totalTax: 18,
    }, notes)).toMatchObject({
        creditAdjustment: 12,
        debitAdjustment: 6,
        netAdjustment: -6,
        totalTax: 12,
    });
});
