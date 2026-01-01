import React, { useState, useEffect } from 'react';
import {
  FileText, Settings, BarChart3, Shield, Calculator, Calendar,
  ArrowLeft, Download, ExternalLink, AlertTriangle, CheckCircle,
  Clock, TrendingUp, DollarSign, FileCheck
} from 'lucide-react';
import { invoicesApi, purchasesAPI } from '../../services/api';

interface GSTModuleMainProps {
  onBack?: () => void;
}

interface GSTData {
  outputTax: number;
  inputCredit: number;
  netPayable: number;
  invoiceCount: number;
  purchaseCount: number;
  period: string;
  calculations: {
    b2bSales: { count: number; taxable: number; tax: number; };
    b2cSales: { count: number; taxable: number; tax: number; };
    purchases: { count: number; taxable: number; tax: number; };
  };
}

interface ComplianceItem {
  type: string;
  name: string;
  dueDate: string;
  status: 'due' | 'overdue' | 'filed';
  amount: number;
  description: string;
}

const GSTModuleMain: React.FC<GSTModuleMainProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'filing' | 'reports' | 'compliance'>('dashboard');
  const [gstData, setGstData] = useState<GSTData | null>(null);
  const [loading, setLoading] = useState(true);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);

  // Load real GST data from invoices
  const loadRealGSTData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const toDate = now.toISOString().split('T')[0];
      const period = `${now.toLocaleString('default', { month: 'long' })} ${now.getFullYear()}`;

      const [invoicesRes, purchasesRes] = await Promise.all([
        invoicesApi.search({ dateFrom: fromDate, dateTo: toDate, limit: 1000 }).catch(() => ({ data: { invoices: [] } })),
        purchasesAPI.getAll({ start_date: fromDate, end_date: toDate, limit: 1000 }).catch(() => ({ data: [] }))
      ]);

      const invoices = invoicesRes.data?.invoices || [];
      const purchases = purchasesRes.data || [];

      // Calculate real GST amounts
      let outputTax = 0;
      let inputCredit = 0;
      let b2bSales = { count: 0, taxable: 0, tax: 0 };
      let b2cSales = { count: 0, taxable: 0, tax: 0 };
      let purchaseCalc = { count: 0, taxable: 0, tax: 0 };

      // Process sales invoices
      invoices.forEach((invoice: any) => {
        const cgst = parseFloat(invoice.cgst_amount || 0);
        const sgst = parseFloat(invoice.sgst_amount || 0);
        const igst = parseFloat(invoice.igst_amount || 0);
        const totalTax = cgst + sgst + igst;
        const taxable = parseFloat(invoice.subtotal_amount || 0);

        outputTax += totalTax;

        if (invoice.gstin || invoice.customer_gstin) {
          b2bSales.count++;
          b2bSales.taxable += taxable;
          b2bSales.tax += totalTax;
        } else {
          b2cSales.count++;
          b2cSales.taxable += taxable;
          b2cSales.tax += totalTax;
        }
      });

      // Process purchase invoices for input credit
      purchases.forEach((purchase: any) => {
        if (purchase.itc_eligible !== false) {
          const cgst = parseFloat(purchase.cgst_amount || 0);
          const sgst = parseFloat(purchase.sgst_amount || 0);
          const igst = parseFloat(purchase.igst_amount || 0);
          const totalTax = cgst + sgst + igst;
          const taxable = parseFloat(purchase.subtotal_amount || 0);

          inputCredit += totalTax;
          purchaseCalc.count++;
          purchaseCalc.taxable += taxable;
          purchaseCalc.tax += totalTax;
        }
      });

      setGstData({
        outputTax,
        inputCredit,
        netPayable: outputTax - inputCredit,
        invoiceCount: invoices.length,
        purchaseCount: purchases.length,
        period,
        calculations: {
          b2bSales,
          b2cSales,
          purchases: purchaseCalc
        }
      });

      // Set compliance items with real due dates
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1);
      const gstr1Due = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 11);
      const gstr3bDue = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 20);

      setComplianceItems([
        {
          type: 'GSTR-1',
          name: 'Outward Supplies Return',
          dueDate: gstr1Due.toLocaleDateString(),
          status: 'due',
          amount: outputTax,
          description: 'Details of outward supplies made during the month'
        },
        {
          type: 'GSTR-3B',
          name: 'Summary Return',
          dueDate: gstr3bDue.toLocaleDateString(),
          status: 'due',
          amount: outputTax - inputCredit,
          description: 'Monthly summary return with tax payment'
        }
      ]);

    } catch (error) {
      console.error('Error loading GST data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRealGSTData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(Math.abs(amount));
  };

  // Dashboard Tab
  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Output Tax</h3>
            <TrendingUp className="w-5 h-5 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {gstData ? formatCurrency(gstData.outputTax) : '₹0'}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            From {gstData?.invoiceCount || 0} invoices
          </p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Input Credit</h3>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {gstData ? formatCurrency(gstData.inputCredit) : '₹0'}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            From {gstData?.purchaseCount || 0} purchases
          </p>
        </div>

        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Net Payable</h3>
            <Calculator className="w-5 h-5 text-blue-500" />
          </div>
          <div className={`text-2xl font-bold ${gstData && gstData.netPayable < 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {gstData ? (gstData.netPayable < 0 ? '- ' : '') + formatCurrency(gstData.netPayable) : '₹0'}
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {gstData && gstData.netPayable < 0 ? 'Refund due' : 'Tax payable'}
          </p>
        </div>
      </div>

      {/* Transaction Breakdown */}
      {gstData && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Transaction Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900">B2B Sales</h4>
              <p className="text-sm text-blue-700 mt-1">{gstData.calculations.b2bSales.count} transactions</p>
              <p className="text-lg font-semibold text-blue-900">{formatCurrency(gstData.calculations.b2bSales.tax)}</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900">B2C Sales</h4>
              <p className="text-sm text-green-700 mt-1">{gstData.calculations.b2cSales.count} transactions</p>
              <p className="text-lg font-semibold text-green-900">{formatCurrency(gstData.calculations.b2cSales.tax)}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <h4 className="font-medium text-purple-900">Purchases (ITC)</h4>
              <p className="text-sm text-purple-700 mt-1">{gstData.calculations.purchases.count} transactions</p>
              <p className="text-lg font-semibold text-purple-900">{formatCurrency(gstData.calculations.purchases.tax)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  // Filing Tab - Honest approach, no fake success
  const renderFiling = () => (
    <div className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="w-5 h-5 text-amber-600 mr-3 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-900">How GST Filing Actually Works</h4>
            <p className="text-sm text-amber-700 mt-1">
              We calculate your GST liability based on your invoices. To file returns, you must visit the official GST portal.
            </p>
          </div>
        </div>
      </div>

      {complianceItems.map((item) => (
        <div key={item.type} className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{item.type}</h3>
              <p className="text-sm text-gray-500">{item.description}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${item.status === 'due' ? 'bg-amber-100 text-amber-800' :
                item.status === 'overdue' ? 'bg-red-100 text-red-800' :
                  'bg-green-100 text-green-800'
              }`}>
              Due {item.dueDate}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <p className="text-sm text-gray-500">Tax Amount</p>
              <p className="text-xl font-semibold text-gray-900">{formatCurrency(item.amount)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Period</p>
              <p className="text-lg text-gray-900">{gstData?.period || 'Current Month'}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => alert('Feature coming soon: This will generate a JSON file for manual upload to GST portal')}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Download className="w-4 h-4 mr-2" />
              Download JSON
            </button>
            <button
              onClick={() => window.open('https://services.gst.gov.in/services/login', '_blank')}
              className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to GST Portal
            </button>
          </div>
        </div>
      ))}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">Filing Steps:</h4>
        <ol className="text-sm text-blue-700 space-y-1">
          <li>1. Download the JSON file with your calculated data</li>
          <li>2. Visit the official GST portal (services.gst.gov.in)</li>
          <li>3. Login with your GSTIN credentials</li>
          <li>4. Upload the JSON file to the appropriate return section</li>
          <li>5. Review, verify, and submit your return</li>
        </ol>
      </div>
    </div>
  );

  // Reports Tab
  const renderReports = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">GST Analysis Report</h3>

        {gstData && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-3">Sales Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">B2B Taxable Value:</span>
                    <span className="font-medium">{formatCurrency(gstData.calculations.b2bSales.taxable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">B2C Taxable Value:</span>
                    <span className="font-medium">{formatCurrency(gstData.calculations.b2cSales.taxable)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold border-t pt-2">
                    <span>Total Output Tax:</span>
                    <span>{formatCurrency(gstData.outputTax)}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-900 mb-3">Purchase Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Taxable Purchases:</span>
                    <span className="font-medium">{formatCurrency(gstData.calculations.purchases.taxable)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Eligible for ITC:</span>
                    <span className="font-medium">{gstData.calculations.purchases.count} invoices</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold border-t pt-2">
                    <span>Total Input Credit:</span>
                    <span>{formatCurrency(gstData.inputCredit)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center text-xl font-bold">
                <span>Net GST Position:</span>
                <span className={gstData.netPayable < 0 ? 'text-green-600' : 'text-red-600'}>
                  {gstData.netPayable < 0 ? '- ' : ''}{formatCurrency(gstData.netPayable)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {gstData.netPayable < 0 ? 'You are eligible for a refund' : 'Amount to be paid to government'}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
          <Download className="w-4 h-4 mr-2" />
          Export to Excel
        </button>
        <button className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
          <FileText className="w-4 h-4 mr-2" />
          Export to PDF
        </button>
      </div>
    </div>
  );

  // Compliance Tab
  const renderCompliance = () => (
    <div className="space-y-6">
      {/* Settings Section */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">GST Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">GSTIN</label>
            <input
              type="text"
              placeholder="Enter your 15-digit GSTIN"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
              <option value="">Select State</option>
              <option value="01">Jammu and Kashmir</option>
              <option value="02">Himachal Pradesh</option>
              <option value="03">Punjab</option>
              <option value="04">Chandigarh</option>
              <option value="05">Uttarakhand</option>
              <option value="06">Haryana</option>
              <option value="07">Delhi</option>
              <option value="08">Rajasthan</option>
              <option value="09">Uttar Pradesh</option>
              <option value="10">Bihar</option>
              <option value="11">Sikkim</option>
              <option value="12">Arunachal Pradesh</option>
              <option value="13">Nagaland</option>
              <option value="14">Manipur</option>
              <option value="15">Mizoram</option>
              <option value="16">Tripura</option>
              <option value="17">Meghalaya</option>
              <option value="18">Assam</option>
              <option value="19">West Bengal</option>
              <option value="20">Jharkhand</option>
              <option value="21">Odisha</option>
              <option value="22">Chhattisgarh</option>
              <option value="23">Madhya Pradesh</option>
              <option value="24">Gujarat</option>
              <option value="25">Daman and Diu</option>
              <option value="26">Dadra and Nagar Haveli</option>
              <option value="27">Maharashtra</option>
              <option value="29">Karnataka</option>
              <option value="30">Goa</option>
              <option value="31">Lakshadweep</option>
              <option value="32">Kerala</option>
              <option value="33">Tamil Nadu</option>
              <option value="34">Puducherry</option>
              <option value="35">Andaman and Nicobar Islands</option>
              <option value="36">Telangana</option>
              <option value="37">Andhra Pradesh</option>
            </select>
          </div>
        </div>
      </div>

      {/* Compliance Calendar */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Calendar</h3>
        <div className="space-y-4">
          {complianceItems.map((item) => (
            <div key={item.type} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <Calendar className="w-5 h-5 text-blue-500 mr-3" />
                <div>
                  <h4 className="font-medium text-gray-900">{item.name}</h4>
                  <p className="text-sm text-gray-500">Due: {item.dueDate}</p>
                </div>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${item.status === 'due' ? 'bg-amber-100 text-amber-800' :
                  item.status === 'overdue' ? 'bg-red-100 text-red-800' :
                    'bg-green-100 text-green-800'
                }`}>
                {item.status === 'due' ? 'Pending' : item.status === 'overdue' ? 'Overdue' : 'Filed'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Rates Configuration */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Default Tax Rates</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[0, 5, 12, 18, 28].map((rate) => (
            <div key={rate} className="text-center p-4 bg-gray-50 rounded-lg">
              <div className="text-2xl font-bold text-gray-900">{rate}%</div>
              <div className="text-sm text-gray-500">GST Rate</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600">Loading GST data from your invoices...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {onBack && (
                <button onClick={onBack} className="mr-3 p-1 hover:bg-gray-100 rounded">
                  <ArrowLeft className="w-5 h-5 text-gray-500" />
                </button>
              )}
              <div>
                <h1 className="text-xl font-semibold text-gray-900">GST Management</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {gstData?.period || 'Current Period'} • Real data from your invoices
                </p>
              </div>
            </div>
            <button
              onClick={loadRealGSTData}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh Data
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-t">
          <nav className="flex space-x-8 px-6">
            {[
              { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { key: 'filing', label: 'Filing', icon: FileText },
              { key: 'reports', label: 'Reports', icon: FileCheck },
              { key: 'compliance', label: 'Compliance & Settings', icon: Settings }
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center px-1 py-4 border-b-2 text-sm font-medium transition-colors ${activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'filing' && renderFiling()}
        {activeTab === 'reports' && renderReports()}
        {activeTab === 'compliance' && renderCompliance()}
      </div>
    </div>
  );
};

export default GSTModuleMain;