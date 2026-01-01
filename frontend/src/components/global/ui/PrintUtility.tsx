import React, { useState, useRef, useEffect, ReactNode, forwardRef, useImperativeHandle, ForwardRefRenderFunction, CSSProperties } from 'react';
import { Printer, Monitor, FileText } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

export interface PrintUtilityDocumentItem {
    product_name?: string;
    name?: string;
    hsn_code?: string;
    batch_no?: string;
    quantity?: number;
    free_quantity?: number;
    unit_price?: number;
    rate?: number;
    selling_price?: number;
    discount_percent?: number;
    gst_percent?: number;
    total?: number;
    line_total?: number;
    [key: string]: unknown;
}

export interface PrintUtilityDocumentTotals {
    subtotal?: number;
    discount?: number;
    tax_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    total_amount?: number;
    final_amount?: number;
    paid_amount?: number;
    balance_amount?: number;
    [key: string]: unknown;
}

export interface PrintUtilityCustomer {
    name?: string;
    customer_name?: string;
    phone?: string;
    gstin?: string;
    dl_number?: string;
    [key: string]: unknown;
}

export interface PrintUtilityDocumentData {
    documentNumber?: string;
    date?: string;
    customer?: PrintUtilityCustomer;
    items?: PrintUtilityDocumentItem[];
    totals?: PrintUtilityDocumentTotals;
    addresses?: {
        billing?: string;
        shipping?: string;
    };
    notes?: string;
    [key: string]: unknown;
}

export interface PrintUtilityCompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    gstin?: string;
    website?: string;
    [key: string]: unknown;
}

export interface PrintUtilityRef {
    printThermal: (width?: string) => void;
    printDigital: () => void;
}

export interface PrintUtilityProps {
    children?: ReactNode;
    documentData?: PrintUtilityDocumentData;
    documentType?: 'invoice' | 'sales-order' | 'challan' | 'purchase' | string;
    companyInfo?: PrintUtilityCompanyInfo;
    showPrintOptions?: boolean;
    onPrint?: (format?: string, width?: string) => void;
    className?: string;
}

interface ThermalPrintTemplateProps {
    documentType: string;
    documentData: PrintUtilityDocumentData;
    companyInfo: PrintUtilityCompanyInfo;
    width?: string;
}

// ==================== THERMAL PRINT TEMPLATE ====================

