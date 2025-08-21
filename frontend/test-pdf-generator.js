// Test script to generate and save a PDF using the invoice PDF generator
import fs from 'fs';
import { generateInvoicePDF } from './src/utils/invoicePdfGenerator.js';

// Test invoice data with all required fields
const testInvoiceData = {
    invoice_number: 'INV-2025-001',
    invoice_date: '2025-01-21',
    due_date: '2025-02-21',
    customer_name: 'Test Customer Pvt Ltd',
    billing_address: 'Shop No. 123, ABC Market\nMG Road, Mumbai\nMaharashtra 400001',
    customer_gstin: '27AABCT1234E1ZX',
    customer_phone: '+91 9876543210',
    
    // Organization details
    org_name: 'AASO Pharma',
    org_address: 'Mumbai, Maharashtra',
    org_gstin: '27AABCU9603R1ZM',
    org_phone: '+91 98765 43210',
    
    // Items
    items: [
        {
            sr_no: 1,
            product_name: 'Paracetamol 500mg',
            hsn_code: '3004',
            quantity: 100,
            unit_price: 5.50,
            tax_percent: 12,
            line_total: 616.00,
            batch_number: 'BTH001',
            expiry_date: '2026-12'
        },
        {
            sr_no: 2,
            product_name: 'Amoxicillin 250mg Capsules',
            hsn_code: '3004',
            quantity: 50,
            unit_price: 12.00,
            tax_percent: 12,
            line_total: 672.00,
            batch_number: 'BTH002',
            expiry_date: '2025-06'
        },
        {
            sr_no: 3,
            product_name: 'Vitamin C 1000mg Tablets',
            hsn_code: '3004',
            quantity: 200,
            unit_price: 3.25,
            tax_percent: 12,
            line_total: 728.00,
            batch_number: 'BTH003',
            expiry_date: '2026-03'
        }
    ],
    
    // Summary
    subtotal_amount: '1800.00',
    discount_amount: '50.00',
    cgst_amount: '105.00',
    sgst_amount: '105.00',
    igst_amount: '0.00',
    round_off_amount: '0.04',
    final_amount: '1960.04',
    total_amount: '1960.04',
    
    // Bank details
    bank_details: {
        bank_name: 'State Bank of India',
        account_number: '1234567890',
        ifsc_code: 'SBIN0001234'
    },
    
    // Terms
    terms_and_conditions: 'Goods once sold will not be taken back or exchanged. All disputes subject to Mumbai jurisdiction only.'
};

try {
    // Generate the PDF blob
    const pdfBlob = generateInvoicePDF(testInvoiceData);
    
    // Convert blob to buffer and save
    const reader = new FileReader();
    reader.onloadend = function() {
        const buffer = Buffer.from(reader.result);
        fs.writeFileSync('test-invoice.pdf', buffer);
        console.log('PDF saved as test-invoice.pdf');
    };
    reader.readAsArrayBuffer(pdfBlob);
    
} catch (error) {
    console.error('Error generating PDF:', error);
}