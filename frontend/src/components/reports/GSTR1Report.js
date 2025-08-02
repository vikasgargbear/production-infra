import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Calendar, 
  Filter,
  Search,
  X,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { salesApi, customersApi } from '../../services/api';
import * as XLSX from 'xlsx';

const GSTR1Report = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [gstSummary, setGstSummary] = useState({
    b2b: [], // Business to Business
    b2c: [], // Business to Consumer
    hsn: [], // HSN Summary
    docs: [] // Document Summary
  });

  useEffect(() => {
    if (open) {
      loadSalesData();
    }
  }, [open, dateRange]);

  const loadSalesData = async () => {
    setLoading(true);
    try {
      const response = await salesApi.getAll({
        start_date: dateRange.startDate,
        end_date: dateRange.endDate
      });
      
      const sales = response.data || [];
      setSalesData(sales);
      processGSTR1Data(sales);
    } catch (error) {
      console.error('Error loading sales data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processGSTR1Data = (sales) => {
    const b2bSales = [];
    const b2cSales = [];
    const hsnSummary = {};
    const docSummary = {
      invoices: sales.length,
      cancelledInvoices: 0,
      totalValue: 0,
      totalTaxable: 0,
      totalCGST: 0,
      totalSGST: 0,
      totalIGST: 0
    };

    sales.forEach(sale => {
      const taxableAmount = sale.total_amount || 0;
      const cgst = sale.cgst_amount || 0;
      const sgst = sale.sgst_amount || 0;
      const igst = sale.igst_amount || 0;
      const totalValue = taxableAmount + cgst + sgst + igst;

      docSummary.totalValue += totalValue;
      docSummary.totalTaxable += taxableAmount;
      docSummary.totalCGST += cgst;
      docSummary.totalSGST += sgst;
      docSummary.totalIGST += igst;

      // Check if B2B or B2C based on GSTIN
      if (sale.customer_gstin) {
        b2bSales.push({
          gstin: sale.customer_gstin,
          receiverName: sale.customer_name,
          invoiceNumber: sale.invoice_no,
          invoiceDate: sale.invoice_date,
          invoiceValue: totalValue,
          placeOfSupply: sale.place_of_supply || sale.state_code || '29', // Default Karnataka
          reverseCharge: 'N',
          invoiceType: 'Regular',
          taxableValue: taxableAmount,
          rate: sale.gst_percent || 18,
          cgst: cgst,
          sgst: sgst,
          igst: igst
        });
      } else {
        // B2C - aggregate by tax rate
        const rateKey = `${sale.gst_percent || 18}%`;
        const existing = b2cSales.find(item => item.rate === rateKey);
        if (existing) {
          existing.taxableValue += taxableAmount;
          existing.cgst += cgst;
          existing.sgst += sgst;
          existing.igst += igst;
          existing.totalValue += totalValue;
        } else {
          b2cSales.push({
            rate: rateKey,
            taxableValue: taxableAmount,
            cgst: cgst,
            sgst: sgst,
            igst: igst,
            totalValue: totalValue
          });
        }
      }

      // Process HSN Summary
      if (sale.items) {
        sale.items.forEach(item => {
          const hsnCode = item.hsn_code || '3004';
          if (!hsnSummary[hsnCode]) {
            hsnSummary[hsnCode] = {
              hsn: hsnCode,
              description: item.product_name || 'Pharmaceutical Products',
              uqc: 'NOS',
              totalQuantity: 0,
              totalValue: 0,
              taxableValue: 0,
              cgst: 0,
              sgst: 0,
              igst: 0
            };
          }
          
          const itemTaxable = item.amount || 0;
          const itemCgst = (itemTaxable * (item.cgst_percent || 9)) / 100;
          const itemSgst = (itemTaxable * (item.sgst_percent || 9)) / 100;
          const itemIgst = (itemTaxable * (item.igst_percent || 0)) / 100;
          
          hsnSummary[hsnCode].totalQuantity += item.quantity || 0;
          hsnSummary[hsnCode].taxableValue += itemTaxable;
          hsnSummary[hsnCode].cgst += itemCgst;
          hsnSummary[hsnCode].sgst += itemSgst;
          hsnSummary[hsnCode].igst += itemIgst;
          hsnSummary[hsnCode].totalValue += itemTaxable + itemCgst + itemSgst + itemIgst;
        });
      }
    });

    setGstSummary({
      b2b: b2bSales,
      b2c: b2cSales,
      hsn: Object.values(hsnSummary),
      docs: docSummary
    });
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // B2B Sheet
    const b2bData = gstSummary.b2b.map(item => ({
      'GSTIN of Recipient': item.gstin,
      'Receiver Name': item.receiverName,
      'Invoice Number': item.invoiceNumber,
      'Invoice Date': new Date(item.invoiceDate).toLocaleDateString('en-IN'),
      'Invoice Value': item.invoiceValue.toFixed(2),
      'Place Of Supply': item.placeOfSupply,
      'Reverse Charge': item.reverseCharge,
      'Invoice Type': item.invoiceType,
      'Rate': item.rate,
      'Taxable Value': item.taxableValue.toFixed(2),
      'CGST': item.cgst.toFixed(2),
      'SGST': item.sgst.toFixed(2),
      'IGST': item.igst.toFixed(2)
    }));
    
    if (b2bData.length > 0) {
      const b2bSheet = XLSX.utils.json_to_sheet(b2bData);
      XLSX.utils.book_append_sheet(wb, b2bSheet, 'B2B');
    }

    // B2C Sheet
    const b2cData = gstSummary.b2c.map(item => ({
      'Type': 'OE',
      'Place Of Supply': '29-Karnataka',
      'Rate': item.rate,
      'Taxable Value': item.taxableValue.toFixed(2),
      'CGST': item.cgst.toFixed(2),
      'SGST': item.sgst.toFixed(2),
      'IGST': item.igst.toFixed(2),
      'Total Value': item.totalValue.toFixed(2)
    }));
    
    if (b2cData.length > 0) {
      const b2cSheet = XLSX.utils.json_to_sheet(b2cData);
      XLSX.utils.book_append_sheet(wb, b2cSheet, 'B2C');
    }

    // HSN Summary Sheet
    const hsnData = gstSummary.hsn.map(item => ({
      'HSN': item.hsn,
      'Description': item.description,
      'UQC': item.uqc,
      'Total Quantity': item.totalQuantity,
      'Total Value': item.totalValue.toFixed(2),
      'Taxable Value': item.taxableValue.toFixed(2),
      'CGST': item.cgst.toFixed(2),
      'SGST': item.sgst.toFixed(2),
      'IGST': item.igst.toFixed(2)
    }));
    
    if (hsnData.length > 0) {
      const hsnSheet = XLSX.utils.json_to_sheet(hsnData);
      XLSX.utils.book_append_sheet(wb, hsnSheet, 'HSN');
    }

    // Document Summary Sheet
    const docData = [{
      'Nature of Document': 'Invoices for outward supply',
      'No. of Documents': gstSummary.docs.invoices,
      'No. of Cancelled': gstSummary.docs.cancelledInvoices,
      'Total Value': gstSummary.docs.totalValue.toFixed(2),
      'Total Taxable': gstSummary.docs.totalTaxable.toFixed(2),
      'Total CGST': gstSummary.docs.totalCGST.toFixed(2),
      'Total SGST': gstSummary.docs.totalSGST.toFixed(2),
      'Total IGST': gstSummary.docs.totalIGST.toFixed(2)
    }];
    
    const docSheet = XLSX.utils.json_to_sheet(docData);
    XLSX.utils.book_append_sheet(wb, docSheet, 'Document Summary');

    // Generate filename with date range
    const startMonth = new Date(dateRange.startDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    const filename = `GSTR1_${startMonth}.xlsx`;
    
    XLSX.writeFile(wb, filename);
  };

  const exportJSON = () => {
    const jsonData = {
      gstin: localStorage.getItem('companyGSTIN') || '',
      fp: dateRange.startDate.substring(0, 7).replace('-', ''),
      b2b: gstSummary.b2b,
      b2cs: gstSummary.b2c,
      hsn: {
        data: gstSummary.hsn
      },
      doc_issue: {
        doc_det: [{
          doc_num: 1,
          docs: gstSummary.docs
        }]
      }
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_${dateRange.startDate.substring(0, 7)}.json`;
    a.click();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GSTR-1 Report</h1>
              <p className="text-gray-600 mt-1">Details of outward supplies of goods or services</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-8 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <input
                type="month"
                value={dateRange.startDate.substring(0, 7)}
                onChange={(e) => {
                  const [year, month] = e.target.value.split('-');
                  const startDate = new Date(year, month - 1, 1);
                  const endDate = new Date(year, month, 0);
                  setDateRange({
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                  });
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1" />
            <button
              onClick={exportJSON}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600 font-medium">Total Invoice Value</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    ₹{gstSummary.docs.totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">Total Taxable</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">
                    ₹{gstSummary.docs.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600 font-medium">Total GST</p>
                  <p className="text-2xl font-bold text-purple-900 mt-1">
                    ₹{(gstSummary.docs.totalCGST + gstSummary.docs.totalSGST + gstSummary.docs.totalIGST).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600 font-medium">Total Invoices</p>
                  <p className="text-2xl font-bold text-orange-900 mt-1">
                    {gstSummary.docs.invoices}
                  </p>
                </div>
              </div>

              {/* B2B Invoices */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">B2B Invoices</h3>
                  <p className="text-sm text-gray-600">Supplies to registered businesses</p>
                </div>
                <div className="p-6">
                  {gstSummary.b2b.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">GSTIN</th>
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Receiver</th>
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Invoice No</th>
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Date</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Taxable</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">CGST</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">SGST</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gstSummary.b2b.slice(0, 10).map((item, index) => (
                            <tr key={index} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-4 text-sm">{item.gstin}</td>
                              <td className="py-2 px-4 text-sm">{item.receiverName}</td>
                              <td className="py-2 px-4 text-sm">{item.invoiceNumber}</td>
                              <td className="py-2 px-4 text-sm">{new Date(item.invoiceDate).toLocaleDateString('en-IN')}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.taxableValue.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.cgst.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.sgst.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right font-medium">₹{item.invoiceValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {gstSummary.b2b.length > 10 && (
                        <p className="text-sm text-gray-600 mt-2 text-center">
                          Showing 10 of {gstSummary.b2b.length} records. Export to see all.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No B2B invoices found</p>
                  )}
                </div>
              </div>

              {/* B2C Summary */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">B2C Summary</h3>
                  <p className="text-sm text-gray-600">Supplies to unregistered persons</p>
                </div>
                <div className="p-6">
                  {gstSummary.b2c.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Tax Rate</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Taxable Value</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">CGST</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">SGST</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Total Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gstSummary.b2c.map((item, index) => (
                            <tr key={index} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-4 text-sm">{item.rate}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.taxableValue.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.cgst.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.sgst.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right font-medium">₹{item.totalValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No B2C sales found</p>
                  )}
                </div>
              </div>

              {/* HSN Summary */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">HSN Summary</h3>
                  <p className="text-sm text-gray-600">Summary of goods sold</p>
                </div>
                <div className="p-6">
                  {gstSummary.hsn.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">HSN Code</th>
                            <th className="text-left py-2 px-4 text-sm font-medium text-gray-700">Description</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Quantity</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Taxable Value</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Total Tax</th>
                            <th className="text-right py-2 px-4 text-sm font-medium text-gray-700">Total Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gstSummary.hsn.map((item, index) => (
                            <tr key={index} className="border-b hover:bg-gray-50">
                              <td className="py-2 px-4 text-sm">{item.hsn}</td>
                              <td className="py-2 px-4 text-sm">{item.description}</td>
                              <td className="py-2 px-4 text-sm text-right">{item.totalQuantity}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{item.taxableValue.toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right">₹{(item.cgst + item.sgst + item.igst).toFixed(2)}</td>
                              <td className="py-2 px-4 text-sm text-right font-medium">₹{item.totalValue.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-center text-gray-500 py-8">No HSN data found</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GSTR1Report;