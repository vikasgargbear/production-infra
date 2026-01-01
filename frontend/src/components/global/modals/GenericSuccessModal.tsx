import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, X, Printer, Download, Send, Copy, ExternalLink, Sparkles, Share2, Mail, MessageCircle, FileText, LucideIcon } from 'lucide-react';
import PrintUtility from '../ui/PrintUtility';

// ==================== TYPE DEFINITIONS ====================

interface PartyDetails {
    name?: string;
    phone?: string;
    email?: string;
    [key: string]: unknown;
}

interface CompanyInfo {
    name?: string;
    [key: string]: unknown;
}

interface DocumentData {
    customerPhone?: string;
    customerEmail?: string;
    items?: unknown[];
    totals?: Record<string, unknown>;
    itemCount?: number;
    paymentStatus?: string;
    deliveryDate?: string;
    [key: string]: unknown;
}

interface AdditionalAction {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
    className?: string;
    variant?: string;
}

interface GenericSuccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    documentNumber?: string;
    documentId?: string | number;
    documentType?: string;
    customerName?: string;
    totalAmount?: number;
    onPrint?: () => void;
    onDownload?: () => void;
    onWhatsApp?: () => void;
    onThermalPrint?: (size: string) => void;
    additionalActions?: AdditionalAction[];
    showCopy?: boolean;
    autoCloseDelay?: number | null;
    enableShare?: boolean;
    partyDetails?: PartyDetails | null;
    companyInfo?: CompanyInfo;
    documentData?: DocumentData;
    showQuickActions?: boolean;
}

interface PrintUtilityRef {
    printThermal?: (size: string) => void;
}

interface DocumentTypeConfig {
    gradient: string;
    iconBg: string;
    primaryColor: string;
}

// ==================== COMPONENT ====================

