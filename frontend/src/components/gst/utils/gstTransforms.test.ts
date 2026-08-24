import { transformInvoicesToGSTR1 } from './gstTransforms';

test('GSTR-1 uses posted canonical header totals and buyer GSTIN', () => {
    const report = transformInvoicesToGSTR1([
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
    ]);

    expect(report.b2b).toEqual([{
        gst_number: '27ABCDE1234F1Z5',
        name: 'Registered Buyer',
        invoices: 1,
        taxableValue: 100.5,
        cgst: 6.03,
        sgst: 6.03,
        igst: 0,
    }]);
    expect(report.b2c.small).toEqual({
        count: 1,
        taxableValue: 50,
        cgst: 3,
        sgst: 3,
        igst: 0,
    });
    expect(report.summary).toEqual({
        totalInvoices: 2,
        totalTaxableValue: 150.5,
        totalCGST: 9.03,
        totalSGST: 9.03,
        totalIGST: 0,
        totalTax: 18.06,
    });
});
