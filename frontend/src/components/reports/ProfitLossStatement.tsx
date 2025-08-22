import React, { useState } from 'react';
import { FileText, Download, Printer, Calendar, TrendingUp, TrendingDown } from 'lucide-react';

interface PLItem {
  label: string;
  amount: number;
  isHeader?: boolean;
  isSubtotal?: boolean;
  indent?: number;
}

const ProfitLossStatement: React.FC = () => {
  const [period, setPeriod] = useState('month');
  const [year, setYear] = useState('2024');
  const [month, setMonth] = useState('01');

  const plData: PLItem[] = [
    { label: 'REVENUE', amount: 0, isHeader: true },
    { label: 'Sales Revenue', amount: 2456780, indent: 1 },
    { label: 'Service Revenue', amount: 123450, indent: 1 },
    { label: 'Other Income', amount: 45670, indent: 1 },
    { label: 'Total Revenue', amount: 2625900, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'COST OF GOODS SOLD', amount: 0, isHeader: true },
    { label: 'Opening Stock', amount: 456780, indent: 1 },
    { label: 'Purchases', amount: 1234560, indent: 1 },
    { label: 'Direct Expenses', amount: 89450, indent: 1 },
    { label: 'Less: Closing Stock', amount: -523450, indent: 1 },
    { label: 'Total COGS', amount: 1257340, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'GROSS PROFIT', amount: 1368560, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'OPERATING EXPENSES', amount: 0, isHeader: true },
    { label: 'Salaries & Wages', amount: 345670, indent: 1 },
    { label: 'Rent', amount: 78900, indent: 1 },
    { label: 'Utilities', amount: 23450, indent: 1 },
    { label: 'Marketing & Advertising', amount: 56780, indent: 1 },
    { label: 'Insurance', amount: 12340, indent: 1 },
    { label: 'Depreciation', amount: 34560, indent: 1 },
    { label: 'Other Operating Expenses', amount: 45670, indent: 1 },
    { label: 'Total Operating Expenses', amount: 597370, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'OPERATING PROFIT (EBIT)', amount: 771190, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'OTHER EXPENSES', amount: 0, isHeader: true },
    { label: 'Interest Expense', amount: 23450, indent: 1 },
    { label: 'Bank Charges', amount: 5670, indent: 1 },
    { label: 'Total Other Expenses', amount: 29120, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'PROFIT BEFORE TAX', amount: 742070, isSubtotal: true },
    { label: 'Income Tax', amount: 222621, indent: 1 },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'NET PROFIT', amount: 519449, isSubtotal: true },
  ];

  const formatCurrency = (amount: number) => {
    if (amount === 0) return '';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = `₹${absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return isNegative ? `(${formatted})` : formatted;
  };

  const getRowClass = (item: PLItem) => {
    if (item.isHeader) return 'font-bold text-gray-700 bg-gray-100';
    if (item.isSubtotal) return 'font-bold text-gray-900 border-t border-b border-gray-300';
    if (item.indent) return 'text-gray-600';
    return '';
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Profit & Loss Statement</h1>
              <p className="text-gray-600 mt-1">Financial performance overview</p>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Download className="h-4 w-4" />
                Export
              </button>
              <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Printer className="h-4 w-4" />
                Print
              </button>
            </div>
          </div>

          {/* Period Selector */}
          <div className="flex gap-4 mt-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="2024">2024</option>
                <option value="2023">2023</option>
                <option value="2022">2022</option>
              </select>
            </div>
            {period === 'month' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Statement Table */}
        <div className="p-6">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 text-gray-700">Particulars</th>
                <th className="text-right py-2 text-gray-700">Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {plData.map((item, index) => (
                <tr key={index} className={getRowClass(item)}>
                  <td className={`py-2 ${item.indent ? `pl-${item.indent * 8}` : ''}`}>
                    {item.label}
                  </td>
                  <td className="text-right py-2">
                    {formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 pt-8 border-t border-gray-200">
            <div className="text-center">
              <p className="text-sm text-gray-600">Gross Margin</p>
              <p className="text-2xl font-bold text-gray-900">52.1%</p>
              <div className="flex items-center justify-center mt-1">
                <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                <span className="text-sm text-green-600">+3.2%</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Operating Margin</p>
              <p className="text-2xl font-bold text-gray-900">29.4%</p>
              <div className="flex items-center justify-center mt-1">
                <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                <span className="text-sm text-green-600">+1.8%</span>
              </div>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Net Margin</p>
              <p className="text-2xl font-bold text-gray-900">19.8%</p>
              <div className="flex items-center justify-center mt-1">
                <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
                <span className="text-sm text-red-600">-0.5%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitLossStatement;