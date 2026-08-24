import React from 'react';
import { FileText } from 'lucide-react';

interface ConvertToInvoiceButtonProps {
  orderId: number | string;
  orderNumber?: string;
  className?: string;
}

const ConvertToInvoiceButton: React.FC<ConvertToInvoiceButtonProps> = ({
  orderId,
  orderNumber,
  className = ''
}) => {
  return (
    <span
      className="inline-flex"
      title={`Open Create Invoice and import dispatched order ${orderNumber || orderId}. Direct order conversion is unavailable because it bypasses canonical batch and dispatch review.`}
    >
      <button
        type="button"
        disabled
        aria-label={`Create invoice for sales order ${orderNumber || orderId} from the canonical invoice workflow`}
        className={`flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md border border-gray-300 bg-gray-100 px-4 py-2 text-gray-500 ${className}`}
      >
        <FileText className="h-4 w-4" />
        Use Create Invoice
      </button>
    </span>
  );
};

export default ConvertToInvoiceButton;