const GenericSuccessModal: React.FC<GenericSuccessModalProps> = ({
    isOpen,
    onClose,
    title = "Success!",
    documentNumber,
    documentId,
    documentType = "document",
    customerName,
    totalAmount,
    onPrint,
    onDownload,
    onWhatsApp,
    onThermalPrint,
    additionalActions = [],
    showCopy = true,
    autoCloseDelay = null,
    enableShare = true,
    partyDetails = null,
    companyInfo = {},
    documentData = {},
    showQuickActions = true
}) => {
    const [copied, setCopied] = useState<boolean>(false);
    const [showShareModal, setShowShareModal] = useState<boolean>(false);
    const printUtilityRef = useRef<PrintUtilityRef>(null);

    useEffect(() => {
        if (isOpen && autoCloseDelay) {
            const timer = setTimeout(() => {
                onClose();
            }, autoCloseDelay * 1000);

            return () => clearTimeout(timer);
        }
    }, [isOpen, autoCloseDelay, onClose]);

    if (!isOpen) return null;

    const copyDocumentNumber = (): void => {
        if (!documentNumber) return;

        navigator.clipboard.writeText(documentNumber).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => {
            const textArea = document.createElement('textarea');
            textArea.value = documentNumber;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const getDocumentTypeConfig = (type: string): DocumentTypeConfig => {
        switch (type) {
            case 'invoice':
                return {
                    gradient: 'from-green-50 to-emerald-50',
                    iconBg: 'from-green-500 to-emerald-600',
                    primaryColor: 'green'
                };
            case 'sales-order':
                return {
                    gradient: 'from-purple-50 to-violet-50',
                    iconBg: 'from-purple-500 to-violet-600',
                    primaryColor: 'purple'
                };
            case 'challan':
                return {
                    gradient: 'from-blue-50 to-cyan-50',
                    iconBg: 'from-blue-500 to-cyan-600',
                    primaryColor: 'blue'
                };
            case 'purchase-order':
                return {
                    gradient: 'from-orange-50 to-amber-50',
                    iconBg: 'from-orange-500 to-amber-600',
                    primaryColor: 'orange'
                };
            default:
                return {
                    gradient: 'from-gray-50 to-slate-50',
                    iconBg: 'from-gray-500 to-slate-600',
                    primaryColor: 'gray'
                };
        }
    };

    const config = getDocumentTypeConfig(documentType);

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
                {/* Header with dynamic gradient */}
                <div className={`relative px-6 py-6 bg-gradient-to-r ${config.gradient} rounded-t-2xl`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 bg-gradient-to-br ${config.iconBg} rounded-xl flex items-center justify-center`}>
                                <CheckCircle className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
                                <p className="text-sm text-gray-600 capitalize">{documentType.replace('-', ' ')} created successfully</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-4">
                    {/* Document Details */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        {documentNumber && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">
                                    {documentType.charAt(0).toUpperCase() + documentType.slice(1).replace('-', ' ')} Number:
                                </span>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-semibold text-gray-900">{documentNumber}</span>
                                    {showCopy && (
                                        <button
                                            onClick={copyDocumentNumber}
                                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                                            title="Copy number"
                                        >
                                            {copied ? (
                                                <CheckCircle className="w-4 h-4 text-green-600" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-gray-500" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {customerName && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Customer:</span>
                                <span className="text-sm text-gray-900">{customerName}</span>
                            </div>
                        )}

                        {totalAmount !== undefined && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Amount:</span>
                                <span className="text-sm font-semibold text-gray-900">₹{totalAmount.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Quick Action Buttons */}
                    {showQuickActions && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => {
                                        if (onWhatsApp) {
                                            onWhatsApp();
                                        } else {
                                            const phone = partyDetails?.phone || documentData.customerPhone || '';
                                            const message = `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} #${documentNumber}\nAmount: ₹${totalAmount?.toFixed(2) || '0'}\nFor: ${customerName}`;
                                            const formattedPhone = phone.replace(/^\+91|^91/, '');
                                            const whatsappUrl = `https://wa.me/91${formattedPhone}?text=${encodeURIComponent(message)}`;
                                            window.open(whatsappUrl, '_blank');
                                        }
                                    }}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    <MessageCircle className="w-5 h-5" />
                                    <span className="font-medium">WhatsApp</span>
                                </button>

                                <button
                                    onClick={() => {
                                        const email = partyDetails?.email || documentData.customerEmail || '';
                                        const subject = `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} #${documentNumber}`;
                                        const body = `Dear ${customerName},\n\nPlease find the ${documentType} details:\n\nDocument Number: ${documentNumber}\nAmount: ₹${totalAmount?.toFixed(2) || '0'}\n\nThank you for your business!\n\nBest regards,\n${companyInfo.name || 'Company'}`;
                                        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                                        window.open(gmailUrl, '_blank');
                                    }}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    <Mail className="w-5 h-5" />
                                    <span className="font-medium">Email</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <button
                                    onClick={() => {
                                        if (onPrint) {
                                            onPrint();
                                        } else {
                                            window.print();
                                        }
                                    }}
                                    className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all group"
                                >
                                    <Printer className="w-5 h-5 text-gray-600 group-hover:text-gray-800" />
                                    <span className="text-xs font-medium text-gray-600 group-hover:text-gray-800">Print</span>
                                </button>

                                <div className="relative group">
                                    <button
                                        onClick={() => {
                                            const menu = document.getElementById('thermal-menu-' + documentId);
                                            if (menu) menu.classList.toggle('hidden');
                                        }}
                                        className="w-full flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all"
                                    >
                                        <FileText className="w-5 h-5 text-gray-600 group-hover:text-gray-800" />
                                        <span className="text-xs font-medium text-gray-600 group-hover:text-gray-800">Thermal</span>
                                    </button>

                                    <div id={`thermal-menu-${documentId}`} className="hidden absolute bottom-full mb-2 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50">
                                        <button
                                            onClick={() => {
                                                if (onThermalPrint) {
                                                    onThermalPrint('80mm');
                                                } else if (printUtilityRef.current?.printThermal) {
                                                    printUtilityRef.current.printThermal('80mm');
                                                }
                                                document.getElementById('thermal-menu-' + documentId)?.classList.add('hidden');
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm"
                                        >
                                            80mm
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (onThermalPrint) {
                                                    onThermalPrint('58mm');
                                                } else if (printUtilityRef.current?.printThermal) {
                                                    printUtilityRef.current.printThermal('58mm');
                                                }
                                                document.getElementById('thermal-menu-' + documentId)?.classList.add('hidden');
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded text-sm"
                                        >
                                            58mm
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        if (onDownload) {
                                            onDownload();
                                        } else {
                                            alert('PDF download will be implemented');
                                        }
                                    }}
                                    className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all group"
                                >
                                    <Download className="w-5 h-5 text-gray-600 group-hover:text-gray-800" />
                                    <span className="text-xs font-medium text-gray-600 group-hover:text-gray-800">Download</span>
                                </button>
                            </div>

                            {enableShare && (
                                <button
                                    onClick={() => setShowShareModal(true)}
                                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors text-sm"
                                >
                                    <Share2 className="w-4 h-4" />
                                    More sharing options
                                </button>
                            )}
                        </div>
                    )}

                    {/* Legacy Action Buttons */}
                    {!showQuickActions && (
                        <div className="grid grid-cols-2 gap-3">
                            {enableShare && (
                                <button
                                    onClick={() => setShowShareModal(true)}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-all transform hover:scale-105 col-span-2"
                                >
                                    <Share2 className="w-4 h-4" />
                                    Share Document
                                </button>
                            )}
                        </div>
                    )}

                    {/* Additional custom actions */}
                    {additionalActions.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                            {additionalActions.map((action, index) => {
                                const Icon = action.icon;
                                return (
                                    <button
                                        key={index}
                                        onClick={action.onClick}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 ${action.className || 'bg-gray-600 hover:bg-gray-700 text-white'} rounded-lg transition-colors`}
                                    >
                                        {Icon && <Icon className="w-4 h-4" />}
                                        {action.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="w-full py-3 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors font-medium"
                    >
                        Done
                    </button>
                </div>
            </div>

            {/* Hidden PrintUtility for thermal printing */}
            <div style={{ display: 'none' }}>
                {/* PrintUtility removed for now - using direct callbacks */}
            </div>

            {/* TODO: ShareDocument component was removed - replace with ShareModal if sharing is needed */}
            {/* enableShare && (
                <ShareModal
                    show={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    ...
                />
            ) */}
        </div>
    );
};

export default GenericSuccessModal;
