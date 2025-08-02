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
    <div className="bg-white p-8 max-w-4xl mx-auto">
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
            margin: 10mm;
          }
        }
      `}</style>
      
      <div id="challan-preview" className="font-sans">
        {/* Header - Company Info and Challan Details in parallel */}
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
              <div className="w-14 h-14 bg-orange-100 rounded flex items-center justify-center">
                <span className="text-xl font-bold text-orange-600">A</span>
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900 uppercase">{companyInfo?.name || 'AASO PHARMACEUTICALS'}</h2>
              <p className="text-sm text-gray-600">{companyInfo?.address || 'Gangapur City, Rajasthan'}</p>
              <p className="text-sm text-gray-600">GSTIN: {companyInfo?.gstin || '08AAXCA4042N1Z2'}</p>
            </div>
          </div>

          {/* Challan Details - Right Side */}
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900 uppercase">DELIVERY CHALLAN</h1>
            <p className="text-sm text-gray-600 mt-1">No: {challan.challan_number}</p>
            <p className="text-sm text-gray-600">Date: {formatDate(challan.challan_date)}</p>
          </div>
        </div>

        {/* Transport Details - Only show if any transport info exists */}
        {(challan.transport_company || challan.vehicle_number || challan.driver_phone || challan.freight_amount > 0) && (
          <div className="mb-6 p-3 bg-gray-50 rounded">
            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Transport Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {challan.transport_company && (
                <div>
                  <span className="text-gray-600">Transport: </span>
                  <span className="text-gray-900">{challan.transport_company}</span>
                </div>
              )}
              {challan.vehicle_number && (
                <div>
                  <span className="text-gray-600">Vehicle: </span>
                  <span className="text-gray-900">{challan.vehicle_number}</span>
                </div>
              )}
              {challan.driver_phone && (
                <div>
                  <span className="text-gray-600">Driver Phone: </span>
                  <span className="text-gray-900">{challan.driver_phone}</span>
                </div>
              )}
              {challan.freight_amount > 0 && (
                <div>
                  <span className="text-gray-600">Freight Charges: </span>
                  <span className="text-gray-900">{formatCurrency(challan.freight_amount)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bill To & Ship To */}
        <div className="mb-8 grid grid-cols-2 gap-8">
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Bill To:</h3>
            <h4 className="font-semibold text-gray-900">{challan.customer_name}</h4>
            {challan.customer_details && (
              <>
                <p className="text-gray-600">{challan.customer_details.address}</p>
                <p className="text-gray-600">{challan.customer_details.city}, {challan.customer_details.state}</p>
                <p className="text-gray-600">Phone: {challan.customer_details.phone}</p>
              </>
            )}
          </div>
          <div>
            <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">Ship To:</h3>
            {challan.delivery_address ? (
              <div className="text-gray-600">
                <p className="font-medium">{challan.delivery_contact_person || challan.customer_name}</p>
                <p>{challan.delivery_address}</p>
                <p>{challan.delivery_city}, {challan.delivery_state} {challan.delivery_pincode}</p>
                {challan.delivery_contact_phone && <p>Phone: {challan.delivery_contact_phone}</p>}
              </div>
            ) : (
              <div className="text-gray-600">
                <p className="font-medium">{challan.customer_name}</p>
                <p>{challan.customer_details?.address}</p>
                <p>{challan.customer_details?.city}, {challan.customer_details?.state} {challan.customer_details?.pincode}</p>
                {challan.customer_details?.phone && <p>Phone: {challan.customer_details?.phone}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase">#</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-gray-700 uppercase">Product</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase">Qty</th>
                <th className="text-center py-2 px-3 text-xs font-medium text-gray-700 uppercase">Unit</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">MRP</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">Price</th>
                <th className="text-right py-2 px-3 text-xs font-medium text-gray-700 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody>
              {challan.items.map((item, index) => {
                const price = item.unit_price || item.rate || item.sale_price || 0;
                const amount = (parseFloat(item.quantity) || 0) * price;
                return (
                  <tr key={index} className="border-b border-gray-200">
                    <td className="py-3 px-3 text-sm">{index + 1}</td>
                    <td className="py-3 px-3 text-sm">{item.product_name}</td>
                    <td className="py-3 px-3 text-sm text-center">{item.quantity}</td>
                    <td className="py-3 px-3 text-sm text-center">{item.unit || 'NOS'}</td>
                    <td className="py-3 px-3 text-sm text-right">{formatCurrency(item.mrp || 0)}</td>
                    <td className="py-3 px-3 text-sm text-right">{formatCurrency(price)}</td>
                    <td className="py-3 px-3 text-sm text-right font-medium">{formatCurrency(amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="text-sm text-gray-500">
          This is a computer generated delivery challan.
        </div>
      </div>
    </div>
  );
};

export default ChallanPreview;