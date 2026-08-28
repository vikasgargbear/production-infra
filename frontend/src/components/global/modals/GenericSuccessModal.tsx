import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle, X, Printer, Download, Copy, Mail, FileText, LucideIcon } from 'lucide-react';
import WhatsAppIcon from '../../icons/WhatsAppIcon';
import { canonicalContactEmail, indianContactDigits } from '../../../utils/contactDestinations';

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
    totalAmount?: number | string;
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
    partyDetails = null,
    companyInfo = {},
    documentData = {},
    showQuickActions = true
}) => {
    const [copied, setCopied] = useState<boolean>(false);
    const printUtilityRef = useRef<PrintUtilityRef>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);
    const formattedTotalAmount = (() => {
        if (totalAmount === undefined) return undefined;
        if (typeof totalAmount === 'number') return totalAmount.toFixed(2);
        const match = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(totalAmount.trim());
        if (!match) return undefined;
        const [whole, fraction = ''] = totalAmount.trim().split('.');
        return `${whole}.${fraction.padEnd(2, '0')}`;
    })();
    const whatsappDigits = indianContactDigits(
        partyDetails?.phone || documentData.customerPhone,
    );
    const emailAddress = canonicalContactEmail(
        partyDetails?.email || documentData.customerEmail,
    );
    const recipientName = customerName || partyDetails?.name || 'customer';
    const shareSubject = `${documentType.charAt(0).toUpperCase() + documentType.slice(1)} #${documentNumber || ''}`.trim();
    const shareBody = `Dear ${recipientName},\n\nPlease find the ${documentType} details:\n\nDocument Number: ${documentNumber || ''}\nAmount: ₹${formattedTotalAmount || '0.00'}\n\nThank you for your business!\n\nBest regards,\n${companyInfo.name || 'Company'}`;

    // Focus trap: capture trigger element, trap focus inside dialog, restore on close.
    useEffect(() => {
        if (isOpen) {
            previousFocusRef.current = document.activeElement as HTMLElement;
            // Move focus into the dialog on the next tick so the DOM has rendered.
            const raf = requestAnimationFrame(() => {
                const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
                    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
                );
                firstFocusable?.focus();
            });

            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key !== 'Tab' || !dialogRef.current) return;
                const focusable = Array.from(
                    dialogRef.current.querySelectorAll<HTMLElement>(
                        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                    )
                );
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            };

            document.addEventListener('keydown', handleKeyDown);
            return () => {
                cancelAnimationFrame(raf);
                document.removeEventListener('keydown', handleKeyDown);
                previousFocusRef.current?.focus();
            };
        }
    }, [isOpen]);

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
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="generic-success-modal-title"
        >
            <div ref={dialogRef} className="bg-white rounded-2xl shadow-2xl max-w-md w-full transform transition-all duration-300 scale-100">
                {/* Header with dynamic gradient */}
                <div className={`relative px-6 py-6 bg-gradient-to-r ${config.gradient} rounded-t-2xl`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 bg-gradient-to-br ${config.iconBg} rounded-xl flex items-center justify-center`}>
                                <CheckCircle className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 id="generic-success-modal-title" className="text-lg font-semibold text-gray-900">{title}</h3>
                                <p className="text-sm text-gray-600 capitalize">{documentType.replace('-', ' ')} created successfully</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="min-h-11 min-w-11 flex items-center justify-center p-2 hover:bg-white/20 rounded-lg transition-colors"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6 space-y-4">
                    {/* Document Details */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        {documentId && (
                            <div className="flex items-start justify-between gap-4">
                                <span className="text-sm font-medium text-gray-700">Canonical resource ID:</span>
                                <span className="break-all text-right font-mono text-xs text-gray-900">{documentId}</span>
                            </div>
                        )}
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
                                            aria-label={copied ? 'Copied' : 'Copy document number'}
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

                        {formattedTotalAmount !== undefined && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-gray-700">Amount:</span>
                                <span className="text-sm font-semibold text-gray-900">₹{formattedTotalAmount}</span>
                            </div>
                        )}
                    </div>

                    {/* Quick Action Buttons */}
                    {showQuickActions && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    disabled={!whatsappDigits}
                                    onClick={() => {
                                        if (!whatsappDigits) return;
                                        if (onWhatsApp) {
                                            onWhatsApp();
                                            return;
                                        }
                                        const message = `${shareSubject}\nAmount: ₹${formattedTotalAmount || '0.00'}\nFor: ${recipientName}`;
                                        window.open(
                                            `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(message)}`,
                                            '_blank',
                                            'noopener,noreferrer',
                                        );
                                    }}
                                    title={whatsappDigits ? `Open WhatsApp for ${recipientName}` : 'Valid WhatsApp number unavailable'}
                                    className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-xl transition-colors disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
                                    aria-label={whatsappDigits ? `Open WhatsApp for ${recipientName}` : 'Valid WhatsApp number unavailable'}
                                >
                                    <WhatsAppIcon className={`w-5 h-5 ${whatsappDigits ? 'text-green-600' : 'text-gray-300'}`} />
                                    <span className="font-medium">WhatsApp</span>
                                </button>

                                {emailAddress ? (
                                    <a
                                        href={`mailto:${encodeURIComponent(emailAddress)}?subject=${encodeURIComponent(shareSubject)}&body=${encodeURIComponent(shareBody)}`}
                                        className="min-h-[44px] flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
                                        aria-label={`Email ${recipientName}`}
                                    >
                                        <Mail className="w-5 h-5" />
                                        <span className="font-medium">Email</span>
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        disabled
                                        title="Valid email address unavailable"
                                        className="min-h-[44px] flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-gray-400"
                                        aria-label="Valid email address unavailable"
                                    >
                                        <Mail className="w-5 h-5" />
                                        <span className="font-medium">Email</span>
                                    </button>
                                )}
                            </div>

                            <div className={`grid gap-2 ${onDownload ? 'grid-cols-3' : 'grid-cols-2'}`}>
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

                                {onDownload && (
                                    <button
                                        onClick={onDownload}
                                        className="flex flex-col items-center justify-center gap-1.5 px-3 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all group"
                                    >
                                        <Download className="w-5 h-5 text-gray-600 group-hover:text-gray-800" />
                                        <span className="text-xs font-medium text-gray-600 group-hover:text-gray-800">Download</span>
                                    </button>
                                )}
                            </div>
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

        </div>
    );
};

export default GenericSuccessModal;