export const ThermalPrintTemplate = forwardRef<HTMLDivElement, ThermalPrintTemplateProps>(({
    documentType,
    documentData,
    companyInfo,
    width = '80mm'
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

    const thermalStyles = `
    @media print {
      @page { size: ${width} auto; margin: 0; }
      body { margin: 0; padding: 0; }
    }
    .thermal-print-container { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.3; padding: 5mm; background: white; color: black; }
    .thermal-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
    .thermal-company-name { font-size: 14px; font-weight: bold; text-transform: uppercase; margin-bottom: 2mm; }
    .thermal-doc-title { font-size: 12px; font-weight: bold; margin: 2mm 0; text-decoration: underline; }
    .thermal-section { margin: 3mm 0; padding: 2mm 0; }
    .thermal-row { display: flex; justify-content: space-between; margin: 1mm 0; }
    .thermal-label { font-weight: bold; }
    .thermal-divider { border-top: 1px dashed #000; margin: 3mm 0; }
    .thermal-table { width: 100%; margin: 3mm 0; }
    .thermal-table-header { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1mm 0; font-weight: bold; }
    .thermal-table-row { padding: 1mm 0; border-bottom: 1px dotted #ccc; }
    .thermal-total-section { margin-top: 3mm; padding-top: 2mm; border-top: 2px solid #000; }
    .thermal-total-row { display: flex; justify-content: space-between; margin: 1mm 0; }
    .thermal-grand-total { font-size: 13px; font-weight: bold; border-top: 1px solid #000; border-bottom: 2px solid #000; padding: 2mm 0; margin: 2mm 0; }
    .thermal-footer { text-align: center; margin-top: 5mm; padding-top: 3mm; border-top: 1px dashed #000; font-size: 10px; }
    .thermal-barcode { text-align: center; margin: 3mm 0; font-family: 'Libre Barcode 39', monospace; font-size: 24px; }
  `;

    const style50: CSSProperties = { width: '50%' };
    const style15Center: CSSProperties = { width: '15%', textAlign: 'center' };
    const style15Right: CSSProperties = { width: '15%', textAlign: 'right' };
    const style20Right: CSSProperties = { width: '20%', textAlign: 'right' };

    return (
        <div ref={ref} className="thermal-print-container" style={{ width }}>
            <style dangerouslySetInnerHTML={{ __html: thermalStyles }} />

            <div className="thermal-header">
                <div className="thermal-company-name">{companyInfo.name || 'Company Name'}</div>
                {companyInfo.address && <div>{companyInfo.address}</div>}
                {companyInfo.phone && <div>Ph: {companyInfo.phone}</div>}
                {companyInfo.gstin && <div>GSTIN: {companyInfo.gstin}</div>}
            </div>

            <div className="thermal-doc-title">{documentType.toUpperCase().replace('-', ' ')}</div>

            <div className="thermal-section">
                <div className="thermal-row">
                    <span className="thermal-label">No:</span>
                    <span>{documentNumber}</span>
                </div>
                <div className="thermal-row">
                    <span className="thermal-label">Date:</span>
                    <span>{date ? new Date(date).toLocaleDateString('en-IN') : ''}</span>
                </div>
            </div>

            <div className="thermal-divider" />

            <div className="thermal-section">
                <div className="thermal-label">BILL TO:</div>
                <div>{customer?.name || customer?.customer_name}</div>
                {customer?.phone && <div>Ph: {customer.phone}</div>}
                {customer?.gstin && <div>GST: {customer.gstin}</div>}
                {addresses.billing && <div style={{ fontSize: '10px', marginTop: '1mm' }}>{addresses.billing}</div>}
            </div>

            <div className="thermal-divider" />

            <div className="thermal-table">
                <div className="thermal-table-header">
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={style50}>Item</span>
                        <span style={style15Center}>Qty</span>
                        <span style={style15Right}>Rate</span>
                        <span style={style20Right}>Amt</span>
                    </div>
                </div>

                {items.map((item, index) => (
                    <div key={index} className="thermal-table-row">
                        <div style={{ fontSize: '10px', fontWeight: 'bold' }}>{item.product_name || item.name}</div>
                        {item.hsn_code && <div style={{ fontSize: '9px', color: '#666' }}>HSN: {item.hsn_code}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1mm' }}>
                            <span style={{ ...style50, fontSize: '10px' }}>{item.batch_no && `Batch: ${item.batch_no}`}</span>
                            <span style={style15Center}>
                                {item.quantity}
                                {(item.free_quantity ?? 0) > 0 && `+${item.free_quantity}F`}
                            </span>
                            <span style={style15Right}>{parseFloat(String(item.unit_price || item.rate || item.selling_price || 0)).toFixed(2)}</span>
                            <span style={style20Right}>
                                {parseFloat(String(item.total || item.line_total || ((item.quantity || 0) * (item.unit_price || item.rate || item.selling_price || 0)))).toFixed(2)}
                            </span>
                        </div>
                        {((item.discount_percent ?? 0) > 0 || (item.gst_percent ?? 0) > 0) && (
                            <div style={{ fontSize: '9px', color: '#666', marginTop: '1mm' }}>
                                {(item.discount_percent ?? 0) > 0 && `Disc: ${item.discount_percent}% `}
                                {(item.gst_percent ?? 0) > 0 && `GST: ${item.gst_percent}%`}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="thermal-total-section">
                {totals.subtotal !== undefined && (
                    <div className="thermal-total-row"><span>Subtotal:</span><span>₹{parseFloat(String(totals.subtotal || 0)).toFixed(2)}</span></div>
                )}
                {(totals.discount ?? 0) > 0 && (
                    <div className="thermal-total-row"><span>Discount:</span><span>-₹{parseFloat(String(totals.discount || 0)).toFixed(2)}</span></div>
                )}
                {totals.tax_amount !== undefined && (totals.tax_amount ?? 0) > 0 && (
                    <div className="thermal-total-row"><span>GST:</span><span>₹{parseFloat(String(totals.tax_amount || 0)).toFixed(2)}</span></div>
                )}
                <div className="thermal-grand-total">
                    <div className="thermal-total-row"><span>TOTAL:</span><span>₹{parseFloat(String(totals.total_amount || totals.final_amount || 0)).toFixed(2)}</span></div>
                </div>
            </div>

            {totals.paid_amount !== undefined && (
                <div className="thermal-section">
                    <div className="thermal-total-row"><span>Paid:</span><span>₹{parseFloat(String(totals.paid_amount || 0)).toFixed(2)}</span></div>
                    <div className="thermal-total-row"><span>Balance:</span><span>₹{parseFloat(String(totals.balance_amount || 0)).toFixed(2)}</span></div>
                </div>
            )}

            {notes && (
                <div className="thermal-section">
                    <div className="thermal-label">Notes:</div>
                    <div style={{ fontSize: '10px' }}>{notes}</div>
                </div>
            )}

            {documentNumber && <div className="thermal-barcode">*{documentNumber}*</div>}

            <div className="thermal-footer">
                <div>Thank You!</div>
                <div>Visit Again</div>
                {companyInfo.website && <div>{companyInfo.website}</div>}
            </div>
        </div>
    );
});

ThermalPrintTemplate.displayName = 'ThermalPrintTemplate';

// ==================== MAIN COMPONENT ====================

const PrintUtilityComponent: ForwardRefRenderFunction<PrintUtilityRef, PrintUtilityProps> = ({
    children,
    documentData,
    documentType = 'invoice',
    companyInfo = {},
    onPrint,
    showPrintOptions = false,
    className = ''
}, ref) => {
    const [printFormat, setPrintFormat] = useState<'digital' | 'thermal'>('digital');
    const [thermalWidth, setThermalWidth] = useState<string>('80mm');
    const [showPrintMenu, setShowPrintMenu] = useState(false);

    const thermalPrintRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (printFormat === 'thermal' && thermalPrintRef.current) {
            const printWindow = window.open('', '', 'width=400,height=600');
            if (printWindow) {
                printWindow.document.write('<html><head><title>Print</title>');
                printWindow.document.write('<style>');
                printWindow.document.write(`@page { size: ${thermalWidth} auto; margin: 0; } body { margin: 0; padding: 0; }`);
                printWindow.document.write('</style></head><body>');
                printWindow.document.write(thermalPrintRef.current.innerHTML);
                printWindow.document.write('</body></html>');
                printWindow.document.close();

                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                    setPrintFormat('digital');
                    onPrint?.('thermal', thermalWidth);
                }, 250);
            }
        }
    }, [printFormat, thermalWidth, onPrint]);

    const handlePrintClick = (): void => {
        if (showPrintOptions) {
            setShowPrintMenu(!showPrintMenu);
        } else {
            window.print();
        }
    };

    const handleDigitalPrint = (): void => {
        setPrintFormat('digital');
        setShowPrintMenu(false);
        setTimeout(() => {
            window.print();
            onPrint?.('digital');
        }, 100);
    };

    const handleThermalPrint = (width: string): void => {
        setThermalWidth(width);
        setPrintFormat('thermal');
        setShowPrintMenu(false);
    };

    useImperativeHandle(ref, () => ({
        printThermal: (width = '80mm') => handleThermalPrint(width),
        printDigital: () => handleDigitalPrint()
    }), []);

    return (
        <div className={`print-utility-container ${className}`}>
            {showPrintOptions && (
                <div className="relative inline-block">
                    <button
                        onClick={handlePrintClick}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                    >
                        <Printer className="w-4 h-4" />
                        Print
                    </button>

                    {showPrintMenu && (
                        <div className="absolute top-full mt-2 left-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50 min-w-[200px]">
                            <div className="text-xs text-gray-500 uppercase tracking-wider px-3 py-1">Print Format</div>

                            <button onClick={handleDigitalPrint} className="w-full text-left px-3 py-2 hover:bg-blue-50 rounded flex items-center gap-2 text-sm">
                                <Monitor className="w-4 h-4 text-blue-500" />
                                <div><div className="font-medium">Digital/Color</div><div className="text-xs text-gray-500">For screen & sharing</div></div>
                            </button>

                            <div className="border-t border-gray-200 my-2" />
                            <div className="text-xs text-gray-500 uppercase tracking-wider px-3 py-1">Thermal Printer</div>

                            <button onClick={() => handleThermalPrint('80mm')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded flex items-center gap-2 text-sm">
                                <FileText className="w-4 h-4 text-gray-600" />
                                <div><div className="font-medium">80mm Width</div><div className="text-xs text-gray-500">Standard thermal</div></div>
                            </button>

                            <button onClick={() => handleThermalPrint('58mm')} className="w-full text-left px-3 py-2 hover:bg-gray-50 rounded flex items-center gap-2 text-sm">
                                <FileText className="w-4 h-4 text-gray-600" />
                                <div><div className="font-medium">58mm Width</div><div className="text-xs text-gray-500">Compact thermal</div></div>
                            </button>
                        </div>
                    )}
                </div>
            )}

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

            {children}
        </div>
    );
};

const PrintUtility = forwardRef(PrintUtilityComponent);
PrintUtility.displayName = 'PrintUtility';

export default PrintUtility;
