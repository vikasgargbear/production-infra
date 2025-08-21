// Test script to generate a sample invoice PDF
const fs = require('fs');
const path = require('path');

// Read the invoice PDF generator
const invoicePdfGenerator = fs.readFileSync('./src/utils/invoicePdfGenerator.js', 'utf8');

// Mock invoice data
const testInvoiceData = {
  id: 'INV-001',
  invoice_number: 'INV-2024-001',
  invoice_date: '2024-01-15',
  due_date: '2024-02-15',
  customer: {
    name: 'Test Customer Ltd.',
    address: '123 Business Street',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400001',
    phone: '+91 9876543210',
    email: 'customer@testltd.com'
  },
  items: [
    {
      product_name: 'Premium Product A',
      quantity: 2,
      rate: 1000,
      amount: 2000,
      tax_rate: 18,
      tax_amount: 360,
      total: 2360
    },
    {
      product_name: 'Standard Product B',
      quantity: 5,
      rate: 500,
      amount: 2500,
      tax_rate: 18,
      tax_amount: 450,
      total: 2950
    },
    {
      product_name: 'Basic Product C',
      quantity: 1,
      rate: 800,
      amount: 800,
      tax_rate: 18,
      tax_amount: 144,
      total: 944
    }
  ],
  subtotal: 5300,
  total_tax: 954,
  total: 6254,
  billing_address: '123 Business Street, Mumbai, Maharashtra - 400001',
  company: {
    name: 'AASO Industries Pvt Ltd',
    address: '456 Corporate Plaza',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400002',
    phone: '+91 1234567890',
    email: 'info@aaso.com',
    website: 'www.aaso.com'
  }
};

