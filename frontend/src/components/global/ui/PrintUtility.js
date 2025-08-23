import React, { useState, useRef, useEffect } from 'react';
import { Printer, Monitor, FileText } from 'lucide-react';

/**
 * Enterprise Print Utility Component
 * Handles both digital (colorful) and thermal (black & white) printing
 * Supports standard A4 and thermal printer formats (80mm, 58mm)
 */

// Thermal Print Template Component
export const ThermalPrintTemplate = React.forwardRef(({ 
  documentType, 
  documentData, 
  companyInfo,
  width = '80mm' // 80mm or 58mm for thermal printers
}, ref) => {
  const {
    documentNumber,
    date,
    customer,
    items = [],
    totals = {},
    addresses = {},
    notes = ''
  } = documentData;

  return (
    <div ref={ref} className="thermal-print-container" style={{ width }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page {
            size: ${width} auto;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
        
        .thermal-print-container {
          font-family: 'Courier New', monospace;
          font-size: 11px;
          line-height: 1.3;
          padding: 5mm;
          background: white;
          color: black;
        }
        
        .thermal-header {
          text-align: center;
          border-bottom: 1px dashed #000;
          padding-bottom: 3mm;
          margin-bottom: 3mm;
        }
        
        .thermal-company-name {
          font-size: 14px;
          font-weight: bold;
          text-transform: uppercase;
          margin-bottom: 2mm;
        }
        
        .thermal-doc-title {
          font-size: 12px;
          font-weight: bold;
          margin: 2mm 0;
          text-decoration: underline;
        }
        
        .thermal-section {
          margin: 3mm 0;
          padding: 2mm 0;
        }
        
        .thermal-row {
          display: flex;
          justify-content: space-between;
          margin: 1mm 0;
        }
        
        .thermal-label {
          font-weight: bold;
        }
        
        .thermal-divider {
          border-top: 1px dashed #000;
          margin: 3mm 0;
        }
        
        .thermal-table {
          width: 100%;
          margin: 3mm 0;
        }
        
        .thermal-table-header {
          border-top: 1px solid #000;
          border-bottom: 1px solid #000;
          padding: 1mm 0;
          font-weight: bold;
        }
        
        .thermal-table-row {
          padding: 1mm 0;
          border-bottom: 1px dotted #ccc;
        }
        
        .thermal-table-footer {
          border-top: 1px solid #000;
          padding-top: 2mm;
          margin-top: 2mm;
        }
        
        .thermal-total-section {
          margin-top: 3mm;
          padding-top: 2mm;
          border-top: 2px solid #000;
        }
        
        .thermal-total-row {
          display: flex;
          justify-content: space-between;
          margin: 1mm 0;
        }
        
        .thermal-grand-total {
          font-size: 13px;
          font-weight: bold;
          border-top: 1px solid #000;
          border-bottom: 2px solid #000;
          padding: 2mm 0;
          margin: 2mm 0;
        }
        
        .thermal-footer {
          text-align: center;
          margin-top: 5mm;
          padding-top: 3mm;
          border-top: 1px dashed #000;
          font-size: 10px;
        }
        
        .thermal-barcode {
          text-align: center;
          margin: 3mm 0;
          font-family: 'Libre Barcode 39', monospace;
          font-size: 24px;
        }
      ` }} />
      
      {/* Header Section */}
      <div className="thermal-header">
        <div className="thermal-company-name">{companyInfo.name || 'Company Name'}</div>
        {companyInfo.address && <div>{companyInfo.address}</div>}
        {companyInfo.phone && <div>Ph: {companyInfo.phone}</div>}
        {companyInfo.gstin && <div>GSTIN: {companyInfo.gstin}</div>}
      </div>

      {/* Document Title */}
      <div className="thermal-doc-title">
        {documentType.toUpperCase().replace('-', ' ')}
      </div>

      {/* Document Info */}
      <div className="thermal-section">
        <div className="thermal-row">
          <span className="thermal-label">No:</span>
          <span>{documentNumber}</span>
        </div>
        <div className="thermal-row">
          <span className="thermal-label">Date:</span>
          <span>{new Date(date).toLocaleDateString('en-IN')}</span>
        </div>
      </div>

      <div className="thermal-divider"></div>

      {/* Customer Info */}
      <div className="thermal-section">
        <div className="thermal-label">BILL TO:</div>
        <div>{customer?.name || customer?.customer_name}</div>
        {customer?.phone && <div>Ph: {customer.phone}</div>}
        {customer?.gstin && <div>GST: {customer.gstin}</div>}
        {addresses.billing && (
          <div style={{ fontSize: '10px', marginTop: '1mm' }}>
            {addresses.billing}
          </div>
        )}
      </div>

      <div className="thermal-divider"></div>

      {/* Items Table */}
      <div className="thermal-table">
        <div className="thermal-table-header">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ width: '50%' }}>Item</span>
            <span style={{ width: '15%', textAlign: 'center' }}>Qty</span>
            <span style={{ width: '15%', textAlign: 'right' }}>Rate</span>
            <span style={{ width: '20%', textAlign: 'right' }}>Amt</span>
          </div>
        </div>
        
        {items.map((item, index) => (
          <div key={index} className="thermal-table-row">
            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>
              {item.product_name || item.name}
            </div>
            {item.hsn_code && (
              <div style={{ fontSize: '9px', color: '#666' }}>
                HSN: {item.hsn_code}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1mm' }}>
              <span style={{ width: '50%', fontSize: '10px' }}>
                {item.batch_no && `Batch: ${item.batch_no}`}
              </span>
              <span style={{ width: '15%', textAlign: 'center' }}>
                {item.quantity}
                {item.free_quantity > 0 && `+${item.free_quantity}F`}
              </span>
              <span style={{ width: '15%', textAlign: 'right' }}>
                {parseFloat(item.unit_price || 0).toFixed(2)}
              </span>
              <span style={{ width: '20%', textAlign: 'right' }}>
                {parseFloat(item.total || item.line_total || (item.quantity * item.unit_price)).toFixed(2)}
              </span>
            </div>
            {(item.discount_percent > 0 || item.gst_percent > 0) && (
              <div style={{ fontSize: '9px', color: '#666', marginTop: '1mm' }}>
                {item.discount_percent > 0 && `Disc: ${item.discount_percent}% `}
                {item.gst_percent > 0 && `GST: ${item.gst_percent}%`}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Totals Section */}
      <div className="thermal-total-section">
        {totals.subtotal !== undefined && (
          <div className="thermal-total-row">
            <span>Subtotal:</span>
            <span>₹{parseFloat(totals.subtotal || 0).toFixed(2)}</span>
          </div>
        )}
        
        {totals.discount > 0 && (
          <div className="thermal-total-row">
            <span>Discount:</span>
            <span>-₹{parseFloat(totals.discount || 0).toFixed(2)}</span>
          </div>
        )}
        
        {totals.tax_amount !== undefined && totals.tax_amount > 0 && (
          <div className="thermal-total-row">
            <span>GST:</span>
            <span>₹{parseFloat(totals.tax_amount || 0).toFixed(2)}</span>
          </div>
        )}
        
        {totals.cgst_amount > 0 && (
          <div className="thermal-total-row" style={{ fontSize: '10px' }}>
            <span>CGST:</span>
            <span>₹{parseFloat(totals.cgst_amount || 0).toFixed(2)}</span>
          </div>
        )}
        
        {totals.sgst_amount > 0 && (
          <div className="thermal-total-row" style={{ fontSize: '10px' }}>
            <span>SGST:</span>
            <span>₹{parseFloat(totals.sgst_amount || 0).toFixed(2)}</span>
          </div>
        )}
        
        {totals.igst_amount > 0 && (
          <div className="thermal-total-row" style={{ fontSize: '10px' }}>
            <span>IGST:</span>
            <span>₹{parseFloat(totals.igst_amount || 0).toFixed(2)}</span>
          </div>
        )}
        
        <div className="thermal-grand-total">
          <div className="thermal-total-row">
            <span>TOTAL:</span>
            <span>₹{parseFloat(totals.total_amount || totals.final_amount || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment Info */}
      {totals.paid_amount !== undefined && (
        <div className="thermal-section">
          <div className="thermal-total-row">
            <span>Paid:</span>
            <span>₹{parseFloat(totals.paid_amount || 0).toFixed(2)}</span>
          </div>
          <div className="thermal-total-row">
            <span>Balance:</span>
            <span>₹{parseFloat(totals.balance_amount || 0).toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Notes */}
      {notes && (
        <div className="thermal-section">
          <div className="thermal-label">Notes:</div>
          <div style={{ fontSize: '10px' }}>{notes}</div>
        </div>
      )}

      {/* Barcode (if document number exists) */}
      {documentNumber && (
        <div className="thermal-barcode">
          *{documentNumber}*
        </div>
      )}

      {/* Footer */}
      <div className="thermal-footer">
        <div>Thank You!</div>
        <div>Visit Again</div>
        {companyInfo.website && <div>{companyInfo.website}</div>}
      </div>
    </div>
  );
});

ThermalPrintTemplate.displayName = 'ThermalPrintTemplate';

// Main Print Utility Component
const PrintUtility = ({ 
  children, 
  documentData, 
  documentType,
  companyInfo,
  onPrint,
  showPrintOptions = true,
  className = ''
}) => {
  const [printFormat, setPrintFormat] = useState('digital'); // 'digital' or 'thermal'
  const [thermalWidth, setThermalWidth] = useState('80mm'); // '80mm' or '58mm'
  const [showPrintMenu, setShowPrintMenu] = useState(false);
  
  const thermalPrintRef = useRef();

  // Handle thermal print
  useEffect(() => {
    if (printFormat === 'thermal' && thermalPrintRef.current) {
      // Create a new window for thermal print
      const printWindow = window.open('', '', 'width=400,height=600');
      if (printWindow) {
        printWindow.document.write('<html><head><title>Print</title>');
        printWindow.document.write('<style>');
        printWindow.document.write(`
          @page { size: ${thermalWidth} auto; margin: 0; }
          body { margin: 0; padding: 0; }
        `);
        printWindow.document.write('</style></head><body>');
        printWindow.document.write(thermalPrintRef.current.innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
          setPrintFormat('digital');
          if (onPrint) onPrint('thermal', thermalWidth);
        }, 250);
      }
    }
  }, [printFormat, thermalWidth, onPrint]);

  const handlePrintClick = () => {
    if (showPrintOptions) {
      setShowPrintMenu(!showPrintMenu);
    } else {
      // Direct print if no options needed
      window.print();
    }
  };

  const handleDigitalPrint = () => {
    setPrintFormat('digital');
    setShowPrintMenu(false);
    setTimeout(() => {
      window.print();
      if (onPrint) onPrint('digital');
    }, 100);
  };

  const handleThermalPrint = (width) => {
    setThermalWidth(width);
    setPrintFormat('thermal');
    setShowPrintMenu(false);
  };

  return (
    <div className={`print-utility-container ${className}`}>
      {/* Print Button with Options */}
      {showPrintOptions && (
        <div className="relative inline-block">
          <button
            onClick={handlePrintClick}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          
          {/* Print Options Menu */}
          {showPrintMenu && (
            <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 min-w-[200px]">
              <div className="text-xs text-gray-500 uppercase tracking-wider px-3 py-1">
                Print Format
              </div>
              
              <button
                onClick={handleDigitalPrint}
                className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded flex items-center gap-2 text-sm"
              >
                <Monitor className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="font-medium">Digital/Color</div>
                  <div className="text-xs text-gray-500">For screen & sharing</div>
                </div>
              </button>
              
              <div className="border-t border-gray-200 my-2"></div>
              
              <div className="text-xs text-gray-500 uppercase tracking-wider px-3 py-1">
                Thermal Printer
              </div>
              
              <button
                onClick={() => handleThermalPrint('80mm')}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4 text-gray-600" />
                <div>
                  <div className="font-medium">80mm Width</div>
                  <div className="text-xs text-gray-500">Standard thermal</div>
                </div>
              </button>
              
              <button
                onClick={() => handleThermalPrint('58mm')}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded flex items-center gap-2 text-sm"
              >
                <FileText className="w-4 h-4 text-gray-600" />
                <div>
                  <div className="font-medium">58mm Width</div>
                  <div className="text-xs text-gray-500">Compact thermal</div>
                </div>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Hidden Thermal Print Template */}
      <div style={{ display: 'none' }}>
        <div ref={thermalPrintRef}>
          {printFormat === 'thermal' && documentData && (
            <ThermalPrintTemplate
              documentType={documentType}
              documentData={documentData}
              companyInfo={companyInfo}
              width={thermalWidth}
            />
          )}
        </div>
      </div>

      {/* Digital Print Content (children) */}
      {children}
    </div>
  );
};

export default PrintUtility;