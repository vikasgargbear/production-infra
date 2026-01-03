import React, { useRef, useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, Download, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useToast } from '../global';

// Type definitions
interface TemplateColumn {
  field: string;
  header: string;
  required: boolean;
}

interface UploadedProduct {
  product_name?: string;
  generic_name?: string;
  manufacturer?: string;
  hsn_code?: string;
  expiry_date?: string;
  pack_type?: string;
  units_per_pack?: number;
  packages_per_box?: number;  // Backend standard: packs in one box
  quantity?: number;
  free_quantity?: number;
  mrp?: number;
  cost_price?: number;
  sale_price?: number;
  gst_percent?: number;
  discount_percent?: number;
  schedule_type?: string;
  storage_condition?: string;
  batch_number?: string;
  batch_no?: string;
  tax_percent?: number;
  tax_amount?: number;
  selling_price?: number;
  purchase_price?: number;
  pack_size?: number;
  id?: number;
  product_id?: number | null;
  [key: string]: string | number | null | undefined;
}

interface RowError {
  row: number;
  errors: string[];
}

interface BulkUploadInlineProps {
  onProductsUploaded: (products: UploadedProduct[]) => void;
}

/**
 * BulkUploadInline - Inline Excel upload that adds directly to purchase items
 * No modal - integrates seamlessly with the purchase flow
 */
