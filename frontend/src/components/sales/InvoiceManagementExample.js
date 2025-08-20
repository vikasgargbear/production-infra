import React, { useState, useEffect } from 'react';
import { HistoryTable } from '../global/ui';
import { invoicesApi } from '../../services/api';
import { DollarSign, XCircle } from 'lucide-react';

const InvoiceManagementExample = () => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, []);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const response = await invoicesApi.getAll();
      setInvoices(response.data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordPayment = (invoice) => {
    console.log('Record payment for:', invoice);
    // Implementation here
  };

  const handleCancelInvoice = (invoice) => {
    console.log('Cancel invoice:', invoice);
    // Implementation here
  };

  const handleWhatsApp = (invoice) => {
    console.log('Send WhatsApp for:', invoice);
    // Implementation here
  };

  const getPaymentStatusBadge = (status) => {
    const statusColors = {
      paid: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-blue-100 text-blue-800',
      cancelled: 'bg-red-100 text-red-800'
    };
    
    return (
      <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${statusColors[status] || statusColors.pending}`}>
        {status || 'pending'}
      </span>
    );
  };

  // Column configuration for the table
  const columns = [
    {
      key: 'invoice_number',
      label: 'Invoice #',
      render: (value) => (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{value}</span>
        </div>
      )
    },
    {
      key: 'invoice_date',
      label: 'Date',
      type: 'date'
    },
    {
      key: 'customer_name',
      label: 'Customer',
      render: (value, item) => (
        <div>
          <div className="text-sm text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{item.customer_phone}</div>
        </div>
      )
    },
    {
      key: 'final_amount',
      label: 'Amount',
      type: 'currency',
      render: (value, item) => (
        <div>
          <div className="text-sm font-medium text-gray-900">
            ₹{(value || 0).toFixed(2)}
          </div>
          {item.amount_paid > 0 && item.amount_paid < value && (
            <div className="text-xs text-gray-500">
              Paid: ₹{item.amount_paid.toFixed(2)}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'payment_status',
      label: 'Status',
      render: (value) => getPaymentStatusBadge(value)
    }
  ];

  // Custom actions for each row
  const customActions = [
    {
      key: 'record-payment',
      icon: <DollarSign className="w-4 h-4" />,
      title: 'Record Payment',
      className: 'text-gray-400 hover:text-blue-600 hover:bg-blue-50',
      onClick: handleRecordPayment,
      condition: (item) => item.payment_status !== 'paid' && item.payment_status !== 'cancelled'
    },
    {
      key: 'cancel',
      icon: <XCircle className="w-4 h-4" />,
      title: 'Cancel Invoice',
      className: 'text-gray-400 hover:text-red-600 hover:bg-red-50',
      onClick: handleCancelInvoice,
      condition: (item) => item.payment_status !== 'cancelled'
    }
  ].filter(action => !action.condition || invoices.some(action.condition));

  if (loading) {
    return <div className="p-8 text-center">Loading invoices...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Invoice Management (New)</h2>
        <p className="text-gray-600">Using the new HistoryTable component</p>
      </div>

      <HistoryTable
        title="Invoices"
        data={invoices}
        columns={columns}
        searchPlaceholder="Search invoices..."
        statusOptions={[
          { value: 'all', label: 'Status: All' },
          { value: 'paid', label: 'Paid' },
          { value: 'pending', label: 'Pending' },
          { value: 'partial', label: 'Partial' },
          { value: 'cancelled', label: 'Cancelled' }
        ]}
        searchFields={['invoice_number', 'customer_name', 'customer_phone']}
        statusField="payment_status"
        dateField="invoice_date"
        idField="invoice_id"
        pdfFilename="invoices-export.pdf"
        onWhatsApp={handleWhatsApp}
        customActions={customActions}
        showSummary={true}
        summaryFields={[
          { key: 'final_amount', label: 'Total', type: 'currency' }
        ]}
      />
    </div>
  );
};

export default InvoiceManagementExample;