import React from 'react';

const ChallanPreview = ({ 
  challan, 
  companyInfo = {} 
}) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="bg-white w-full">
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #challan-preview, #challan-preview * {
            visibility: visible;
          }
          #challan-preview {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          .print-colors {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      
      <div id="challan-preview" className="font-sans p-8 print-colors">
        {/* Header Section - Consistent with Invoice */}
        <div className="mb-8 grid grid-cols-2 gap-4">
          {/* Company Info - Left Side */}
          <div className="flex items-start space-x-3">
            {companyInfo?.logo ? (
              <img 
                src={companyInfo.logo} 
                alt={companyInfo.name || 'Company'} 
                className="w-14 h-14 object-contain"
              />
            ) : (
              <div className="w-14 h-14 bg-orange-100 rounded flex items-center justify-center print-colors">
                <span className="text-xl font-bold text-orange-600">A</span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 uppercase">{companyInfo?.name || 'AASO PHARMACEUTICALS'}</h2>
              <p className="text-sm text-gray-600">{companyInfo?.address || 'Gangapur City, Rajasthan'}</p>
              <p className="text-sm text-gray-600">GSTIN: {companyInfo?.gstin || '08AAXCA4042N1Z2'}</p>
              {companyInfo?.drugLicense && <p className="text-sm text-gray-600">{companyInfo.drugLicense}</p>}
            </div>
          </div>

          {/* Challan Details - Right Side */}
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900 uppercase">DELIVERY CHALLAN</h1>
            <p className="text-sm text-gray-600 mt-1">No: {challan.challan_number}</p>
            <p className="text-sm text-gray-600">Date: {formatDate(challan.challan_date)}</p>
            {challan.expected_delivery_date && (
              <p className="text-sm text-gray-600">Expected Delivery: {formatDate(challan.expected_delivery_date)}</p>
            )}
            <p className="text-sm text-gray-600">Place of Supply: {challan.delivery_state || challan.customer_details?.state || 'Maharashtra'}</p>
          </div>
        </div>


        {/* Party & Transport Details Section - 3 columns */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Bill To Box */}
          <div className="border border-gray-300 rounded-lg p-4 bg-blue-50 print-colors">
            <h3 className="text-xs font-bold text-blue-700 uppercase mb-3 border-b border-blue-200 pb-1">Bill To</h3>
            <div className="space-y-1">
              <p className="font-semibold text-gray-900 text-sm">{challan.customer_name || 'N/A'}</p>
              {challan.customer_details ? (
                <>
                  <p className="text-gray-700 text-xs">{challan.customer_details.address || challan.billing_address || ''}</p>
                  <p className="text-gray-700 text-xs">
                    {[
                      challan.customer_details.city || '',
                      challan.customer_details.state || '',
                      challan.customer_details.pincode || ''
                    ].filter(Boolean).join(', ')}
                  </p>
                  {challan.customer_details.gstin && (
                    <p className="text-xs font-medium text-gray-800">GSTIN: {challan.customer_details.gstin}</p>
                  )}
                  {challan.customer_details.phone && (
                    <p className="text-gray-700 text-xs">Phone: {challan.customer_details.phone}</p>
                  )}
                </>
              ) : challan.billing_address ? (
                <p className="text-gray-700 text-xs">{challan.billing_address}</p>
              ) : null}
            </div>
          </div>

          {/* Ship To Box */}
          <div className="border border-gray-300 rounded-lg p-4 bg-green-50 print-colors">
            <h3 className="text-xs font-bold text-green-700 uppercase mb-3 border-b border-green-200 pb-1">Ship To</h3>
            <div className="space-y-1">
              {(challan.delivery_address && challan.delivery_address.trim()) ? (
                <>
                  <p className="font-semibold text-gray-900 text-sm">{challan.delivery_contact_person || challan.customer_name || 'N/A'}</p>
                  <p className="text-gray-700 text-xs">{challan.delivery_address}</p>
                  <p className="text-gray-700 text-xs">{[challan.delivery_city, challan.delivery_state, challan.delivery_pincode].filter(Boolean).join(', ')}</p>
                  {challan.delivery_gstin && (
                    <p className="text-xs font-medium text-gray-800">GSTIN: {challan.delivery_gstin}</p>
                  )}
                  {challan.delivery_contact_phone && (
                    <p className="text-gray-700 text-xs">Phone: {challan.delivery_contact_phone}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-gray-900 text-sm">{challan.customer_name || 'N/A'}</p>
                  {challan.customer_details?.address && <p className="text-gray-700 text-xs">{challan.customer_details.address}</p>}
                  {(challan.customer_details?.city || challan.customer_details?.state || challan.customer_details?.pincode) && (
                    <p className="text-gray-700 text-xs">{[challan.customer_details?.city, challan.customer_details?.state, challan.customer_details?.pincode].filter(Boolean).join(', ')}</p>
                  )}
                  {challan.customer_details?.gstin && (
                    <p className="text-xs font-medium text-gray-800">GSTIN: {challan.customer_details.gstin}</p>
                  )}
                  {challan.customer_details?.phone && (
                    <p className="text-gray-700 text-xs">Phone: {challan.customer_details.phone}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Transport Details Box */}
          <div className="border border-gray-300 rounded-lg p-4 bg-yellow-50 print-colors">
            <h3 className="text-xs font-bold text-yellow-700 uppercase mb-3 border-b border-yellow-200 pb-1">Transport Details</h3>
            <div className="space-y-1">
              {challan.transport_company && (
                <div className="text-xs">
                  <span className="font-medium text-gray-700">Company:</span>
                  <p className="text-gray-900">{challan.transport_company}</p>
                </div>
              )}
              {challan.vehicle_number && (
                <div className="text-xs">
                  <span className="font-medium text-gray-700">Vehicle No:</span>
                  <p className="text-gray-900 font-medium">{challan.vehicle_number}</p>
                </div>
              )}
              {challan.lr_number && (
                <div className="text-xs">
                  <span className="font-medium text-gray-700">LR No:</span>
                  <p className="text-gray-900">{challan.lr_number}</p>
                </div>
              )}
              {challan.driver_phone && (
                <div className="text-xs">
                  <span className="font-medium text-gray-700">Driver Phone:</span>
                  <p className="text-gray-900">{challan.driver_phone}</p>
                </div>
              )}
              {challan.freight_charges > 0 && (
                <div className="text-xs mt-2 pt-2 border-t border-yellow-200">
                  <span className="font-medium text-gray-700">Freight Charges:</span>
                  <p className="text-gray-900 font-bold">{formatCurrency(challan.freight_charges)}</p>
                </div>
              )}
              {!challan.transport_company && !challan.vehicle_number && !challan.driver_phone && !challan.freight_charges && (
                <p className="text-xs text-gray-400 italic">No transport details provided</p>
              )}
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-6">
          <table className="w-full border border-gray-300">
            <thead className="bg-gray-100 print-colors">
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">#</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">Description</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">HSN</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">Qty</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">Unit</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">MRP</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">Rate</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase border-r border-gray-200">GST%</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {challan.items.map((item, index) => {
                const price = item.unit_price || item.rate || item.sale_price || 0;
                const taxableAmount = (parseFloat(item.quantity) || 0) * price;
                const gstPercent = item.gst_percent || item.tax_percent || 0;
                const gstAmount = (taxableAmount * gstPercent) / 100;
                const totalAmount = taxableAmount + gstAmount;
                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-2 px-3 text-sm border-r border-gray-200">{index + 1}</td>
                    <td className="py-2 px-3 text-sm border-r border-gray-200">{item.product_name}</td>
                    <td className="py-2 px-3 text-sm text-center border-r border-gray-200">{item.hsn_code || '-'}</td>
                    <td className="py-2 px-3 text-sm text-center border-r border-gray-200">{item.quantity}</td>
                    <td className="py-2 px-3 text-sm text-center border-r border-gray-200">{item.unit || item.base_uom || 'Unit'}</td>
                    <td className="py-2 px-3 text-sm text-right border-r border-gray-200">{formatCurrency(item.mrp || 0)}</td>
                    <td className="py-2 px-3 text-sm text-right border-r border-gray-200">{formatCurrency(price)}</td>
                    <td className="py-2 px-3 text-sm text-center border-r border-gray-200">{gstPercent}%</td>
                    <td className="py-2 px-3 text-sm text-right font-medium">{formatCurrency(totalAmount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Total Summary Section - Optimized Layout */}
        <div className="grid grid-cols-2 gap-6 mb-3">
          {/* Left Side: Notes + Company Authorization */}
          <div className="space-y-3">
            {/* Notes Box if exists */}
            {challan.notes && (
              <div className="border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 mb-1">Notes:</p>
                <p className="text-xs text-gray-600">{challan.notes}</p>
              </div>
            )}
            
            {/* Digital Authorization - Compact */}
            <div className="border border-gray-200 rounded p-2">
              <p className="text-xs text-gray-600">For {companyInfo?.name || 'Your Company'}</p>
              <p className="text-xs text-gray-400 mt-1">Digitally Authorized</p>
              <p className="text-xs text-gray-400">ERP System Generated</p>
            </div>
          </div>

          {/* Right Side: Summary Box */}
          <div className="flex justify-end">
            <div className="border border-gray-300 rounded-lg overflow-hidden w-80">
            <div className="bg-gray-100 px-3 py-1">
              <h3 className="text-xs font-bold text-gray-800 uppercase">Summary</h3>
            </div>
            <div className="p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Taxable Amount:</span>
                <span className="font-medium">
                  {formatCurrency(
                    challan.items.reduce((sum, item) => {
                      const price = item.unit_price || item.rate || item.sale_price || 0;
                      return sum + ((parseFloat(item.quantity) || 0) * price);
                    }, 0)
                  )}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Total GST:</span>
                <span className="font-medium">
                  {formatCurrency(
                    challan.items.reduce((sum, item) => {
                      const price = item.unit_price || item.rate || item.sale_price || 0;
                      const taxableAmount = (parseFloat(item.quantity) || 0) * price;
                      const gstPercent = item.gst_percent || item.tax_percent || 0;
                      return sum + ((taxableAmount * gstPercent) / 100);
                    }, 0)
                  )}
                </span>
              </div>
              {challan.freight_charges > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Freight Charges:</span>
                  <span className="font-medium">{formatCurrency(challan.freight_charges)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t border-gray-300">
                <span className="text-sm font-bold text-gray-900">Grand Total:</span>
                <span className="text-sm font-bold text-blue-600">
                  {formatCurrency(
                    challan.items.reduce((sum, item) => {
                      const price = item.unit_price || item.rate || item.sale_price || 0;
                      const taxableAmount = (parseFloat(item.quantity) || 0) * price;
                      const gstPercent = item.gst_percent || item.tax_percent || 0;
                      const gstAmount = (taxableAmount * gstPercent) / 100;
                      return sum + taxableAmount + gstAmount;
                    }, 0) + (parseFloat(challan.freight_charges) || 0)
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
        </div>

        {/* Digital Footer - No physical signatures needed */}
        <div className="text-center mt-4 pt-3 border-t-2 border-gray-200">
          <p className="text-sm font-medium text-gray-700 mb-1">This is a computer generated delivery challan</p>
          <p className="text-xs text-gray-500">Digital document - No signature required</p>
        </div>
      </div>
    </div>
  );
};

export default ChallanPreview;