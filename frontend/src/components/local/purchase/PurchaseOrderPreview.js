import React from 'react';
import { Calendar, Phone, Mail, MapPin, Building2, CreditCard, Truck, Shield } from 'lucide-react';

const PurchaseOrderPreview = ({ purchaseOrder }) => {
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return `₹${(parseFloat(amount) || 0).toFixed(2)}`;
  };

  // Calculate GST breakup
  const calculateGSTBreakup = () => {
    const gstBreakup = {};
    
    purchaseOrder.items.forEach(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const rate = parseFloat(item.purchase_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const taxPercent = parseFloat(item.tax_percent) || 0;
      
      const itemTotal = quantity * rate;
      const discountAmount = (itemTotal * discountPercent) / 100;
      const taxableAmount = itemTotal - discountAmount;
      const taxAmount = (taxableAmount * taxPercent) / 100;
      
      if (!gstBreakup[taxPercent]) {
        gstBreakup[taxPercent] = {
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0
        };
      }
      
      gstBreakup[taxPercent].taxableAmount += taxableAmount;
      gstBreakup[taxPercent].cgst += taxAmount / 2;
      gstBreakup[taxPercent].sgst += taxAmount / 2;
      gstBreakup[taxPercent].totalTax += taxAmount;
    });
    
    return gstBreakup;
  };

  const gstBreakup = calculateGSTBreakup();

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print-section, .print-section * {
            visibility: visible;
          }
          .print-section {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
          .no-print {
            display: none !important;
          }
          @page {
            margin: 0.5in;
            size: A4;
          }
        }
      `}</style>

      <div className="bg-white rounded-lg shadow-lg print:shadow-none print-section">
        {/* Header */}
        <div className="p-8 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">PURCHASE ORDER</h1>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-gray-700">PO No: {purchaseOrder.po_no}</p>
                <p className="text-gray-600">Date: {formatDate(purchaseOrder.po_date)}</p>
                <p className="text-gray-600">Expected Delivery: {formatDate(purchaseOrder.expected_delivery_date)}</p>
              </div>
            </div>
            
            <div className="text-right">
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}
              </h2>
              <div className="text-sm text-gray-600 space-y-1">
                <p>{localStorage.getItem('company_address') || '123 Business Street, City'}</p>
                <p>GSTIN: {localStorage.getItem('company_gstin') || '24XXXXX1234Z5'}</p>
                <p>DL No: {localStorage.getItem('buyer_drug_license') || '20B/21B-XXX'}</p>
                <p>Phone: {localStorage.getItem('company_phone') || '+91 99999 99999'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Supplier Details - Compact */}
        <div className="px-8 py-3 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-1 flex items-center">
                <Building2 className="w-3 h-3 mr-1" />
                Bill To
              </h3>
              <div>
                <p className="text-sm font-semibold text-gray-900">{purchaseOrder.supplier_name}</p>
                <p className="text-xs text-gray-600">{purchaseOrder.billing_address || purchaseOrder.supplier_details?.address || 'Address not provided'}</p>
                <div className="flex gap-4 text-xs text-gray-600 mt-1">
                  {purchaseOrder.supplier_details?.gst_number && (
                    <span>GSTIN: {purchaseOrder.supplier_details.gst_number}</span>
                  )}
                  {purchaseOrder.drug_license_no && (
                    <span>DL: {purchaseOrder.drug_license_no}</span>
                  )}
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-xs font-semibold text-gray-700 mb-1">Contact & Terms</h3>
              <div className="text-xs text-gray-600">
                <div className="flex gap-4">
                  {purchaseOrder.supplier_details?.phone && (
                    <span><Phone className="w-3 h-3 inline mr-1" />{purchaseOrder.supplier_details.phone}</span>
                  )}
                  {purchaseOrder.supplier_details?.email && (
                    <span><Mail className="w-3 h-3 inline mr-1" />{purchaseOrder.supplier_details.email}</span>
                  )}
                </div>
                <div className="flex gap-4 mt-1">
                  {purchaseOrder.payment_terms && (
                    <span><strong>Payment:</strong> {purchaseOrder.payment_terms}</span>
                  )}
                  {purchaseOrder.delivery_terms && (
                    <span><strong>Delivery:</strong> {purchaseOrder.delivery_terms}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reference Numbers */}
        {(purchaseOrder.quotation_no || purchaseOrder.requisition_no || purchaseOrder.reference_no) && (
          <div className="px-8 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex gap-8 text-sm">
              {purchaseOrder.quotation_no && (
                <div>
                  <span className="font-medium text-gray-700">Quotation Ref:</span>
                  <span className="ml-2 text-gray-600">{purchaseOrder.quotation_no}</span>
                </div>
              )}
              {purchaseOrder.requisition_no && (
                <div>
                  <span className="font-medium text-gray-700">Requisition No:</span>
                  <span className="ml-2 text-gray-600">{purchaseOrder.requisition_no}</span>
                </div>
              )}
              {purchaseOrder.reference_no && (
                <div>
                  <span className="font-medium text-gray-700">Reference No:</span>
                  <span className="ml-2 text-gray-600">{purchaseOrder.reference_no}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Items Table */}
        <div className="p-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Details</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-300">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">#</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Product</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">HSN</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Pack</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Qty</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Free</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Rate</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">MRP</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">Disc%</th>
                  <th className="text-center py-3 px-2 text-sm font-semibold text-gray-700">GST%</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrder.items.map((item, index) => {
                  const quantity = parseFloat(item.quantity) || 0;
                  const rate = parseFloat(item.purchase_price) || 0;
                  const discountPercent = parseFloat(item.discount_percent) || 0;
                  const itemTotal = quantity * rate;
                  const discountAmount = (itemTotal * discountPercent) / 100;
                  const taxableAmount = itemTotal - discountAmount;
                  const taxAmount = (taxableAmount * (parseFloat(item.tax_percent) || 0)) / 100;
                  const totalAmount = taxableAmount + taxAmount;

                  return (
                    <tr key={item.id} className="border-b border-gray-200">
                      <td className="py-3 px-2 text-sm">{index + 1}</td>
                      <td className="py-3 px-2 text-sm font-medium">{item.product_name}</td>
                      <td className="py-3 px-2 text-sm">{item.hsn_code || '-'}</td>
                      <td className="py-3 px-2 text-sm">{item.pack_size || '-'}</td>
                      <td className="py-3 px-2 text-sm text-center">{quantity}</td>
                      <td className="py-3 px-2 text-sm text-center">{item.free_quantity || 0}</td>
                      <td className="py-3 px-2 text-sm text-right">{formatCurrency(rate)}</td>
                      <td className="py-3 px-2 text-sm text-right">{formatCurrency(item.mrp)}</td>
                      <td className="py-3 px-2 text-sm text-center">{discountPercent}%</td>
                      <td className="py-3 px-2 text-sm text-center">{item.tax_percent}%</td>
                      <td className="py-3 px-2 text-sm text-right font-medium">{formatCurrency(totalAmount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* GST Breakup */}
          <div className="mt-6 grid grid-cols-2 gap-8">
            {/* GST Details */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">GST Breakup</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2">GST%</th>
                    <th className="text-right py-2">Taxable</th>
                    <th className="text-right py-2">CGST</th>
                    <th className="text-right py-2">SGST</th>
                    <th className="text-right py-2">Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(gstBreakup).map(([rate, values]) => (
                    <tr key={rate} className="border-b border-gray-100">
                      <td className="py-2">{rate}%</td>
                      <td className="text-right py-2">{formatCurrency(values.taxableAmount)}</td>
                      <td className="text-right py-2">{formatCurrency(values.cgst)}</td>
                      <td className="text-right py-2">{formatCurrency(values.sgst)}</td>
                      <td className="text-right py-2 font-medium">{formatCurrency(values.totalTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between py-2 border-b border-gray-200">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-medium">{formatCurrency(purchaseOrder.subtotal_amount)}</span>
                </div>
                {purchaseOrder.discount_amount > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Discount</span>
                    <span className="font-medium text-red-600">- {formatCurrency(purchaseOrder.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">Tax Amount</span>
                  <span className="font-medium">{formatCurrency(purchaseOrder.tax_amount)}</span>
                </div>
                {purchaseOrder.freight_charges > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Freight Charges</span>
                    <span className="font-medium">{formatCurrency(purchaseOrder.freight_charges)}</span>
                  </div>
                )}
                {purchaseOrder.insurance_charges > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Insurance Charges</span>
                    <span className="font-medium">{formatCurrency(purchaseOrder.insurance_charges)}</span>
                  </div>
                )}
                {purchaseOrder.other_charges > 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Other Charges</span>
                    <span className="font-medium">{formatCurrency(purchaseOrder.other_charges)}</span>
                  </div>
                )}
                {purchaseOrder.round_off !== 0 && (
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Round Off</span>
                    <span className="font-medium">{formatCurrency(purchaseOrder.round_off)}</span>
                  </div>
                )}
                <div className="flex justify-between py-3 border-t-2 border-gray-300">
                  <span className="font-semibold text-lg">Total Amount</span>
                  <span className="font-bold text-lg text-blue-600">{formatCurrency(purchaseOrder.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Pharmaceutical Requirements */}
        <div className="px-8 pb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <Shield className="w-3 h-3 mr-1" />
            Pharmaceutical Requirements
          </h4>
          <div className="grid grid-cols-3 gap-4 text-xs text-gray-600">
            <div><span className="font-medium">Temperature:</span> {purchaseOrder.temperature_conditions}</div>
            <div><span className="font-medium">Quality Standards:</span> {purchaseOrder.quality_standards}</div>
            <div><span className="font-medium">Return Policy:</span> {purchaseOrder.return_policy}</div>
          </div>
        </div>

        {/* Terms & Conditions */}
        {purchaseOrder.terms_conditions && (
          <div className="px-8 py-4 border-t border-gray-200">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Terms & Conditions</h4>
            <div className="text-xs text-gray-600 whitespace-pre-wrap">{purchaseOrder.terms_conditions}</div>
          </div>
        )}

        {/* Additional Notes */}
        {purchaseOrder.notes && (
          <div className="px-8 pb-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Notes</h4>
            <div className="text-xs text-gray-600">{purchaseOrder.notes}</div>
          </div>
        )}

        {/* Footer */}
        <div className="px-8 py-4 border-t border-gray-200 bg-gray-50 print:bg-white">
          <div className="text-xs text-gray-600 text-center">
            <p className="font-semibold">Computer Generated Purchase Order</p>
            <p className="text-xs">Generated on {new Date().toLocaleString('en-IN')}</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default PurchaseOrderPreview;