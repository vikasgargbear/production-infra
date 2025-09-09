import React, { useState } from 'react';
import { 
  Share2, Printer, Download, Mail, MessageCircle, 
  Copy, Send, CheckCircle, X, Smartphone, FileText,
  Package, ShoppingCart, CreditCard, RotateCcw, Truck
} from 'lucide-react';

/**
 * Universal Document Sharing Component
 * Provides WhatsApp, Email, SMS, Print, and Download capabilities
 * for all document types across the system
 */
const ShareDocument = ({
  isOpen = false,
  onClose,
  documentType, // 'invoice', 'challan', 'order', 'purchase', 'purchaseOrder', 'return', 'payment'
  documentData, // Contains all document details
  partyDetails, // Customer or Supplier details
  companyInfo = {},
  onPrint,
  onDownload,
  className = ''
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailData, setEmailData] = useState({
    to: partyDetails?.email || '',
    cc: '',
    subject: '',
    message: ''
  });

  // Get document icon based on type
  const getDocumentIcon = () => {
    const icons = {
      invoice: FileText,
      challan: Truck,
      order: ShoppingCart,
      purchase: Package,
      purchaseOrder: Package,
      return: RotateCcw,
      payment: CreditCard
    };
    return icons[documentType] || FileText;
  };

  // Get document title
  const getDocumentTitle = () => {
    const titles = {
      invoice: 'Sales Invoice',
      challan: 'Delivery Challan',
      order: 'Sales Order',
      purchase: 'Purchase Entry',
      purchaseOrder: 'Purchase Order',
      return: documentData.returnType === 'sales' ? 'Sales Return' : 'Purchase Return',
      payment: 'Payment Receipt'
    };
    return titles[documentType] || 'Document';
  };

  // Generate WhatsApp message based on document type
  const generateWhatsAppMessage = () => {
    const docTitle = getDocumentTitle();
    const docNumber = documentData.documentNumber || documentData.invoice_number || 
                     documentData.challan_number || documentData.order_number || 
                     documentData.purchase_number || documentData.return_number || 'N/A';
    const amount = documentData.totalAmount || documentData.total_amount || 
                  documentData.final_amount || 0;
    const date = documentData.date || documentData.invoice_date || 
                documentData.order_date || new Date().toLocaleDateString('en-IN');
    
    let message = `Dear ${partyDetails?.name || partyDetails?.customer_name || partyDetails?.supplier_name || 'Sir/Madam'},\n\n`;
    
    switch(documentType) {
      case 'invoice':
        message += `Your ${docTitle} ${docNumber} dated ${date} for ₹${amount.toFixed(2)} has been generated.\n\n`;
        message += `Items: ${documentData.itemCount || documentData.items?.length || 0}\n`;
        message += `Payment Status: ${documentData.paymentStatus || 'Pending'}\n\n`;
        message += `Thank you for your business!`;
        break;
        
      case 'challan':
        message += `Your Delivery Challan ${docNumber} dated ${date} has been prepared.\n\n`;
        message += `Items: ${documentData.itemCount || documentData.items?.length || 0}\n`;
        message += `Expected Delivery: ${documentData.deliveryDate || date}\n`;
        if (documentData.transportDetails) {
          message += `Transport: ${documentData.transportDetails}\n`;
        }
        message += `\nYour order is ready for dispatch.`;
        break;
        
      case 'order':
        message += `Your Sales Order ${docNumber} dated ${date} for ₹${amount.toFixed(2)} has been confirmed.\n\n`;
        message += `Items: ${documentData.itemCount || documentData.items?.length || 0}\n`;
        message += `Expected Delivery: ${documentData.expectedDelivery || 'Within 2-3 days'}\n\n`;
        message += `We will process your order shortly.`;
        break;
        
      case 'purchaseOrder':
        message += `Purchase Order ${docNumber} dated ${date} for ₹${amount.toFixed(2)}.\n\n`;
        message += `Items: ${documentData.itemCount || documentData.items?.length || 0}\n`;
        message += `Delivery Required By: ${documentData.deliveryDate || 'ASAP'}\n\n`;
        message += `Please confirm receipt and delivery schedule.`;
        break;
        
      case 'purchase':
        message += `Purchase Entry ${docNumber} dated ${date} for ₹${amount.toFixed(2)} has been recorded.\n\n`;
        message += `Your Invoice: ${documentData.supplierInvoiceNumber || 'N/A'}\n`;
        message += `Payment Status: ${documentData.paymentStatus || 'Pending'}\n\n`;
        message += `Thank you for your supply.`;
        break;
        
      case 'return':
        const returnType = documentData.returnType === 'sales' ? 'Sales' : 'Purchase';
        message += `${returnType} Return ${docNumber} dated ${date} for ₹${amount.toFixed(2)} has been processed.\n\n`;
        message += `Items Returned: ${documentData.itemCount || documentData.items?.length || 0}\n`;
        message += `Reason: ${documentData.reason || 'As discussed'}\n`;
        if (documentData.returnType === 'sales') {
          message += `Refund Status: ${documentData.refundStatus || 'Processing'}\n`;
        }
        message += `\nPlease check and confirm.`;
        break;
        
      case 'payment':
        message += `Payment Receipt for ₹${amount.toFixed(2)} received on ${date}.\n\n`;
        message += `Receipt No: ${docNumber}\n`;
        message += `Payment Mode: ${documentData.paymentMode || 'Cash'}\n`;
        if (documentData.referenceNumber) {
          message += `Reference: ${documentData.referenceNumber}\n`;
        }
        message += `\nThank you for your payment.`;
        break;
        
      default:
        message += `${docTitle} ${docNumber} dated ${date} for ₹${amount.toFixed(2)}.`;
    }
    
    message += `\n\n${companyInfo.name || 'Your Company'}`;
    if (companyInfo.phone) {
      message += `\n📞 ${companyInfo.phone}`;
    }
    
    return message;
  };

  // Generate email subject and body
  const generateEmailContent = () => {
    const docTitle = getDocumentTitle();
    const docNumber = documentData.documentNumber || documentData.invoice_number || 
                     documentData.challan_number || documentData.order_number || 'N/A';
    
    return {
      subject: `${docTitle} - ${docNumber} from ${companyInfo.name || 'Our Company'}`,
      body: generateWhatsAppMessage().replace(/\n/g, '<br/>')
    };
  };

  // Handle WhatsApp share
  const handleWhatsAppShare = () => {
    const phone = partyDetails?.phone || partyDetails?.mobile || '';
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const message = generateWhatsAppMessage();
    
    // Add country code if not present (assuming India)
    const phoneWithCode = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`;
    
    const whatsappUrl = `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  // Handle SMS share
  const handleSMSShare = () => {
    const phone = partyDetails?.phone || partyDetails?.mobile || '';
    const docNumber = documentData.documentNumber || 'N/A';
    const amount = documentData.totalAmount || 0;
    
    // Short SMS message
    const message = `${getDocumentTitle()} ${docNumber} - ₹${amount.toFixed(2)} - ${companyInfo.name || 'Company'}`;
    
    const smsUrl = `sms:${phone}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  };

  // Handle email share
  const handleEmailShare = async () => {
    if (!showEmailForm) {
      const emailContent = generateEmailContent();
      setEmailData({
        to: partyDetails?.email || '',
        cc: '',
        subject: emailContent.subject,
        message: generateWhatsAppMessage()
      });
      setShowEmailForm(true);
      return;
    }

    setSendingEmail(true);
    try {
      // Here you would call your email API
      // For now, we'll use mailto as fallback
      const mailtoUrl = `mailto:${emailData.to}?cc=${emailData.cc}&subject=${encodeURIComponent(emailData.subject)}&body=${encodeURIComponent(emailData.message)}`;
      window.location.href = mailtoUrl;
      
      setTimeout(() => {
        setSendingEmail(false);
        setShowEmailForm(false);
        onClose();
      }, 1000);
    } catch (error) {
      setSendingEmail(false);
    }
  };

  // Handle copy link
  const handleCopyLink = () => {
    const docNumber = documentData.documentNumber || 'N/A';
    const shareableLink = `${window.location.origin}/view/${documentType}/${docNumber}`;
    
    navigator.clipboard.writeText(shareableLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  // Handle print
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
    onClose();
  };

  // Handle download
  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    }
    onClose();
  };

  if (!isOpen) return null;

  const Icon = getDocumentIcon();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg w-full max-w-md mx-4 ${className}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Share {getDocumentTitle()}</h3>
              <p className="text-xs text-gray-500">
                {documentData.documentNumber || 'Document'} • {partyDetails?.name || 'Customer'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!showEmailForm ? (
            <div className="grid grid-cols-2 gap-3">
              {/* WhatsApp */}
              {partyDetails?.phone && (
                <button
                  onClick={handleWhatsAppShare}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group"
                >
                  <div className="p-3 bg-green-100 rounded-full group-hover:bg-green-200">
                    <MessageCircle className="w-6 h-6 text-green-600" />
                  </div>
                  <span className="text-sm font-medium">WhatsApp</span>
                </button>
              )}

              {/* Email */}
              <button
                onClick={handleEmailShare}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <div className="p-3 bg-blue-100 rounded-full group-hover:bg-blue-200">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <span className="text-sm font-medium">Email</span>
              </button>

              {/* SMS */}
              {partyDetails?.phone && (
                <button
                  onClick={handleSMSShare}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
                >
                  <div className="p-3 bg-purple-100 rounded-full group-hover:bg-purple-200">
                    <Smartphone className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className="text-sm font-medium">SMS</span>
                </button>
              )}

              {/* Print */}
              <button
                onClick={handlePrint}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-lg hover:border-gray-500 hover:bg-gray-50 transition-all group"
              >
                <div className="p-3 bg-gray-100 rounded-full group-hover:bg-gray-200">
                  <Printer className="w-6 h-6 text-gray-600" />
                </div>
                <span className="text-sm font-medium">Print</span>
              </button>

              {/* Download PDF */}
              {onDownload && (
                <button
                  onClick={handleDownload}
                  className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-lg hover:border-orange-500 hover:bg-orange-50 transition-all group"
                >
                  <div className="p-3 bg-orange-100 rounded-full group-hover:bg-orange-200">
                    <Download className="w-6 h-6 text-orange-600" />
                  </div>
                  <span className="text-sm font-medium">Download</span>
                </button>
              )}

              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                className="flex flex-col items-center gap-2 p-4 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
              >
                <div className="p-3 bg-indigo-100 rounded-full group-hover:bg-indigo-200">
                  {copiedLink ? (
                    <CheckCircle className="w-6 h-6 text-green-600" />
                  ) : (
                    <Copy className="w-6 h-6 text-indigo-600" />
                  )}
                </div>
                <span className="text-sm font-medium">
                  {copiedLink ? 'Copied!' : 'Copy Link'}
                </span>
              </button>
            </div>
          ) : (
            // Email Form
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input
                  type="email"
                  value={emailData.to}
                  onChange={(e) => setEmailData({...emailData, to: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="recipient@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CC (Optional)</label>
                <input
                  type="email"
                  value={emailData.cc}
                  onChange={(e) => setEmailData({...emailData, cc: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="cc@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={emailData.subject}
                  onChange={(e) => setEmailData({...emailData, subject: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={emailData.message}
                  onChange={(e) => setEmailData({...emailData, message: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="5"
                />
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEmailForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleEmailShare}
                  disabled={!emailData.to || sendingEmail}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendingEmail ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Share Section */}
        {!showEmailForm && partyDetails?.phone && (
          <div className="px-4 pb-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-700 font-medium mb-2">Quick Share via WhatsApp</p>
              <button
                onClick={handleWhatsAppShare}
                className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Send to {partyDetails.name || 'Customer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ShareDocument;