import { transformInvoicesToGSTR1 } from './gstTransforms';
import { applyNoteAdjustments, classifyGSTR1Notes } from './gstCalculations';

test('legacy browser-side GSTR-1 classification fails closed without a reviewed rule', () => {
    expect(() => transformInvoicesToGSTR1([
        {
            status: 'posted',
            customer_id: 'customer-1',
            customer_name: 'Registered Buyer',
            customer_gst_number: '27ABCDE1234F1Z5',
            taxable_amount: '100.50',
            cgst_amount: '6.03',
            sgst_amount: '6.03',
            igst_amount: 0,
        },
        {
            status: 'posted',
            customer_id: 'customer-2',
            customer_name: 'Retail Buyer',
            taxable_amount: 50,
            cgst_amount: 3,
            sgst_amount: 3,
            igst_amount: 0,
        },
        {
            status: 'draft',
            customer_id: 'customer-3',
            customer_name: 'Draft Buyer',
            customer_gst_number: '27ABCDE1234F1Z5',
            taxable_amount: 999,
            cgst_amount: 99,
            sgst_amount: 99,
            igst_amount: 99,
        },
    ])).toThrow('canonical date-effective GSTR-1 API');
});

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
