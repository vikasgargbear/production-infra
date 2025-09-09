import React, { useState, useMemo } from 'react';
import { FileText, Download, Printer, Calendar, TrendingUp, TrendingDown, Filter, ChevronRight } from 'lucide-react';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface PLItem {
  label: string;
  amount: number;
  previousAmount?: number;
  isHeader?: boolean;
  isSubtotal?: boolean;
  indent?: number;
  expandable?: boolean;
  children?: PLItem[];
}

interface ComparisonData {
  currentPeriod: number;
  previousPeriod: number;
  variance: number;
  variancePercent: number;
}

const ProfitLossStatement: React.FC = () => {
  const [period, setPeriod] = useState('month');
  const [year, setYear] = useState('2024');
  const [month, setMonth] = useState('01');
  const [comparisonMode, setComparisonMode] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showChart, setShowChart] = useState(true);

  const plData: PLItem[] = [
    { label: 'REVENUE', amount: 0, previousAmount: 0, isHeader: true },
    { 
      label: 'Sales Revenue', 
      amount: 2456780, 
      previousAmount: 2234500,
      indent: 1,
      expandable: true,
      children: [
        { label: 'Product Sales', amount: 2156780, previousAmount: 1950000, indent: 2 },
        { label: 'Service Sales', amount: 300000, previousAmount: 284500, indent: 2 }
      ]
    },
    { label: 'Service Revenue', amount: 123450, previousAmount: 115000, indent: 1 },
    { label: 'Other Income', amount: 45670, previousAmount: 42000, indent: 1 },
    { label: 'Total Revenue', amount: 2625900, previousAmount: 2391500, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'COST OF GOODS SOLD', amount: 0, previousAmount: 0, isHeader: true },
    { label: 'Opening Stock', amount: 456780, previousAmount: 423000, indent: 1 },
    { 
      label: 'Purchases', 
      amount: 1234560, 
      previousAmount: 1150000,
      indent: 1,
      expandable: true,
      children: [
        { label: 'Raw Materials', amount: 834560, previousAmount: 780000, indent: 2 },
        { label: 'Packaging', amount: 200000, previousAmount: 185000, indent: 2 },
        { label: 'Other Purchases', amount: 200000, previousAmount: 185000, indent: 2 }
      ]
    },
    { label: 'Direct Expenses', amount: 89450, previousAmount: 85000, indent: 1 },
    { label: 'Less: Closing Stock', amount: -523450, previousAmount: -489000, indent: 1 },
    { label: 'Total COGS', amount: 1257340, previousAmount: 1169000, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'GROSS PROFIT', amount: 1368560, previousAmount: 1222500, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'OPERATING EXPENSES', amount: 0, previousAmount: 0, isHeader: true },
    { 
      label: 'Salaries & Wages', 
      amount: 345670, 
      previousAmount: 320000,
      indent: 1,
      expandable: true,
      children: [
        { label: 'Management Salaries', amount: 145670, previousAmount: 135000, indent: 2 },
        { label: 'Staff Wages', amount: 200000, previousAmount: 185000, indent: 2 }
      ]
    },
    { label: 'Rent', amount: 78900, previousAmount: 78900, indent: 1 },
    { label: 'Utilities', amount: 23450, previousAmount: 21000, indent: 1 },
    { label: 'Marketing & Advertising', amount: 56780, previousAmount: 48000, indent: 1 },
    { label: 'Insurance', amount: 12340, previousAmount: 12000, indent: 1 },
    { label: 'Depreciation', amount: 34560, previousAmount: 32000, indent: 1 },
    { label: 'Other Operating Expenses', amount: 45670, previousAmount: 42000, indent: 1 },
    { label: 'Total Operating Expenses', amount: 597370, previousAmount: 553900, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'OPERATING PROFIT (EBIT)', amount: 771190, previousAmount: 668600, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'OTHER EXPENSES', amount: 0, previousAmount: 0, isHeader: true },
    { label: 'Interest Expense', amount: 23450, previousAmount: 25000, indent: 1 },
    { label: 'Bank Charges', amount: 5670, previousAmount: 5500, indent: 1 },
    { label: 'Total Other Expenses', amount: 29120, previousAmount: 30500, isSubtotal: true },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'PROFIT BEFORE TAX', amount: 742070, previousAmount: 638100, isSubtotal: true },
    { label: 'Income Tax', amount: 222621, previousAmount: 191430, indent: 1 },
    
    { label: '', amount: 0 }, // Spacer
    
    { label: 'NET PROFIT', amount: 519449, previousAmount: 446670, isSubtotal: true },
  ];

  const toggleRowExpansion = (label: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedRows(newExpanded);
  };

  const getVariance = (current: number, previous: number) => {
    const variance = current - previous;
    const variancePercent = previous !== 0 ? (variance / previous) * 100 : 0;
    return { variance, variancePercent };
  };

  const trendData = useMemo(() => {
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return {
      labels,
      datasets: [
        {
          label: 'Revenue',
          data: [2400000, 2450000, 2480000, 2520000, 2580000, 2625900],
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Net Profit',
          data: [450000, 465000, 478000, 490000, 505000, 519449],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Operating Expenses',
          data: [550000, 560000, 565000, 575000, 585000, 597370],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, []);

  const categoryBreakdown = useMemo(() => {
    return {
      labels: ['Sales Revenue', 'COGS', 'Operating Expenses', 'Other Expenses', 'Tax'],
      datasets: [{
        label: 'Amount',
        data: [2456780, 1257340, 597370, 29120, 222621],
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(251, 146, 60, 0.8)',
          'rgba(163, 163, 163, 0.8)',
          'rgba(147, 51, 234, 0.8)'
        ],
        borderWidth: 0
      }]
    };
  }, []);

  const formatCurrency = (amount: number) => {
    if (amount === 0) return '';
    const isNegative = amount < 0;
    const absAmount = Math.abs(amount);
    const formatted = `₹${absAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return isNegative ? `(${formatted})` : formatted;
  };

  const formatVariance = (variance: number, percent: number) => {
    const isPositive = variance >= 0;
    const color = isPositive ? 'text-green-600' : 'text-red-600';
    const icon = isPositive ? '↑' : '↓';
    return (
      <span className={`${color} text-sm`}>
        {icon} {Math.abs(percent).toFixed(1)}%
      </span>
    );
  };

  const getRowClass = (item: PLItem) => {
    if (item.isHeader) return 'font-bold text-gray-700 bg-gray-100';
    if (item.isSubtotal) return 'font-bold text-gray-900 border-t border-b border-gray-300';
    if (item.indent === 2) return 'text-gray-500 text-sm';
    if (item.indent) return 'text-gray-600';
    return '';
  };

  const renderTableRows = (data: PLItem[]) => {
    const rows: JSX.Element[] = [];
    
    data.forEach((item, index) => {
      const isExpanded = expandedRows.has(item.label);
      const { variance, variancePercent } = getVariance(item.amount, item.previousAmount || 0);
      
      rows.push(
        <tr key={index} className={getRowClass(item)}>
          <td className={`py-2 ${item.indent ? `pl-${item.indent * 8}` : ''}`}>
            <div className="flex items-center">
              {item.expandable && (
                <button
                  onClick={() => toggleRowExpansion(item.label)}
                  className="mr-2 text-gray-500 hover:text-gray-700"
                >
                  <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>
              )}
              {item.label}
            </div>
          </td>
          <td className="text-right py-2">
            {formatCurrency(item.amount)}
          </td>
          {comparisonMode && (
            <>
              <td className="text-right py-2 text-gray-500">
                {formatCurrency(item.previousAmount || 0)}
              </td>
              <td className="text-right py-2">
                {item.previousAmount && !item.isHeader && formatVariance(variance, variancePercent)}
              </td>
            </>
          )}
        </tr>
      );
      
      if (item.expandable && isExpanded && item.children) {
        item.children.forEach((child, childIndex) => {
          const childVariance = getVariance(child.amount, child.previousAmount || 0);
          rows.push(
            <tr key={`${index}-${childIndex}`} className={getRowClass(child)}>
              <td className={`py-1 pl-${(child.indent || 0) * 8}`}>
                {child.label}
              </td>
              <td className="text-right py-1">
                {formatCurrency(child.amount)}
              </td>
              {comparisonMode && (
                <>
                  <td className="text-right py-1 text-gray-500">
                    {formatCurrency(child.previousAmount || 0)}
                  </td>
                  <td className="text-right py-1">
                    {child.previousAmount && formatVariance(childVariance.variance, childVariance.variancePercent)}
                  </td>
                </>
              )}
            </tr>
          );
        });
      }
    });
    
    return rows;
  };

  const exportToPDF = () => {
  };

  const exportToExcel = () => {
  };

  const handlePrint = () => {
    window.print();
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
              <button
                onClick={() => setComparisonMode(!comparisonMode)}
                className={`px-4 py-2 border rounded-lg flex items-center gap-2 ${
                  comparisonMode
                    ? 'bg-blue-50 text-blue-700 border-blue-300'
                    : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Filter className="h-4 w-4" />
                Compare
              </button>
              <button
                onClick={exportToExcel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Excel
              </button>
              <button
                onClick={exportToPDF}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
              >
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

        {/* Charts Section */}
        {showChart && (
          <div className="p-6 border-b border-gray-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Trend Analysis</h3>
                <Line
                  data={trendData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            return `${context.dataset.label}: ₹${context.parsed.y.toLocaleString('en-IN')}`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `₹${(value as number / 100000).toFixed(0)}L`
                        }
                      }
                    }
                  }}
                  height={250}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Breakdown</h3>
                <Bar
                  data={categoryBreakdown}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            return `₹${context.parsed.y.toLocaleString('en-IN')}`;
                          }
                        }
                      }
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `₹${(value as number / 100000).toFixed(0)}L`
                        }
                      }
                    }
                  }}
                  height={250}
                />
              </div>
            </div>
          </div>
        )}

        {/* Statement Table */}
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Detailed Statement</h3>
            <button
              onClick={() => setShowChart(!showChart)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              {showChart ? 'Hide Charts' : 'Show Charts'}
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-300">
                <th className="text-left py-2 text-gray-700">Particulars</th>
                <th className="text-right py-2 text-gray-700">Current Period (₹)</th>
                {comparisonMode && (
                  <>
                    <th className="text-right py-2 text-gray-700">Previous Period (₹)</th>
                    <th className="text-right py-2 text-gray-700">Variance</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {renderTableRows(plData)}
            </tbody>
          </table>

          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-gray-200">
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
            <div className="text-center">
              <p className="text-sm text-gray-600">EBITDA Margin</p>
              <p className="text-2xl font-bold text-gray-900">31.2%</p>
              <div className="flex items-center justify-center mt-1">
                <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
                <span className="text-sm text-green-600">+2.1%</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitLossStatement;