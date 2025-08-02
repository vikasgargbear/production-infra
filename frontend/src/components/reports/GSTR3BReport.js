import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Calendar, 
  X,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import { salesApi, purchasesApi, paymentsApi } from '../../services/api';
import * as XLSX from 'xlsx';

const GSTR3BReport = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  
  const [gstr3bData, setGstr3bData] = useState({
    // 3.1 Details of Outward Supplies
    outwardSupplies: {
      taxable: {
        integrated: 0,
        central: 0,
        state: 0,
        cess: 0
      },
      zeroRated: {
        integrated: 0,
        cess: 0
      },
      exempted: 0,
      nilRated: 0
    },
    // 3.2 Inter-state supplies
    interStateSupplies: {
      unregistered: 0,
      composition: 0,
      uin: 0
    },
    // 4 Eligible ITC
    eligibleITC: {
      integrated: 0,
      central: 0,
      state: 0,
      cess: 0
    },
    // 5 Values of exempt, nil and non-GST inward supplies
    inwardSupplies: {
      exempted: 0,
      nilRated: 0,
      nonGST: 0
    },
    // Payment of tax
    taxPayment: {
      integrated: 0,
      central: 0,
      state: 0,
      cess: 0,
      interest: 0,
      lateFee: 0
    }
  });

  useEffect(() => {
    if (open) {
      loadGSTR3BData();
    }
  }, [open, dateRange]);

  const loadGSTR3BData = async () => {
    setLoading(true);
    try {
      const [salesResponse, purchasesResponse] = await Promise.all([
        salesApi.getAll({
          start_date: dateRange.startDate,
          end_date: dateRange.endDate
        }),
        purchasesApi.getAll({
          start_date: dateRange.startDate,
          end_date: dateRange.endDate
        })
      ]);

      const sales = salesResponse.data || [];
      const purchases = purchasesResponse.data || [];

      processGSTR3BData(sales, purchases);
    } catch (error) {
      console.error('Error loading GSTR-3B data:', error);
    } finally {
      setLoading(false);
    }
  };

  const processGSTR3BData = (sales, purchases) => {
    const data = {
      outwardSupplies: {
        taxable: {
          integrated: 0,
          central: 0,
          state: 0,
          cess: 0
        },
        zeroRated: {
          integrated: 0,
          cess: 0
        },
        exempted: 0,
        nilRated: 0
      },
      interStateSupplies: {
        unregistered: 0,
        composition: 0,
        uin: 0
      },
      eligibleITC: {
        integrated: 0,
        central: 0,
        state: 0,
        cess: 0
      },
      inwardSupplies: {
        exempted: 0,
        nilRated: 0,
        nonGST: 0
      },
      taxPayment: {
        integrated: 0,
        central: 0,
        state: 0,
        cess: 0,
        interest: 0,
        lateFee: 0
      }
    };

    // Process sales for outward supplies
    sales.forEach(sale => {
      const taxableAmount = sale.total_amount || 0;
      const cgst = sale.cgst_amount || 0;
      const sgst = sale.sgst_amount || 0;
      const igst = sale.igst_amount || 0;

      if (igst > 0) {
        data.outwardSupplies.taxable.integrated += taxableAmount;
        data.taxPayment.integrated += igst;
        
        // Inter-state to unregistered
        if (!sale.customer_gstin) {
          data.interStateSupplies.unregistered += taxableAmount;
        }
      } else {
        data.outwardSupplies.taxable.central += taxableAmount;
        data.outwardSupplies.taxable.state += taxableAmount;
        data.taxPayment.central += cgst;
        data.taxPayment.state += sgst;
      }
    });

    // Process purchases for ITC
    purchases.forEach(purchase => {
      const cgst = purchase.cgst_amount || 0;
      const sgst = purchase.sgst_amount || 0;
      const igst = purchase.igst_amount || 0;

      if (igst > 0) {
        data.eligibleITC.integrated += igst;
      } else {
        data.eligibleITC.central += cgst;
        data.eligibleITC.state += sgst;
      }
    });

    // Calculate net tax payable
    data.taxPayment.integrated -= data.eligibleITC.integrated;
    data.taxPayment.central -= data.eligibleITC.central;
    data.taxPayment.state -= data.eligibleITC.state;

    setGstr3bData(data);
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['GSTR-3B Summary for ' + new Date(dateRange.startDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })],
      [],
      ['3.1 Details of Outward Supplies and inward supplies liable to reverse charge'],
      ['Nature of Supplies', 'Total Taxable Value', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'],
      [
        '(a) Outward taxable supplies',
        gstr3bData.outwardSupplies.taxable.integrated + gstr3bData.outwardSupplies.taxable.central,
        gstr3bData.taxPayment.integrated > 0 ? gstr3bData.taxPayment.integrated : 0,
        gstr3bData.taxPayment.central > 0 ? gstr3bData.taxPayment.central : 0,
        gstr3bData.taxPayment.state > 0 ? gstr3bData.taxPayment.state : 0,
        0
      ],
      ['(b) Outward taxable supplies (zero rated)', gstr3bData.outwardSupplies.zeroRated.integrated, 0, 0, 0, 0],
      ['(c) Other outward supplies (Nil, exempted)', gstr3bData.outwardSupplies.exempted + gstr3bData.outwardSupplies.nilRated, 0, 0, 0, 0],
      ['(d) Inward supplies (liable to reverse charge)', 0, 0, 0, 0, 0],
      ['(e) Non-GST outward supplies', 0, 0, 0, 0, 0],
      [],
      ['3.2 Of the supplies shown in 3.1 (a) above, details of inter-State supplies made'],
      ['Place of Supply (State/UT)', 'Total Taxable Value', 'Amount of Integrated Tax'],
      ['Supplies made to Unregistered Persons', gstr3bData.interStateSupplies.unregistered, 0],
      ['Supplies made to Composition Taxable Persons', gstr3bData.interStateSupplies.composition, 0],
      ['Supplies made to UIN holders', gstr3bData.interStateSupplies.uin, 0],
      [],
      ['4. Eligible ITC'],
      ['Details', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'],
      ['(A) ITC Available', gstr3bData.eligibleITC.integrated, gstr3bData.eligibleITC.central, gstr3bData.eligibleITC.state, 0],
      ['(B) ITC Reversed', 0, 0, 0, 0],
      ['(C) Net ITC Available', gstr3bData.eligibleITC.integrated, gstr3bData.eligibleITC.central, gstr3bData.eligibleITC.state, 0],
      [],
      ['5. Payment of Tax'],
      ['Description', 'Tax Payable', 'Paid through ITC', 'Tax/Cess Paid in Cash', 'Interest', 'Late Fee'],
      ['Integrated Tax', 
        gstr3bData.taxPayment.integrated > 0 ? gstr3bData.taxPayment.integrated : 0,
        gstr3bData.eligibleITC.integrated,
        Math.max(0, gstr3bData.taxPayment.integrated),
        0, 0
      ],
      ['Central Tax',
        gstr3bData.taxPayment.central > 0 ? gstr3bData.taxPayment.central : 0,
        gstr3bData.eligibleITC.central,
        Math.max(0, gstr3bData.taxPayment.central),
        0, 0
      ],
      ['State/UT Tax',
        gstr3bData.taxPayment.state > 0 ? gstr3bData.taxPayment.state : 0,
        gstr3bData.eligibleITC.state,
        Math.max(0, gstr3bData.taxPayment.state),
        0, 0
      ]
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B Summary');

    const filename = `GSTR3B_${dateRange.startDate.substring(0, 7)}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportJSON = () => {
    const jsonData = {
      gstin: localStorage.getItem('companyGSTIN') || '',
      ret_period: dateRange.startDate.substring(0, 7).replace('-', ''),
      sup_details: {
        osup_det: {
          txval: gstr3bData.outwardSupplies.taxable.integrated + gstr3bData.outwardSupplies.taxable.central,
          iamt: gstr3bData.taxPayment.integrated > 0 ? gstr3bData.taxPayment.integrated : 0,
          camt: gstr3bData.taxPayment.central > 0 ? gstr3bData.taxPayment.central : 0,
          samt: gstr3bData.taxPayment.state > 0 ? gstr3bData.taxPayment.state : 0,
          csamt: 0
        },
        osup_zero: {
          txval: gstr3bData.outwardSupplies.zeroRated.integrated,
          iamt: 0,
          csamt: 0
        },
        osup_nil_exmp: {
          txval: gstr3bData.outwardSupplies.exempted + gstr3bData.outwardSupplies.nilRated
        },
        osup_nongst: {
          txval: 0
        }
      },
      inter_sup: {
        unreg_details: {
          txval: gstr3bData.interStateSupplies.unregistered,
          iamt: 0
        },
        comp_details: {
          txval: gstr3bData.interStateSupplies.composition,
          iamt: 0
        },
        uin_details: {
          txval: gstr3bData.interStateSupplies.uin,
          iamt: 0
        }
      },
      itc_elg: {
        itc_avl: [
          {
            ty: 'IMPG',
            iamt: gstr3bData.eligibleITC.integrated,
            camt: gstr3bData.eligibleITC.central,
            samt: gstr3bData.eligibleITC.state,
            csamt: 0
          }
        ],
        itc_net: {
          iamt: gstr3bData.eligibleITC.integrated,
          camt: gstr3bData.eligibleITC.central,
          samt: gstr3bData.eligibleITC.state,
          csamt: 0
        }
      }
    };

    const blob = new Blob([JSON.stringify(jsonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR3B_${dateRange.startDate.substring(0, 7)}.json`;
    a.click();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">GSTR-3B Report</h1>
              <p className="text-gray-600 mt-1">Monthly summary return for GST</p>
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
            <div className="space-y-6">
              {/* Tax Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-sm text-blue-600 font-medium">Output Tax</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    ₹{(gstr3bData.taxPayment.integrated + gstr3bData.taxPayment.central + gstr3bData.taxPayment.state).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-green-600 font-medium">Input Tax Credit</p>
                  <p className="text-2xl font-bold text-green-900 mt-1">
                    ₹{(gstr3bData.eligibleITC.integrated + gstr3bData.eligibleITC.central + gstr3bData.eligibleITC.state).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-sm text-purple-600 font-medium">Net Tax Payable</p>
                  <p className="text-2xl font-bold text-purple-900 mt-1">
                    ₹{Math.max(0, (gstr3bData.taxPayment.integrated + gstr3bData.taxPayment.central + gstr3bData.taxPayment.state)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <p className="text-sm text-orange-600 font-medium">Outward Supplies</p>
                  <p className="text-2xl font-bold text-orange-900 mt-1">
                    ₹{(gstr3bData.outwardSupplies.taxable.integrated + gstr3bData.outwardSupplies.taxable.central).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* 3.1 Outward Supplies */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">3.1 Details of Outward Supplies</h3>
                </div>
                <div className="p-6">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Nature of Supplies</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Total Taxable Value</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Integrated Tax</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Central Tax</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">State/UT Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">(a) Outward taxable supplies</td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.outwardSupplies.taxable.integrated + gstr3bData.outwardSupplies.taxable.central).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.taxPayment.integrated > 0 ? gstr3bData.taxPayment.integrated : 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.taxPayment.central > 0 ? gstr3bData.taxPayment.central : 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.taxPayment.state > 0 ? gstr3bData.taxPayment.state : 0).toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">(b) Outward taxable supplies (zero rated)</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.outwardSupplies.zeroRated.integrated.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                      </tr>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">(c) Other outward supplies (Nil, exempted)</td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.outwardSupplies.exempted + gstr3bData.outwardSupplies.nilRated).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Eligible ITC */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">4. Eligible ITC</h3>
                </div>
                <div className="p-6">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Details</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Integrated Tax</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Central Tax</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">State/UT Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">(A) ITC Available</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.integrated.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.central.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.state.toFixed(2)}</td>
                      </tr>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">(B) ITC Reversed</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                        <td className="py-3 px-4 text-sm text-right">₹0.00</td>
                      </tr>
                      <tr className="border-b hover:bg-gray-50 font-semibold">
                        <td className="py-3 px-4 text-sm">(C) Net ITC Available</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.integrated.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.central.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.state.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 5. Payment of Tax */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">5. Payment of Tax</h3>
                </div>
                <div className="p-6">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Description</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Tax Payable</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Paid through ITC</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Tax Paid in Cash</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">Integrated Tax</td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.taxPayment.integrated > 0 ? gstr3bData.taxPayment.integrated : 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.integrated.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right font-semibold">
                          ₹{Math.max(0, gstr3bData.taxPayment.integrated).toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">Central Tax</td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.taxPayment.central > 0 ? gstr3bData.taxPayment.central : 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.central.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right font-semibold">
                          ₹{Math.max(0, gstr3bData.taxPayment.central).toFixed(2)}
                        </td>
                      </tr>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm">State/UT Tax</td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.taxPayment.state > 0 ? gstr3bData.taxPayment.state : 0).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">₹{gstr3bData.eligibleITC.state.toFixed(2)}</td>
                        <td className="py-3 px-4 text-sm text-right font-semibold">
                          ₹{Math.max(0, gstr3bData.taxPayment.state).toFixed(2)}
                        </td>
                      </tr>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="py-3 px-4 text-sm">Total</td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(
                            (gstr3bData.taxPayment.integrated > 0 ? gstr3bData.taxPayment.integrated : 0) +
                            (gstr3bData.taxPayment.central > 0 ? gstr3bData.taxPayment.central : 0) +
                            (gstr3bData.taxPayment.state > 0 ? gstr3bData.taxPayment.state : 0)
                          ).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{(gstr3bData.eligibleITC.integrated + gstr3bData.eligibleITC.central + gstr3bData.eligibleITC.state).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-sm text-right">
                          ₹{Math.max(0, gstr3bData.taxPayment.integrated + gstr3bData.taxPayment.central + gstr3bData.taxPayment.state).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GSTR3BReport;