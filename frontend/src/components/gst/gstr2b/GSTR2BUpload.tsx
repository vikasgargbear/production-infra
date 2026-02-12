import React, { useState, useCallback, useRef } from 'react';
import {
    Upload,
    FileJson,
    FileText,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Loader2,
    Trash2,
    RefreshCw,
    Eye,
    Download
} from 'lucide-react';
import { apiClient } from '../../../services/api';

// ==================== TYPES ====================

interface GSTR2BInvoice {
    supplier_gstin: string;
    supplier_name: string;
    invoice_number: string;
    invoice_date: string;
    invoice_value: number;
    taxable_value: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    total_tax: number;
    invoice_type: string;
    place_of_supply: string;
    reverse_charge: boolean;
}

interface UploadProgress {
    status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
    progress: number;
    message: string;
}

interface ParsedData {
    invoices: GSTR2BInvoice[];
    period: string;
    gstin: string;
    summary: {
        total_invoices: number;
        total_value: number;
        total_tax: number;
        total_igst: number;
        total_cgst: number;
        total_sgst: number;
        total_cess: number;
    };
}

interface GSTR2BUploadProps {
    onUploadComplete?: (data: ParsedData) => void;
    onReconcile?: () => void;
}

// ==================== COMPONENT ====================

const GSTR2BUpload: React.FC<GSTR2BUploadProps> = ({
    onUploadComplete,
    onReconcile
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
        status: 'idle',
        progress: 0,
        message: ''
    });
    const [parsedData, setParsedData] = useState<ParsedData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Handle drag events
    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragIn = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragOut = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    // Validate file type
    const validateFile = (file: File): boolean => {
        const validTypes = ['application/json', 'text/csv', 'application/vnd.ms-excel'];
        const validExtensions = ['.json', '.csv', '.xlsx'];

        const hasValidType = validTypes.includes(file.type);
        const hasValidExtension = validExtensions.some(ext =>
            file.name.toLowerCase().endsWith(ext)
        );

        return hasValidType || hasValidExtension;
    };

    // Parse JSON file
    const parseJSONFile = async (file: File): Promise<ParsedData> => {
        const text = await file.text();
        const data = JSON.parse(text);

        // Handle GSTN official format
        if (data.gstin && data.b2b) {
            const invoices: GSTR2BInvoice[] = [];

            // Parse B2B section
            for (const supplier of data.b2b || []) {
                for (const invoice of supplier.inv || []) {
                    invoices.push({
                        supplier_gstin: supplier.ctin || '',
                        supplier_name: supplier.trdnm || `Supplier ${supplier.ctin}`,
                        invoice_number: invoice.inum || '',
                        invoice_date: invoice.dt || '',
                        invoice_value: invoice.val || 0,
                        taxable_value: invoice.itms?.reduce((sum: number, itm: any) =>
                            sum + (itm.itm_det?.txval || 0), 0) || 0,
                        igst: invoice.itms?.reduce((sum: number, itm: any) =>
                            sum + (itm.itm_det?.iamt || 0), 0) || 0,
                        cgst: invoice.itms?.reduce((sum: number, itm: any) =>
                            sum + (itm.itm_det?.camt || 0), 0) || 0,
                        sgst: invoice.itms?.reduce((sum: number, itm: any) =>
                            sum + (itm.itm_det?.samt || 0), 0) || 0,
                        cess: invoice.itms?.reduce((sum: number, itm: any) =>
                            sum + (itm.itm_det?.csamt || 0), 0) || 0,
                        total_tax: 0, // Will be calculated
                        invoice_type: invoice.inv_typ || 'R',
                        place_of_supply: invoice.pos || '',
                        reverse_charge: invoice.rchrg === 'Y'
                    });
                }
            }

            // Calculate total tax for each invoice
            invoices.forEach(inv => {
                inv.total_tax = inv.igst + inv.cgst + inv.sgst + inv.cess;
            });

            return {
                invoices,
                period: data.fp || 'Unknown',
                gstin: data.gstin || '',
                summary: {
                    total_invoices: invoices.length,
                    total_value: invoices.reduce((sum, inv) => sum + inv.invoice_value, 0),
                    total_tax: invoices.reduce((sum, inv) => sum + inv.total_tax, 0),
                    total_igst: invoices.reduce((sum, inv) => sum + inv.igst, 0),
                    total_cgst: invoices.reduce((sum, inv) => sum + inv.cgst, 0),
                    total_sgst: invoices.reduce((sum, inv) => sum + inv.sgst, 0),
                    total_cess: invoices.reduce((sum, inv) => sum + inv.cess, 0)
                }
            };
        }

        // Handle simplified format
        if (Array.isArray(data)) {
            const invoices = data as GSTR2BInvoice[];
            return {
                invoices,
                period: 'Custom',
                gstin: invoices[0]?.supplier_gstin || '',
                summary: {
                    total_invoices: invoices.length,
                    total_value: invoices.reduce((sum, inv) => sum + (inv.invoice_value || 0), 0),
                    total_tax: invoices.reduce((sum, inv) => sum + (inv.total_tax || 0), 0),
                    total_igst: invoices.reduce((sum, inv) => sum + (inv.igst || 0), 0),
                    total_cgst: invoices.reduce((sum, inv) => sum + (inv.cgst || 0), 0),
                    total_sgst: invoices.reduce((sum, inv) => sum + (inv.sgst || 0), 0),
                    total_cess: invoices.reduce((sum, inv) => sum + (inv.cess || 0), 0)
                }
            };
        }

        throw new Error('Invalid JSON format. Expected GSTN official format or array of invoices.');
    };

    // Parse CSV file
    const parseCSVFile = async (file: File): Promise<ParsedData> => {
        const text = await file.text();
        const lines = text.split('\n').filter(line => line.trim());

        if (lines.length < 2) {
            throw new Error('CSV file must have headers and at least one data row');
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const invoices: GSTR2BInvoice[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const row: Record<string, string> = {};

            headers.forEach((header, idx) => {
                row[header] = values[idx] || '';
            });

            invoices.push({
                supplier_gstin: row['supplier_gstin'] || row['gstin'] || row['ctin'] || '',
                supplier_name: row['supplier_name'] || row['tradename'] || row['trdnm'] || '',
                invoice_number: row['invoice_number'] || row['inv_no'] || row['inum'] || '',
                invoice_date: row['invoice_date'] || row['inv_date'] || row['dt'] || '',
                invoice_value: parseFloat(row['invoice_value'] || row['val'] || '0'),
                taxable_value: parseFloat(row['taxable_value'] || row['txval'] || '0'),
                igst: parseFloat(row['igst'] || row['iamt'] || '0'),
                cgst: parseFloat(row['cgst'] || row['camt'] || '0'),
                sgst: parseFloat(row['sgst'] || row['samt'] || '0'),
                cess: parseFloat(row['cess'] || row['csamt'] || '0'),
                total_tax: parseFloat(row['total_tax'] || '0'),
                invoice_type: row['invoice_type'] || row['inv_typ'] || 'R',
                place_of_supply: row['place_of_supply'] || row['pos'] || '',
                reverse_charge: row['reverse_charge'] === 'Y' || row['rchrg'] === 'Y'
            });
        }

        // Calculate total tax if not provided
        invoices.forEach(inv => {
            if (!inv.total_tax) {
                inv.total_tax = inv.igst + inv.cgst + inv.sgst + inv.cess;
            }
        });

        return {
            invoices,
            period: 'Custom',
            gstin: invoices[0]?.supplier_gstin || '',
            summary: {
                total_invoices: invoices.length,
                total_value: invoices.reduce((sum, inv) => sum + inv.invoice_value, 0),
                total_tax: invoices.reduce((sum, inv) => sum + inv.total_tax, 0),
                total_igst: invoices.reduce((sum, inv) => sum + inv.igst, 0),
                total_cgst: invoices.reduce((sum, inv) => sum + inv.cgst, 0),
                total_sgst: invoices.reduce((sum, inv) => sum + inv.sgst, 0),
                total_cess: invoices.reduce((sum, inv) => sum + inv.cess, 0)
            }
        };
    };

    // Handle file selection
    const handleFile = async (file: File) => {
        setError(null);
        setSelectedFile(file);

        if (!validateFile(file)) {
            setError('Invalid file type. Please upload a JSON or CSV file.');
            return;
        }

        setUploadProgress({
            status: 'processing',
            progress: 30,
            message: 'Parsing file...'
        });

        try {
            let data: ParsedData;

            if (file.name.endsWith('.json')) {
                data = await parseJSONFile(file);
            } else if (file.name.endsWith('.csv')) {
                data = await parseCSVFile(file);
            } else {
                throw new Error('Unsupported file format');
            }

            setUploadProgress({
                status: 'success',
                progress: 100,
                message: `Successfully parsed ${data.invoices.length} invoices`
            });

            setParsedData(data);
            onUploadComplete?.(data);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to parse file');
            setUploadProgress({
                status: 'error',
                progress: 0,
                message: 'Parsing failed'
            });
        }
    };

    // Handle drop event
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    }, []);

    // Handle file input change
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            handleFile(files[0]);
        }
    };

    // Upload to server
    const handleUploadToServer = async () => {
        if (!parsedData) return;

        setUploadProgress({
            status: 'uploading',
            progress: 50,
            message: 'Uploading to server...'
        });

        try {
            const formData = new FormData();
            if (selectedFile) {
                formData.append('file', selectedFile);
            }
            formData.append('period', parsedData.period);

            await apiClient.post('/gst/gstr2b/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setUploadProgress({
                status: 'success',
                progress: 100,
                message: 'Upload complete! Ready for reconciliation.'
            });

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
            setUploadProgress({
                status: 'error',
                progress: 0,
                message: 'Upload failed'
            });
        }
    };

    // Clear selection
    const handleClear = () => {
        setSelectedFile(null);
        setParsedData(null);
        setError(null);
        setUploadProgress({
            status: 'idle',
            progress: 0,
            message: ''
        });
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    // Format currency
    const formatCurrency = (amount: number): string => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amount);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-gray-900">Upload GSTR-2B</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Upload your GSTR-2B file from the GST portal for reconciliation
                    </p>
                </div>
                {parsedData && (
                    <button
                        onClick={handleClear}
                        className="inline-flex items-center px-3 py-2 text-sm text-gray-700 hover:text-red-600 transition-colors"
                    >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Clear
                    </button>
                )}
            </div>

            {/* Drop Zone */}
            {!parsedData && (
                <div
                    onDragEnter={handleDragIn}
                    onDragLeave={handleDragOut}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
            relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
            transition-all duration-200 ease-in-out
            ${isDragging
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                        }
            ${error ? 'border-red-300 bg-red-50' : ''}
          `}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.csv,.xlsx"
                        onChange={handleFileSelect}
                        className="hidden"
                    />

                    <div className="flex flex-col items-center">
                        {uploadProgress.status === 'processing' ? (
                            <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
                        ) : (
                            <div className={`p-4 rounded-full mb-4 ${isDragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
                                <Upload className={`h-8 w-8 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
                            </div>
                        )}

                        <p className="text-lg font-medium text-gray-700">
                            {isDragging ? 'Drop your file here' : 'Drag & drop your GSTR-2B file'}
                        </p>
                        <p className="text-sm text-gray-500 mt-2">
                            or <span className="text-blue-600 hover:underline">browse</span> to select
                        </p>

                        <div className="flex items-center gap-4 mt-4">
                            <div className="flex items-center text-xs text-gray-400">
                                <FileJson className="h-4 w-4 mr-1" />
                                JSON
                            </div>
                            <div className="flex items-center text-xs text-gray-400">
                                <FileText className="h-4 w-4 mr-1" />
                                CSV
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Error Display */}
            {error && (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-medium text-red-800">{error}</p>
                        <p className="text-xs text-red-600 mt-1">
                            Please check your file format and try again.
                        </p>
                    </div>
                </div>
            )}

            {/* Progress Bar */}
            {uploadProgress.status !== 'idle' && uploadProgress.status !== 'success' && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">
                            {uploadProgress.message}
                        </span>
                        <span className="text-sm text-gray-500">{uploadProgress.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                            className={`h-2 rounded-full transition-all duration-300 ${uploadProgress.status === 'error' ? 'bg-red-500' : 'bg-blue-600'
                                }`}
                            style={{ width: `${uploadProgress.progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Parsed Data Summary */}
            {parsedData && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Success Banner */}
                    <div className="bg-green-50 border-b border-green-200 px-6 py-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle className="h-5 w-5 text-green-600" />
                            <div>
                                <p className="text-sm font-medium text-green-800">
                                    File parsed successfully!
                                </p>
                                <p className="text-xs text-green-600 mt-0.5">
                                    {selectedFile?.name} • Period: {parsedData.period}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Summary Stats */}
                    <div className="p-6">
                        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-4">
                            Summary
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <p className="text-xs text-gray-500">Total Invoices</p>
                                <p className="text-xl font-bold text-gray-900 mt-1">
                                    {parsedData.summary.total_invoices}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-gray-200">
                                <p className="text-xs text-gray-500">Total Value</p>
                                <p className="text-xl font-bold text-gray-900 mt-1">
                                    {formatCurrency(parsedData.summary.total_value)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-gray-200 border-l-4 border-l-green-500">
                                <p className="text-xs text-gray-500">Total Tax</p>
                                <p className="text-xl font-bold text-green-700 mt-1">
                                    {formatCurrency(parsedData.summary.total_tax)}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg p-4 border border-gray-200 border-l-4 border-l-blue-500">
                                <p className="text-xs text-gray-500">ITC Available</p>
                                <p className="text-xl font-bold text-blue-700 mt-1">
                                    {formatCurrency(parsedData.summary.total_tax)}
                                </p>
                            </div>
                        </div>

                        {/* Tax Breakdown */}
                        <div className="grid grid-cols-4 gap-4 mt-4">
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">IGST</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(parsedData.summary.total_igst)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">CGST</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(parsedData.summary.total_cgst)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">SGST</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(parsedData.summary.total_sgst)}
                                </p>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <p className="text-xs text-gray-500">Cess</p>
                                <p className="text-sm font-semibold text-gray-900">
                                    {formatCurrency(parsedData.summary.total_cess)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Invoice Preview Table */}
                    <div className="border-t border-gray-200">
                        <div className="px-6 py-4 flex items-center justify-between bg-gray-50">
                            <h3 className="text-sm font-medium text-gray-700">
                                Invoice Preview (First 5)
                            </h3>
                            <button className="text-sm text-blue-600 hover:text-blue-800 flex items-center">
                                <Eye className="h-4 w-4 mr-1" />
                                View All
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Supplier
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Invoice No
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                                            Date
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                            Value
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                                            Tax
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {parsedData.invoices.slice(0, 5).map((inv, idx) => (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900">
                                                    {inv.supplier_name || 'Unknown'}
                                                </div>
                                                <div className="text-xs text-gray-500 font-mono">
                                                    {inv.supplier_gstin}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {inv.invoice_number}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                {inv.invoice_date}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                {formatCurrency(inv.invoice_value)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                                {formatCurrency(inv.total_tax)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {parsedData.invoices.length > 5 && (
                                <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500">
                                    ... and {parsedData.invoices.length - 5} more invoices
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                        <button
                            onClick={handleClear}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleUploadToServer}
                            disabled={uploadProgress.status === 'uploading'}
                            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {uploadProgress.status === 'uploading' ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-4 w-4 mr-2" />
                                    Upload & Save
                                </>
                            )}
                        </button>
                        {onReconcile && (
                            <button
                                onClick={onReconcile}
                                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                            >
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Start Reconciliation
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Help Section */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 className="text-sm font-medium text-amber-800">How to get GSTR-2B file</h4>
                        <ol className="text-xs text-amber-700 mt-2 space-y-1 list-decimal list-inside">
                            <li>Login to GST Portal (gst.gov.in)</li>
                            <li>Navigate to Returns → GSTR-2B</li>
                            <li>Select the required period</li>
                            <li>Click on "Download" and select JSON/Excel format</li>
                            <li>Upload the downloaded file here</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GSTR2BUpload;
