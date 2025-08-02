import React, { useState } from 'react';
import { X, Mail, Send, Paperclip, AlertCircle } from 'lucide-react';

const ShareModal = ({ 
  show, 
  onClose, 
  onSend, 
  defaultTo = '',
  defaultCc = '',
  defaultBcc = '',
  subject = '',
  documentType = 'Document',
  attachmentName = ''
}) => {
  const [emailData, setEmailData] = useState({
    to: defaultTo,
    cc: defaultCc,
    bcc: defaultBcc,
    subject: subject,
    message: `Dear Sir/Madam,

Please find attached the ${documentType} for your reference.

Thank you for your business.

Best regards,
${localStorage.getItem('company_name') || 'Your Company'}`
  });

  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!emailData.to.trim()) {
      newErrors.to = 'Recipient email is required';
    } else if (!validateEmail(emailData.to)) {
      newErrors.to = 'Invalid email address';
    }

    if (emailData.cc && !emailData.cc.split(',').every(email => validateEmail(email.trim()))) {
      newErrors.cc = 'Invalid CC email address';
    }

    if (emailData.bcc && !emailData.bcc.split(',').every(email => validateEmail(email.trim()))) {
      newErrors.bcc = 'Invalid BCC email address';
    }

    if (!emailData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSend = async () => {
    if (!validateForm()) return;

    setSending(true);
    try {
      await onSend(emailData);
      onClose();
    } catch (error) {
      console.error('Error sending email:', error);
    } finally {
      setSending(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center">
            <Mail className="w-5 h-5 mr-2" />
            Send {documentType} via Email
          </h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* To Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={emailData.to}
              onChange={(e) => setEmailData({ ...emailData, to: e.target.value })}
              placeholder="recipient@example.com"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.to ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.to && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.to}
              </p>
            )}
          </div>

          {/* CC Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              CC
            </label>
            <input
              type="text"
              value={emailData.cc}
              onChange={(e) => setEmailData({ ...emailData, cc: e.target.value })}
              placeholder="cc@example.com (separate multiple with commas)"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.cc ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.cc && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.cc}
              </p>
            )}
          </div>

          {/* BCC Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BCC
            </label>
            <input
              type="text"
              value={emailData.bcc}
              onChange={(e) => setEmailData({ ...emailData, bcc: e.target.value })}
              placeholder="bcc@example.com (separate multiple with commas)"
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.bcc ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.bcc && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.bcc}
              </p>
            )}
          </div>

          {/* Subject Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={emailData.subject}
              onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.subject ? 'border-red-300' : 'border-gray-300'
              }`}
            />
            {errors.subject && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                {errors.subject}
              </p>
            )}
          </div>

          {/* Attachment Info */}
          {attachmentName && (
            <div className="bg-gray-50 p-3 rounded-lg flex items-center">
              <Paperclip className="w-4 h-4 text-gray-500 mr-2" />
              <span className="text-sm text-gray-700">
                Attachment: <span className="font-medium">{attachmentName || `${documentType}.pdf`}</span>
              </span>
            </div>
          )}

          {/* Message Field */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              value={emailData.message}
              onChange={(e) => setEmailData({ ...emailData, message: e.target.value })}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Email Provider Info */}
          <div className="bg-blue-50 p-3 rounded-lg">
            <p className="text-sm text-blue-700">
              <strong>Note:</strong> This will open your Gmail compose window with the email pre-filled. 
              The {documentType} PDF needs to be attached manually.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {sending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Opening Gmail...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Open in Gmail
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;