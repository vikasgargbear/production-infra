import React, { useState } from 'react';
import { FileText, Loader } from 'lucide-react';
import { salesOrdersAPI } from '../../../services/api';

const ConvertToInvoiceButton = ({ orderId, orderNumber, onSuccess, className = '' }) => {
  const [converting, setConverting] = useState(false);

  const handleConvert = async () => {
    if (!orderId) return;
    
    const confirmed = window.confirm(
      `Convert Sales Order ${orderNumber || orderId} to Invoice?\n\nThis will create an invoice and deduct inventory.`
    );
    
    if (!confirmed) return;
    
    setConverting(true);
    try {
      const response = await salesOrdersAPI.convertToInvoice(orderId);
      
      if (response.data) {
        alert(`Invoice ${response.data.invoice_number} created successfully!`);
        if (onSuccess) {
          onSuccess(response.data);
        }
      }
    } catch (error) {
      console.error('Error converting to invoice:', error);
      alert(`Failed to convert to invoice: ${error.response?.data?.detail || error.message}`);
    } finally {
      setConverting(false);
    }
  };

  return (
    <button
      onClick={handleConvert}
      disabled={converting || !orderId}
      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 ${className}`}
    >
      {converting ? (
        <>
          <Loader className="w-4 h-4 animate-spin" />
          Converting...
        </>
      ) : (
        <>
          <FileText className="w-4 h-4" />
          Convert to Invoice
        </>
      )}
    </button>
  );
};

export default ConvertToInvoiceButton;