import React, { useState, useRef, ChangeEvent } from 'react';
import {
    Upload, Download, FileSpreadsheet, AlertCircle,
    CheckCircle, X, Edit2, Trash2,
    Package, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { productAPI } from '../../../services/api';
import { useToast } from '../ui/feedback/Toast';

// ==================== TYPE DEFINITIONS ====================

interface TemplateColumn {
    field: string;
    header: string;
    required: boolean;
    example: string;
}

interface Product {
    product_id?: string | number | null;
    product_name: string;
    generic_name?: string;
    manufacturer?: string;
    hsn_code?: string;
    batch_number: string;
    batch_number?: string;
    expiry_date: string;
    quantity: number;
    free_quantity?: number;
    mrp: number;
    cost_per_unit: number;
    unit_price?: number;
    sale_price?: number;
    selling_price?: number;
    pack_type?: string;
    pack_size?: number;
    number_of_packs?: number;
    loose_quantity?: number;
    gst_percent?: number;
    tax_percent?: number;
    discount_percent?: number;
    schedule_type?: string;
    storage_condition?: string;
    amount?: number;
}

interface ValidationError {
    row: number;
    errors: string[];
}

interface SaveResult {
    success: Product[];
    failed: Array<{ product: Product; error: string }>;
}

export interface BulkProductUploadProps {
    onProductsAdded?: (products: Product[]) => void;
    onUpload?: (products: Product[]) => void;
    onClose?: () => void;
    mode?: 'purchase' | 'inventory';
    createInDatabase?: boolean;
}

// ==================== COMPONENT ====================

/**
 * BulkProductUpload Component
 * Allows users to:
 * 1. Download an Excel template
 * 2. Fill it with product data
 * 3. Upload and preview
 * 4. Edit inline before saving
 * 5. Bulk create products for purchase
 */
const BulkProductUpload: React.FC<BulkProductUploadProps> = ({
    onProductsAdded,
    onUpload,
    onClose,
    mode = 'purchase',
    createInDatabase = false
}) => {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState<boolean>(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [errors, setErrors] = useState<ValidationError[]>([]);
    const [saving, setSaving] = useState<boolean>(false);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);

    // Template columns definition
    const templateColumns: TemplateColumn[] = [
        { field: 'product_name', header: 'Product Name*', required: true, example: 'Paracetamol 500mg' },
        { field: 'generic_name', header: 'Generic Name', required: false, example: 'Paracetamol' },
        { field: 'manufacturer', header: 'Manufacturer', required: false, example: 'Cipla Ltd' },
        { field: 'hsn_code', header: 'HSN Code', required: false, example: '3004' },
        { field: 'batch_number', header: 'Batch No', required: false, example: 'BATCH001' },
        { field: 'expiry_date', header: 'Expiry (MM/YYYY)*', required: true, example: '12/2025' },
        { field: 'quantity', header: 'Quantity*', required: true, example: '100' },
        { field: 'free_quantity', header: 'Free Qty', required: false, example: '10' },
        { field: 'mrp', header: 'MRP*', required: true, example: '120.00' },
        { field: 'cost_per_unit', header: 'Cost Price*', required: true, example: '80.00' },
        { field: 'sale_price', header: 'Sale Price', required: false, example: '100.00' },
        { field: 'pack_type', header: 'Pack Type', required: false, example: 'STRIP' },
        { field: 'pack_size', header: 'Units per Pack', required: false, example: '10' },
        { field: 'number_of_packs', header: 'Number of Packs', required: false, example: '10' },
        { field: 'loose_quantity', header: 'Loose Units', required: false, example: '0' },
        { field: 'gst_percent', header: 'GST %', required: false, example: '12' },
        { field: 'discount_percent', header: 'Discount %', required: false, example: '5' },
        { field: 'schedule_type', header: 'Schedule', required: false, example: 'H' },
        { field: 'storage_condition', header: 'Storage', required: false, example: 'Cool & Dry' }
    ];

    // Generate and download Excel template
    const downloadTemplate = (): void => {
        const wb = XLSX.utils.book_new();
        const headers = templateColumns.map(col => col.header);

        const instructionsData = [
            ['BULK PRODUCT UPLOAD TEMPLATE'],
            [''],
            ['Instructions:'],
            ['1. Switch to the "Data" sheet tab to enter products'],
            ['2. Enter one product per row, starting from row 2'],
            ['3. Required fields are marked with * (Product Name, Expiry, Quantity, MRP, Cost Price)'],
            ['4. Batch No: Auto-generated if left empty (format: AUTO-YYYYMMDD-XXX)'],
            ['5. Empty rows will be automatically skipped'],
            ['6. Date format: MM/YYYY (e.g., 12/2025)'],
            ['7. Pack Types: STRIP, BOX, BOTTLE, VIAL, TUBE, SACHET, INJECTION'],
            ['8. Pack Size: Number of units in each pack (e.g., 10 tablets per strip)'],
            ['9. Number of Packs: How many packs you are purchasing'],
            ['10. GST % options: 0, 5, 12, 18, 28 (defaults to 12% if left empty)'],
            ['11. Schedule Types: H, H1, X, G, J (leave empty for OTC)'],
            ['12. You can copy-paste data from PDFs directly into the cells'],
            ['13. Save the file and upload it back to import products'],
            [''],
            ['Field Descriptions:'],
            ...templateColumns.map(col => [
                col.header,
                col.required ? 'Required' : 'Optional',
                col.example
            ])
        ];

        const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
        XLSX.utils.book_append_sheet(wb, instructionsSheet, 'Instructions');

        const dataSheet = XLSX.utils.aoa_to_sheet([headers]);
        const colWidths = templateColumns.map(col => ({ wch: Math.max(col.header.length, 15) }));
        dataSheet['!cols'] = colWidths;
        XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');

        XLSX.writeFile(wb, `product_upload_template_${new Date().getTime()}.xlsx`);
        toast.success('Template downloaded! Fill it and upload back.');
    };

    // Parse uploaded Excel file
    const handleFileUpload = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0];
        if (!file) return;

        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];

        if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/)) {
            toast.error('Please upload an Excel or CSV file');
            return;
        }

        setUploading(true);
        const reader = new FileReader();

        reader.onload = (e: ProgressEvent<FileReader>) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const sheetName = workbook.SheetNames.includes('Data') ? 'Data' : workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as Record<string, string>[];

                if (jsonData.length === 0) {
                    toast.error('No data found in the file');
                    setUploading(false);
                    return;
                }

                const filteredData = jsonData.filter(row => {
                    const hasAnyData = Object.values(row).some(val => val && val.toString().trim());
                    const isExampleRow = row['Product Name*'] === 'Paracetamol 500mg' &&
                        row['Batch No*'] === 'BATCH001';
                    return hasAnyData && !isExampleRow;
                });

                if (filteredData.length === 0) {
                    toast.error('No valid product data found. Please add product details to the template.');
                    setUploading(false);
                    return;
                }

                const processedProducts: Product[] = [];
                const validationErrors: ValidationError[] = [];

                filteredData.forEach((row, index) => {
                    const hasAnyData = Object.values(row).some(val => val && val.toString().trim());
                    if (!hasAnyData) return;

                    const isExampleRow = row['Product Name*'] === 'Paracetamol 500mg' &&
                        row['Batch No*'] === 'BATCH001';
                    if (isExampleRow) return;

                    const product: Partial<Product> = {};
                    const rowErrors: string[] = [];

                    templateColumns.forEach(col => {
                        const value = row[col.header];

                        if (col.required && !value) {
                            rowErrors.push(`${col.header} is required`);
                        }

                        if (value !== undefined && value !== '') {
                            switch (col.field) {
                                case 'quantity':
                                case 'free_quantity':
                                case 'pack_size':
                                case 'number_of_packs':
                                case 'loose_quantity':
                                    (product as any)[col.field] = parseInt(value) || 0;
                                    break;
                                case 'mrp':
                                case 'cost_per_unit':
                                case 'sale_price':
                                case 'gst_percent':
                                case 'discount_percent':
                                    (product as any)[col.field] = parseFloat(value) || 0;
                                    break;
                                case 'expiry_date':
                                    const [month, year] = value.split('/');
                                    if (month && year) {
                                        const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                                        product[col.field as keyof Product] = `${year}-${month.padStart(2, '0')}-${lastDay}` as any;
                                    }
                                    break;
                                default:
                                    (product as any)[col.field] = value?.toString().trim() || '';
                            }
                        } else if (col.field === 'gst_percent') {
                            product.gst_percent = 12;
                        } else if (col.field === 'sale_price' && !value) {
                            product.sale_price = product.mrp || 0;
                        }
                    });

                    if (!product.batch_number || product.batch_number.trim() === '') {
                        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                        product.batch_number = `AUTO-${dateStr}-${(index + 1).toString().padStart(3, '0')}`;
                    }

                    if (product.number_of_packs && product.pack_size) {
                        const totalFromPacks = product.number_of_packs * product.pack_size;
                        const looseQty = product.loose_quantity || 0;
                        product.quantity = totalFromPacks + looseQty;
                    }

                    if (!product.pack_type) product.pack_type = 'STRIP';
                    if (!product.pack_size) product.pack_size = 10;
                    if (!product.storage_condition) product.storage_condition = 'Cool & Dry';

                    product.amount = (product.quantity || 0) * (product.cost_per_unit || 0);

                    if (rowErrors.length > 0) {
                        validationErrors.push({ row: index + 2, errors: rowErrors });
                    } else {
                        processedProducts.push(product as Product);
                    }
                });

                if (validationErrors.length > 0) {
                    setErrors(validationErrors);
                    toast.error(`Found ${validationErrors.length} rows with errors`);
                }

                if (processedProducts.length > 0) {
                    setProducts(processedProducts);
                    toast.success(`Loaded ${processedProducts.length} products. Review and save.`);
                }

            } catch (error) {
                toast.error('Failed to parse file. Please check the format.');
            } finally {
                setUploading(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        };

        reader.readAsArrayBuffer(file);
    };

    // Handle inline editing
    const handleEdit = (index: number, field: keyof Product, value: string | number): void => {
        const updatedProducts = [...products];
        updatedProducts[index] = {
            ...updatedProducts[index],
            [field]: value
        };

        if (field === 'quantity' || field === 'cost_per_unit') {
            updatedProducts[index].amount =
                (updatedProducts[index].quantity || 0) *
                (updatedProducts[index].cost_per_unit || 0);
        }

        setProducts(updatedProducts);
    };

    // Remove product from list
    const handleRemove = (index: number): void => {
        setProducts(products.filter((_, i) => i !== index));
        toast.info('Product removed from list');
    };

    // Save all products
    const handleSaveAll = async (): Promise<void> => {
        if (products.length === 0) {
            toast.error('No products to save');
            return;
        }

        if (!createInDatabase) {
            const callback = onUpload || onProductsAdded;
            if (callback) {
                const formattedProducts = products.map(product => ({
                    ...product,
                    product_id: product.product_id || null,
                    batch_number: product.batch_number,
                    unit_price: product.cost_per_unit,
                    selling_price: product.sale_price || product.mrp,
                    tax_percent: product.gst_percent
                }));
                callback(formattedProducts);
            }
            toast.success(`Added ${products.length} products to purchase`);
            setProducts([]);
            if (onClose) {
                onClose();
            }
            return;
        }

        setSaving(true);
        const results: SaveResult = { success: [], failed: [] };

        try {
            const batchSize = 5;
            for (let i = 0; i < products.length; i += batchSize) {
                const batch = products.slice(i, i + batchSize);
                const promises = batch.map(async (product) => {
                    try {
                        const response = await (productAPI as any).create(product);
                        return { success: true, product: response.data };
                    } catch (error: any) {
                        return {
                            success: false,
                            product,
                            error: error.response?.data?.message || 'Failed to create'
                        };
                    }
                });

                const batchResults = await Promise.all(promises);
                batchResults.forEach(result => {
                    if (result.success) {
                        results.success.push(result.product);
                    } else {
                        results.failed.push(result as any);
                    }
                });
            }

            if (results.success.length > 0) {
                toast.success(`Successfully created ${results.success.length} products`);
                const callback = onUpload || onProductsAdded;
                if (callback) {
                    callback(results.success);
                }
            }

            if (results.failed.length > 0) {
                toast.error(`Failed to create ${results.failed.length} products`);
            }

            if (results.failed.length > 0) {
                setProducts(results.failed.map(r => r.product));
            } else {
                setProducts([]);
                if (onClose) {
                    onClose();
                }
            }

        } catch (error) {
            toast.error('Failed to save products');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-7xl max-h-[90vh] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                            <div>
                                <h2 className="text-xl font-semibold text-gray-800">
                                    Bulk Product Upload
                                </h2>
                                <p className="text-sm text-gray-600">
                                    Upload multiple products via Excel
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white rounded-lg transition-all"
                        >
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Instructions & Actions */}
                <div className="px-6 py-4 bg-gray-50 border-b">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={downloadTemplate}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                <span>Download Template</span>
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                onChange={handleFileUpload}
                                className="hidden"
                            />

                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
                            >
                                <Upload className="w-4 h-4" />
                                <span>{uploading ? 'Processing...' : 'Upload File'}</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Info className="w-4 h-4" />
                            <span>Excel (.xlsx, .xls) or CSV files supported</span>
                        </div>
                    </div>
                </div>

                {/* Error Display */}
                {errors.length > 0 && (
                    <div className="px-6 py-3 bg-red-50 border-b border-red-100">
                        <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                            <div>
                                <p className="font-medium text-red-800">Validation Errors:</p>
                                <ul className="mt-1 text-sm text-red-700">
                                    {errors.slice(0, 3).map((error, i) => (
                                        <li key={i}>Row {error.row}: {error.errors.join(', ')}</li>
                                    ))}
                                    {errors.length > 3 && (
                                        <li>...and {errors.length - 3} more errors</li>
                                    )}
                                </ul>
                            </div>
                        </div>
                    </div>
                )}

                {/* Products Table */}
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(90vh-280px)]">
                    {products.length > 0 ? (
                        <table className="w-full">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">#</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Product Name</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Batch</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Expiry</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Qty</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Free</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">MRP</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Cost</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">GST%</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Amount</th>
                                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {products.map((product, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-sm text-gray-600">{index + 1}</td>
                                        <td className="px-3 py-2">
                                            {editingIndex === index ? (
                                                <input
                                                    type="text"
                                                    value={product.product_name}
                                                    onChange={(e) => handleEdit(index, 'product_name', e.target.value)}
                                                    className="w-full px-2 py-1 text-sm border rounded"
                                                    autoFocus
                                                />
                                            ) : (
                                                <div>
                                                    <p className="text-sm font-medium text-gray-900">{product.product_name}</p>
                                                    {product.manufacturer && (
                                                        <p className="text-xs text-gray-500">{product.manufacturer}</p>
                                                    )}
                                                    {product.pack_type && (
                                                        <p className="text-xs text-gray-400">
                                                            {product.pack_type} × {product.pack_size || 10}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="text"
                                                value={product.batch_number}
                                                onChange={(e) => handleEdit(index, 'batch_number', e.target.value)}
                                                className="w-20 px-2 py-1 text-sm border rounded"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="date"
                                                value={product.expiry_date}
                                                onChange={(e) => handleEdit(index, 'expiry_date', e.target.value)}
                                                className="w-32 px-2 py-1 text-sm border rounded"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                value={product.quantity}
                                                onChange={(e) => handleEdit(index, 'quantity', parseInt(e.target.value) || 0)}
                                                className="w-16 px-2 py-1 text-sm border rounded"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                value={product.free_quantity || 0}
                                                onChange={(e) => handleEdit(index, 'free_quantity', parseInt(e.target.value) || 0)}
                                                className="w-14 px-2 py-1 text-sm border rounded"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                value={product.mrp}
                                                onChange={(e) => handleEdit(index, 'mrp', parseFloat(e.target.value) || 0)}
                                                className="w-20 px-2 py-1 text-sm border rounded"
                                                step="0.01"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                type="number"
                                                value={product.cost_per_unit}
                                                onChange={(e) => handleEdit(index, 'cost_per_unit', parseFloat(e.target.value) || 0)}
                                                className="w-20 px-2 py-1 text-sm border rounded"
                                                step="0.01"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <select
                                                value={product.gst_percent}
                                                onChange={(e) => handleEdit(index, 'gst_percent', parseFloat(e.target.value))}
                                                className="w-16 px-2 py-1 text-sm border rounded"
                                            >
                                                <option value="0">0%</option>
                                                <option value="5">5%</option>
                                                <option value="12">12%</option>
                                                <option value="18">18%</option>
                                                <option value="28">28%</option>
                                            </select>
                                        </td>
                                        <td className="px-3 py-2 text-sm font-medium text-gray-900">
                                            ₹{product.amount?.toFixed(2) || '0.00'}
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => setEditingIndex(editingIndex === index ? null : index)}
                                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleRemove(index)}
                                                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Package className="w-16 h-16 text-gray-300 mb-4" />
                            <p className="text-lg font-medium text-gray-600 mb-2">No products uploaded yet</p>
                            <p className="text-sm text-gray-500">Download template, fill it, and upload to get started</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {products.length > 0 && (
                    <div className="px-6 py-4 border-t bg-gray-50">
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600">
                                <span className="font-medium">{products.length}</span> products ready
                                • Total Amount: <span className="font-medium">
                                    ₹{products.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setProducts([])}
                                    className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Clear All
                                </button>
                                <button
                                    onClick={handleSaveAll}
                                    disabled={saving || products.length === 0}
                                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
                                >
                                    {saving ? (
                                        <>
                                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4" />
                                            <span>{createInDatabase ? 'Create Products' : 'Add to Purchase'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BulkProductUpload;
