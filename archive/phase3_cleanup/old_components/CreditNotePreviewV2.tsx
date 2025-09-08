import React from 'react';
import { FileText, Calendar, User, Building2, Phone, Mail } from 'lucide-react';
import {
  Card,
  CardSection,
  DataTable,
  StatusBadge,
  SummaryCard,
  Badge
} from '../global';
import { theme, classes } from '../../config/theme.config';

interface CreditNotePreviewProps {
  returnData: any;
  customer: any;
  invoice: any;
  includeGst?: boolean;
  customerDues?: number;
}

interface ReturnReason {
  value: string;
  label: string;
}

const CreditNotePreview: React.FC<CreditNotePreviewProps> = ({ 
  returnData, 
  customer, 
  invoice, 
  includeGst = true, 
  customerDues = 0 
}) => {
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount: number | string) => {
    return `₹${(parseFloat(amount.toString()) || 0).toFixed(2)}`;
  };

  // Get only selected items with return quantity
  const returnItems = returnData.items.filter((item: any) => 
    item.selected && item.return_quantity > 0
  );

  // Calculate GST breakup using the same logic
  const calculateGSTBreakup = () => {
    const gstBreakup: Record<string, any> = {};
    
    if (customer.gst_number && !includeGst) return gstBreakup;
    
    returnItems.forEach((item: any) => {
      const returnAmount = item.return_quantity * item.rate;
      const taxAmount = (returnAmount * item.tax_percent) / 100;
      
      if (!gstBreakup[item.tax_percent]) {
        gstBreakup[item.tax_percent] = {
          taxableAmount: 0,
          cgst: 0,
          sgst: 0,
          totalTax: 0
        };
      }
      
      gstBreakup[item.tax_percent].taxableAmount += returnAmount;
      gstBreakup[item.tax_percent].cgst += taxAmount / 2;
      gstBreakup[item.tax_percent].sgst += taxAmount / 2;
      gstBreakup[item.tax_percent].totalTax += taxAmount;
    });
    
    return gstBreakup;
  };

  const gstBreakup = calculateGSTBreakup();

  // Prepare table data
  const tableColumns = [
    { key: 'index', header: '#', width: '60px' },
    { key: 'product_name', header: 'Product', width: 'auto' },
    { key: 'hsn_code', header: 'HSN', width: '100px' },
    { key: 'batch_number', header: 'Batch', width: '120px' },
    { key: 'expiry_date', header: 'Expiry', width: '100px' },
    { key: 'return_quantity', header: 'Qty', width: '80px', align: 'center' as const },
    { key: 'rate', header: 'Rate', width: '100px', align: 'right' as const },
    ...(customer.gst_number ? [{ key: 'tax_percent', header: 'GST%', width: '80px', align: 'center' as const }] : []),
    { key: 'total_amount', header: 'Amount', width: '120px', align: 'right' as const }
  ];

  const tableData = returnItems.map((item: any, index: number) => {
    const returnAmount = item.return_quantity * item.rate;
    const taxAmount = (!customer.gst_number || includeGst) ? (returnAmount * item.tax_percent) / 100 : 0;
    const totalAmount = returnAmount + taxAmount;

    return {
      id: item.id || index, // Add unique key
      index: index + 1,
      product_name: item.product_name,
      hsn_code: item.hsn_code || '-',
      batch_number: item.batch_number || '-',
      expiry_date: item.expiry_date ? formatDate(item.expiry_date) : '-',
      return_quantity: item.return_quantity,
      rate: formatCurrency(item.rate),
      ...(customer.gst_number && { tax_percent: `${item.tax_percent}%` }),
      total_amount: formatCurrency(totalAmount)
    };
  });

  // Summary items for SummaryCard
  const summaryItems = [
    ...(customer.gst_number ? [
      { label: 'Subtotal', value: returnData.subtotal_amount, isBold: false },
      ...(includeGst ? [{ label: 'Tax Amount (GST)', value: returnData.tax_amount, isBold: false }] : [])
    ] : []),
    { 
      label: `Total Return Amount${!customer.gst_number ? ' (incl. all taxes)' : ''}`, 
      value: returnData.total_amount, 
      isTotal: true,
      color: theme.colors.danger.DEFAULT
    }
  ];

  const RETURN_REASONS: ReturnReason[] = [
    { value: 'EXPIRED', label: 'Expired Product' },
    { value: 'DAMAGED', label: 'Damaged Product' },
    { value: 'WRONG_PRODUCT', label: 'Wrong Product Delivered' },
    { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
    { value: 'NOT_REQUIRED', label: 'Not Required' },
    { value: 'EXCESS_STOCK', label: 'Excess Stock' },
    { value: 'RATE_DIFFERENCE', label: 'Rate Difference' },
    { value: 'OTHER', label: 'Other' }
  ];

  return (
    <>
      {/* Print styles - keeping minimal print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { margin: 0.5in; size: A4; }
        }
      `}</style>

      <div className="bg-white rounded-lg shadow-lg print:shadow-none print-section">
        {/* Header */}
        <Card className="print:shadow-none">
          <CardSection className="border-b border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                {/* Company Details */}
                <div className="mb-6">
                  <h2 className={`${classes.pageTitle} mb-2`}>
                    {localStorage.getItem('company_name') || 'AASO Pharmaceuticals'}
                  </h2>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p>{localStorage.getItem('company_address') || '123 Business Street, City'}</p>
                    <p>GSTIN: {localStorage.getItem('company_gstin') || '24XXXXX1234Z5'}</p>
                    <p>DL No: {localStorage.getItem('company_drug_license') || '20B/21B-XXX'}</p>
                    <p>Phone: {localStorage.getItem('company_phone') || '+91 99999 99999'}</p>
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <h1 className="text-3xl font-bold text-red-600 mb-2">
                  {customer.gst_number ? 'GST CREDIT NOTE' : 'RETURN NOTE'}
                </h1>
                {customer.gst_number && (
                  <Badge variant="success" className="mb-2" onRemove={() => {}}>
                    GST Registered Customer
                  </Badge>
                )}
                <div className="space-y-1">
                  <p className="text-lg font-semibold text-gray-700">
                    {customer.gst_number ? 'CN' : 'RN'} No: {returnData.credit_note_no || returnData.return_no}
                  </p>
                  <p className="text-gray-600">Date: {formatDate(returnData.return_date)}</p>
                  <p className="text-gray-600">Original Invoice: {invoice.invoice_no}</p>
                  <p className="text-gray-600">Invoice Date: {formatDate(invoice.invoice_date)}</p>
                </div>
              </div>
            </div>
          </CardSection>

          {/* Customer Details */}
          <CardSection className="bg-gray-50">
            <div className="grid grid-cols-2 gap-x-8">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                  <User className="w-4 h-4 mr-1" />
                  Customer Details
                </h3>
                <div>
                  <p className="font-semibold text-gray-900">{customer.customer_name || customer.name}</p>
                  <p className="text-sm text-gray-600">{customer.address}</p>
                  {customer.gst_number && (
                    <p className="text-sm text-gray-600 mt-1">GSTIN: {customer.gst_number}</p>
                  )}
                  {customer.drug_license_number && (
                    <p className="text-sm text-gray-600">DL No: {customer.drug_license_number}</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Contact Details</h3>
                <div className="text-sm text-gray-600 space-y-1">
                  {customer.phone && (
                    <p><Phone className="w-3 h-3 inline mr-1" /> {customer.phone}</p>
                  )}
                  {customer.email && (
                    <p><Mail className="w-3 h-3 inline mr-1" /> {customer.email}</p>
                  )}
                </div>
              </div>
            </div>
          </CardSection>

          {/* Return Reason */}
          <CardSection className="bg-amber-50 border-b border-amber-200">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-900">Return Reason</h4>
                <p className="text-sm text-amber-700 mt-1">
                  {RETURN_REASONS.find(r => r.value === returnData.return_reason)?.label || returnData.return_reason}
                </p>
                {returnData.return_reason_notes && (
                  <p className="text-sm text-amber-600 mt-2">{returnData.return_reason_notes}</p>
                )}
              </div>
            </div>
          </CardSection>

          {/* Items Table */}
          <CardSection title="Returned Items">
            <DataTable
              columns={tableColumns}
              data={tableData}
              keyField="id"
              className="print-table"
            />
          </CardSection>

          {/* GST Breakup and Summary */}
          <CardSection>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* GST Details - Only for GST customers */}
              <div>
                {customer.gst_number ? (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">GST Details</h4>
                    {includeGst ? (
                      <DataTable
                        columns={[
                          { key: 'rate', header: 'GST%', width: '80px' },
                          { key: 'taxableAmount', header: 'Taxable', width: 'auto', align: 'right' as const },
                          { key: 'cgst', header: 'CGST', width: 'auto', align: 'right' as const },
                          { key: 'sgst', header: 'SGST', width: 'auto', align: 'right' as const },
                          { key: 'totalTax', header: 'Total Tax', width: 'auto', align: 'right' as const }
                        ]}
                        data={Object.entries(gstBreakup).map(([rate, values]: [string, any], index: number) => ({
                          id: index,
                          rate: `${rate}%`,
                          taxableAmount: formatCurrency(values.taxableAmount),
                          cgst: formatCurrency(values.cgst),
                          sgst: formatCurrency(values.sgst),
                          totalTax: formatCurrency(values.totalTax)
                        }))}
                        keyField="id"
                        className="text-sm"
                      />
                    ) : (
                      <Card className="bg-gray-50 p-4">
                        <p className="text-sm text-gray-600">
                          GST excluded at customer's request
                        </p>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3">Return Information</h4>
                    <Card className="bg-blue-50 border-blue-200 p-4">
                      <p className="text-sm text-blue-800">
                        This return note is for the total amount paid including all taxes.
                      </p>
                    </Card>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div>
                <SummaryCard
                  title="Summary"
                  items={summaryItems}
                  variant="detailed"
                  footerContent={
                    customerDues > 0 && returnData.credit_adjustment_type && (
                      <Card className="bg-blue-50 border-blue-200 p-3">
                        <p className="text-sm text-blue-800">
                          <strong>Credit Adjustment:</strong> 
                          {returnData.credit_adjustment_type === 'existing_dues' ? (
                            <> This amount will be adjusted against existing dues of ₹{customerDues.toFixed(2)}</>
                          ) : (
                            <> This amount will be kept as credit for future invoices</>
                          )}
                        </p>
                      </Card>
                    )
                  }
                />
              </div>
            </div>
          </CardSection>

          {/* Footer */}
          <CardSection className="bg-gray-50 print:bg-white border-t border-gray-200">
            <div className="text-sm text-gray-600 text-center">
              <p className="font-semibold mb-1">
                Computer Generated {customer.gst_number ? 'Credit Note' : 'Return Note'}
              </p>
              <p>Generated on {new Date().toLocaleString('en-IN')}</p>
            </div>
          </CardSection>
        </Card>
      </div>
    </>
  );
};

export default CreditNotePreview;