const BulkUploadInline: React.FC<BulkUploadInlineProps> = ({ onProductsUploaded }) => {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<boolean>(false);

  // Template columns definition - optimized headers
  const templateColumns: TemplateColumn[] = [
    { field: 'product_name', header: 'Product Name*', required: true },
    { field: 'generic_name', header: 'Generic', required: false },
    { field: 'manufacturer', header: 'Mfg', required: false },
    { field: 'hsn_code', header: 'HSN', required: false },
    { field: 'expiry_date', header: 'Expiry*', required: true },
    { field: 'pack_type', header: 'Pack', required: false },
    { field: 'units_per_pack', header: 'Units/Pack', required: false },
    { field: 'packages_per_box', header: 'Packs/Box', required: false },
    { field: 'quantity', header: 'Qty*', required: true },
    { field: 'free_quantity', header: 'Free', required: false },
    { field: 'mrp', header: 'MRP*', required: true },
    { field: 'cost_price', header: 'Cost*', required: true },
    { field: 'sale_price', header: 'Sale', required: false },
    { field: 'gst_percent', header: 'GST%', required: false },
    { field: 'discount_percent', header: 'Disc%', required: false },
    { field: 'schedule_type', header: 'Schedule', required: false },
    { field: 'storage_condition', header: 'Storage', required: false }
  ];

  // Download template with validation
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Create headers
    const headers = templateColumns.map(col => col.header);

    // Valid options for dropdowns
    const validOptions = {
      packTypes: ['STRIP', 'BOX', 'BOTTLE', 'VIAL', 'TUBE', 'SACHET', 'INJECTION', 'AMPOULE', 'TABLET', 'CAPSULE'],
      gstRates: [],  // Will be loaded from products
      scheduleTypes: ['OTC', 'H', 'H1', 'X', 'G', 'J'],
      storageConditions: ['Room Temperature', 'Cool & Dry', 'Refrigerated (2-8°C)', 'Frozen (-20°C)']
    };

    // Create beautiful instructions sheet
    const instructSheet = XLSX.utils.aoa_to_sheet([
      ['PHARMA PURCHASE - BULK PRODUCT UPLOAD'],
      [''],
      ['📋 QUICK START GUIDE'],
      ['1. Go to "Products" sheet tab'],
      ['2. Fill in your product details'],
      ['3. Save the file'],
      ['4. Upload using the Bulk Upload button'],
      [''],
      ['✅ REQUIRED FIELDS (marked with *)'],
      ['Field', 'Description', 'Example'],
      ['Product Name*', 'Name of the medicine/product', 'Paracetamol 500mg'],
      ['Expiry*', 'Product expiry date (MM/YYYY)', '12/2025'],
      ['Qty*', 'Total quantity to purchase', '100'],
      ['MRP*', 'Maximum Retail Price', '120.50'],
      ['Cost*', 'Purchase/buying price per unit', '85.00'],
      [''],
      ['📦 PACK CONFIGURATION'],
      ['Field', 'Description', 'Default if Empty'],
      ['Pack Type', 'STRIP, BOX, BOTTLE, VIAL, TUBE, etc.', 'STRIP'],
      ['Units per Pack', 'Units in each pack (e.g., 10 tablets/strip)', '10'],
      ['Number of Packs', 'How many packs you\'re buying', 'Auto-calculated'],
      ['Loose Units', 'Extra units beyond complete packs', '0'],
      [''],
      ['💊 PHARMACEUTICAL INFO'],
      ['Field', 'Options', 'Default'],
      ['Schedule', 'OTC, H, H1, X, G, J', 'OTC'],
      ['Storage', 'Room Temperature, Cool & Dry, Refrigerated', 'Cool & Dry'],
      ['GST %', '0, 5, 12, 18, 28', '12'],
      [''],
      ['🔄 AUTO-GENERATED FIELDS'],
      ['Field', 'Format', 'Example'],
      ['Batch No', 'AUTO-YYYYMMDD-XXX', 'AUTO-20240321-001'],
      ['Sale Price', 'Defaults to MRP if empty', 'Same as MRP'],
      [''],
      ['💡 HELPFUL TIPS'],
      ['✓ Works with Excel, Google Sheets, LibreOffice Calc'],
      ['✓ Case doesn\'t matter: "box", "BOX", "Box" all work'],
      ['✓ You can copy-paste data directly from PDF invoices'],
      ['✓ Empty rows will be automatically skipped'],
      ['✓ Invalid values will use smart defaults'],
      [''],
      ['⚠️ SCHEDULE TYPES EXPLAINED'],
      ['Code', 'Type', 'Description'],
      ['OTC', 'Over The Counter', 'No prescription required'],
      ['H', 'Schedule H', 'Prescription required'],
      ['H1', 'Schedule H1', 'Prescription with special record keeping'],
      ['X', 'Schedule X', 'Narcotic/Psychotropic - strict control'],
      ['G', 'Schedule G', 'Hormonal preparations'],
      ['J', 'Schedule J', 'Specific disease treatments'],
      [''],
      ['📧 Need Help?', 'Contact support or check documentation']
    ]);

    // Add formatting to instructions sheet
    if (!instructSheet['!cols']) instructSheet['!cols'] = [];
    instructSheet['!cols'] = [
      { wch: 25 }, // Column A
      { wch: 40 }, // Column B  
      { wch: 25 }  // Column C
    ];

    // Create data sheet
    const dataSheet = XLSX.utils.aoa_to_sheet([headers]);

    // Set column widths
    dataSheet['!cols'] = templateColumns.map(col => ({
      wch: Math.max(col.header.length, 15)
    }));

    // Add data validation (dropdowns) for specific columns
    // Note: XLSX doesn't support true Excel data validation in web version,
    // but we can add a reference sheet with valid values

    // Create reference sheet with valid values
    const refData = [
      ['Pack Types', 'GST Rates', 'Schedule Types', 'Storage'],
      ...Math.max(
        validOptions.packTypes.length,
        validOptions.gstRates.length,
        validOptions.scheduleTypes.length,
        validOptions.storageConditions.length
      ).toString().split('').map((_, i) => [
        validOptions.packTypes[i] || '',
        validOptions.gstRates[i] || '',
        validOptions.scheduleTypes[i] || '',
        validOptions.storageConditions[i] || ''
      ])
    ];

    const refSheet = XLSX.utils.aoa_to_sheet(refData);

    // Add sheets to workbook
    XLSX.utils.book_append_sheet(wb, instructSheet, 'Instructions');
    XLSX.utils.book_append_sheet(wb, dataSheet, 'Products');
    XLSX.utils.book_append_sheet(wb, refSheet, 'Valid Options');

    // Download
    XLSX.writeFile(wb, `purchase_products_template_${Date.now()}.xlsx`);
    toast.success('Template downloaded! Use dropdowns from "Valid Options" sheet for consistency.');
  };

  // Handle file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.match(/\.(xlsx|xls|csv)$/)) {
      toast.error('Please upload an Excel file');
      return;
    }

    setUploading(true);

    try {
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>): void => {
        try {
          if (!e.target?.result) return;
          const data = new Uint8Array(e.target.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });

          // Get the products sheet
          const sheetName = workbook.SheetNames.includes('Products') ?
            'Products' : workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];

          // Convert to JSON - cast to Record type for proper typing
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as Record<string, unknown>[];

          // Filter out empty rows
          const validData = jsonData.filter((row) => {
            return Object.values(row).some((val) => val && String(val).trim());
          });

          if (validData.length === 0) {
            toast.error('No product data found in file');
            return;
          }

          // Valid options for validation
          const validPackTypes: string[] = ['STRIP', 'BOX', 'BOTTLE', 'VIAL', 'TUBE', 'SACHET', 'INJECTION', 'AMPOULE'];
          const validGstRates: number[] = [0, 5, 12, 18, 28];

          // Process each row
          const products: UploadedProduct[] = [];
          const errors: RowError[] = [];

          validData.forEach((row, index) => {
            const product: UploadedProduct = {};
            const rowErrors: string[] = [];

            // Map columns to product fields
            templateColumns.forEach(col => {
              const rawValue = row[col.header];
              const value = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';

              // Check required fields
              if (col.required && !value) {
                rowErrors.push(`${col.header} is required`);
                return;
              }

              // Process value based on field
              if (value !== undefined && value !== '') {
                switch (col.field) {
                  case 'quantity':
                  case 'free_quantity':
                  case 'units_per_pack':
                  case 'number_of_packs':
                  case 'loose_units':
                    product[col.field] = parseInt(value) || 0;
                    break;
                  case 'mrp':
                  case 'cost_price':
                  case 'sale_price':
                    product[col.field] = parseFloat(value) || 0;
                    break;
                  case 'gst_percent':
                    const gst = parseFloat(value) || 0;
                    // Allow common GST rates, default to 12 if invalid
                    if (gst && !validGstRates.includes(gst)) {
                      // Don't error, just default to 12%
                      product[col.field] = 12;
                    } else {
                      product[col.field] = gst || 0;  // No default GST
                    }
                    break;
                  case 'discount_percent':
                    product[col.field] = parseFloat(value) || 0;
                    break;
                  case 'pack_type':
                    // Normalize pack type - handle any case variation
                    const packType = value.toUpperCase().trim();
                    // Try to match common variations
                    const packTypeMap: Record<string, string> = {
                      'STRIPS': 'STRIP',
                      'BOXES': 'BOX',
                      'BOTTLES': 'BOTTLE',
                      'VIALS': 'VIAL',
                      'TUBES': 'TUBE',
                      'SACHETS': 'SACHET',
                      'INJECTIONS': 'INJECTION',
                      'INJECTION': 'INJECTION',
                      'AMPOULES': 'AMPOULE',
                      'AMP': 'AMPOULE',
                      'INJ': 'INJECTION'
                    };
                    const normalizedType = packTypeMap[packType] || packType;

                    // If still not valid, default to STRIP
                    if (normalizedType && validPackTypes.includes(normalizedType)) {
                      product[col.field] = normalizedType;
                    } else {
                      product[col.field] = 'STRIP'; // Default
                    }
                    break;
                  case 'schedule_type':
                    // Normalize schedule type
                    const schedule = value.toUpperCase().trim();
                    const validSchedules: string[] = ['OTC', 'H', 'H1', 'X', 'G', 'J'];
                    if (schedule && validSchedules.includes(schedule)) {
                      product[col.field] = schedule === 'OTC' ? '' : schedule;
                    } else {
                      product[col.field] = ''; // Default to OTC
                    }
                    break;
                  case 'storage_condition':
                    // Normalize storage condition
                    const storage = value.toLowerCase().trim();
                    const storageMap: Record<string, string> = {
                      'room temperature': 'Room Temperature',
                      'room temp': 'Room Temperature',
                      'cool & dry': 'Cool & Dry',
                      'cool and dry': 'Cool & Dry',
                      'cool': 'Cool & Dry',
                      'refrigerated': 'Refrigerated (2-8°C)',
                      'refrigerated (2-8°c)': 'Refrigerated (2-8°C)',
                      'fridge': 'Refrigerated (2-8°C)',
                      'frozen': 'Frozen (-20°C)',
                      'frozen (-20°c)': 'Frozen (-20°C)',
                      'freezer': 'Frozen (-20°C)'
                    };
                    product[col.field] = storageMap[storage] || 'Cool & Dry';
                    break;
                  case 'expiry_date':
                    // Convert MM/YYYY to YYYY-MM-DD
                    const parts = value.split('/');
                    const month = parts[0];
                    const year = parts[1];
                    if (month && year) {
                      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
                      product[col.field] = `${year}-${month.padStart(2, '0')}-${lastDay}`;
                    } else {
                      rowErrors.push('Expiry date must be in MM/YYYY format');
                    }
                    break;
                  default:
                    product[col.field] = value.trim() || '';
                }
              }
            });

            // Set defaults for all fields
            if (!product.batch_number) {
              const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
              product.batch_number = `AUTO-${dateStr}-${(index + 1).toString().padStart(3, '0')}`;
            }

            if (!product.gst_percent) product.gst_percent = 0;  // No default GST
            if (!product.sale_price && product.mrp) product.sale_price = product.mrp;
            if (!product.pack_type) product.pack_type = 'STRIP';
            if (!product.units_per_pack) product.units_per_pack = 10;
            if (!product.schedule_type) product.schedule_type = ''; // OTC
            if (!product.storage_condition) product.storage_condition = 'Cool & Dry';
            if (!product.hsn_code) product.hsn_code = '3004'; // Default pharma HSN

            // Add to products if no errors
            if (rowErrors.length === 0) {
              products.push({
                ...product,
                // Map fields for purchase items
                batch_no: product.batch_number,
                tax_percent: product.gst_percent,
                tax_amount: 0,
                selling_price: product.sale_price,
                purchase_price: product.cost_price,
                pack_size: product.units_per_pack,
                id: Date.now() + index + Math.random(),
                // Ensure product_id is null for new products
                product_id: null
              });
            } else {
              errors.push({ row: index + 2, errors: rowErrors });
            }
          });

          // Show errors if any
          if (errors.length > 0) {
            const errorMsg = errors.slice(0, 3)
              .map(e => `Row ${e.row}: ${e.errors.join(', ')}`)
              .join('\n');
            toast.error(`Validation errors:\n${errorMsg}`);
          }

          // Add products to purchase
          if (products.length > 0) {
            onProductsUploaded(products);
            toast.success(`Added ${products.length} products from Excel`);
          }

        } catch (error) {
          toast.error('Failed to parse Excel file');
        } finally {
          setUploading(false);
          // Reset file input
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };

      reader.readAsArrayBuffer(file);

    } catch (error) {
      toast.error('Failed to read file');
      setUploading(false);
    }
  };

  const [showMenu, setShowMenu] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <div className="relative" ref={menuRef}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploading}
      />

      {/* Single button with dropdown */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={uploading}
        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        title="Bulk upload products from Excel"
      >
        {uploading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk Upload</span>
          </>
        )}
      </button>

      {/* Dropdown menu */}
      {showMenu && !uploading && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
          <button
            onClick={() => {
              fileInputRef.current?.click();
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-t-lg"
          >
            <Upload className="w-4 h-4 text-gray-600" />
            Upload Excel File
          </button>
          <button
            onClick={() => {
              downloadTemplate();
              setShowMenu(false);
            }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 rounded-b-lg border-t border-gray-100"
          >
            <Download className="w-4 h-4 text-gray-600" />
            Download Template
          </button>
        </div>
      )}
    </div>
  );
};

export default BulkUploadInline;