// Extract the generateInvoiceHTML function
const generateInvoiceHTML = (invoiceData) => {
  if (!invoiceData || !invoiceData.customer || !invoiceData.company) {
    throw new Error('Invalid invoice data: missing customer or company information');
  }

  const customerName = invoiceData.customer?.name || 'N/A';
  const billingAddress = invoiceData.billing_address || 
    `${invoiceData.customer?.address || ''}, ${invoiceData.customer?.city || ''}, ${invoiceData.customer?.state || ''} - ${invoiceData.customer?.pincode || ''}`.replace(/,\s*,/g, ',');

  const itemsHTML = (invoiceData.items || []).map(item => `
    <tr>
      <td>${item.product_name || 'N/A'}</td>
      <td style="text-align: center;">${item.quantity || 0}</td>
      <td style="text-align: right;">₹${(item.rate || 0).toFixed(2)}</td>
      <td style="text-align: right;">₹${(item.amount || 0).toFixed(2)}</td>
      <td style="text-align: right;">₹${(item.tax_amount || 0).toFixed(2)}</td>
      <td style="text-align: right; font-weight: bold;">₹${(item.total || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Invoice ${invoiceData.invoice_number}</title>
      <style>
        @page { 
          size: A4; 
          margin: 1.5cm 1cm; 
        }
        body { 
          margin: 0; 
          padding: 0; 
          background: white;
          font-size: 12px;
          font-family: Arial, sans-serif;
          line-height: 1.4;
        }
        .invoice-container {
          padding: 0;
          max-width: 100%;
          margin: 0;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 8px;
        }
        .header h1 {
          margin: 0 0 10px 0;
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 2px;
        }
        .header .company-info {
          font-size: 14px;
          margin-top: 10px;
        }
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          gap: 30px;
        }
        .customer-info, .invoice-info {
          width: 45%;
        }
        .customer-info h3, .invoice-info h3 {
          color: #667eea;
          border-bottom: 2px solid #667eea;
          padding-bottom: 8px;
          margin-bottom: 15px;
          font-size: 16px;
        }
        .info-line {
          margin-bottom: 8px;
          font-size: 13px;
        }
        .info-line strong {
          display: inline-block;
          width: 80px;
          color: #333;
        }
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .items-table th {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 15px 8px;
          text-align: left;
          font-weight: bold;
          font-size: 12px;
        }
        .items-table td {
          padding: 12px 8px;
          border-bottom: 1px solid #eee;
          font-size: 11px;
        }
        .items-table tr:nth-child(even) {
          background-color: #f8f9fa;
        }
        .items-table tr:hover {
          background-color: #e3f2fd;
        }
        .totals {
          text-align: right;
          margin-top: 30px;
          border: 2px solid #667eea;
          border-radius: 8px;
          padding: 20px;
          background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
        }
        .total-row {
          padding: 8px 0;
          display: flex;
          justify-content: space-between;
          border-bottom: 1px solid #ddd;
          font-size: 14px;
        }
        .total-row:last-child {
          border-bottom: none;
        }
        .final-total {
          font-size: 20px;
          font-weight: bold;
          color: #667eea;
          border-top: 3px solid #667eea;
          padding-top: 15px;
          margin-top: 10px;
        }
        .thank-you {
          text-align: center;
          margin-top: 40px;
          padding: 20px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border-radius: 8px;
          font-size: 16px;
        }
        @media print {
          .invoice-container {
            padding: 0 !important;
            box-shadow: none !important;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="header">
          <h1>INVOICE</h1>
          <div class="company-info">
            <strong>${invoiceData.company?.name || 'Company Name'}</strong><br>
            ${invoiceData.company?.address || ''}, ${invoiceData.company?.city || ''}<br>
            Phone: ${invoiceData.company?.phone || 'N/A'} | Email: ${invoiceData.company?.email || 'N/A'}
          </div>
        </div>
        
        <div class="invoice-details">
          <div class="customer-info">
            <h3>📋 Bill To:</h3>
            <div class="info-line"><strong>Name:</strong> ${customerName}</div>
            <div class="info-line"><strong>Address:</strong> ${billingAddress}</div>
            <div class="info-line"><strong>Phone:</strong> ${invoiceData.customer?.phone || 'N/A'}</div>
            <div class="info-line"><strong>Email:</strong> ${invoiceData.customer?.email || 'N/A'}</div>
          </div>
          
          <div class="invoice-info">
            <h3>📄 Invoice Details:</h3>
            <div class="info-line"><strong>Invoice #:</strong> ${invoiceData.invoice_number}</div>
            <div class="info-line"><strong>Date:</strong> ${invoiceData.invoice_date}</div>
            <div class="info-line"><strong>Due Date:</strong> ${invoiceData.due_date}</div>
            <div class="info-line"><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">Generated</span></div>
          </div>
        </div>
        
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 40%;">Item Description</th>
              <th style="width: 8%; text-align: center;">Qty</th>
              <th style="width: 12%; text-align: right;">Rate</th>
              <th style="width: 12%; text-align: right;">Amount</th>
              <th style="width: 12%; text-align: right;">Tax</th>
              <th style="width: 16%; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>
        
        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span><strong>₹${(invoiceData.subtotal || 0).toFixed(2)}</strong></span>
          </div>
          <div class="total-row">
            <span>Total Tax (GST):</span>
            <span><strong>₹${(invoiceData.total_tax || 0).toFixed(2)}</strong></span>
          </div>
          <div class="total-row final-total">
            <span>Grand Total:</span>
            <span><strong>₹${(invoiceData.total || 0).toFixed(2)}</strong></span>
          </div>
        </div>
        
        <div class="thank-you">
          <strong>Thank you for your business! 🙏</strong><br>
          <small>This is a computer-generated invoice.</small>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Generate and save the HTML
const htmlContent = generateInvoiceHTML(testInvoiceData);
fs.writeFileSync('test-invoice.html', htmlContent);

console.log('✅ Test invoice HTML generated successfully!');
console.log('📁 File saved as: test-invoice.html');
console.log('📄 Invoice Number:', testInvoiceData.invoice_number);
console.log('💰 Total Amount: ₹', testInvoiceData.total);
console.log('📋 Items Count:', testInvoiceData.items.length);
console.log('\n🌐 Open test-invoice.html in your browser to view the invoice');
console.log('🖨️  Use Ctrl+P (or Cmd+P) to test printing/PDF generation');