import React from 'react';
import {
  BarChart3, TrendingUp, FileText, PieChart,
  Calendar, DollarSign, Package, Users,
  ShoppingCart, CreditCard, TrendingDown,
  Activity, BookOpen, Receipt, Wallet,
  Target, FileSpreadsheet, Calculator
} from 'lucide-react';
import { ModuleHub } from '../global';

// Core Business Reports
import ExecutiveDashboard from './ExecutiveDashboard';
import SalesReport from './SalesReport';
import PurchaseReport from './PurchaseReport';
import InventoryReport from './InventoryReport';
import FinancialReport from './FinancialReport';

// Analytics & Insights
import CustomerAnalytics from './CustomerAnalytics';
import ProductAnalytics from './ProductAnalytics';
import LedgerAnalytics from './LedgerAnalytics';
import PaymentAnalytics from './PaymentAnalytics';
import TaxAnalytics from './TaxAnalytics';

// Financial Statements
import ProfitLossStatement from './ProfitLossStatement';

// GST Reports
import GSTR1Report from './GSTR1Report';
import GSTR3BReport from './GSTR3BReport';

interface ReportsHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface ReportModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
  category?: string;
}

const ReportsHub: React.FC<ReportsHubProps> = ({ open = true, onClose }) => {
  const reportModules: ReportModule[] = [
    // Executive & Overview
    {
      id: 'executive-dashboard',
      label: 'Executive',
      fullLabel: 'Executive Dashboard',
      description: 'Company-wide KPIs & metrics',
      icon: Activity,
      color: 'slate',
      component: ExecutiveDashboard,
      category: 'Executive'
    },

    // Sales & Revenue
    {
      id: 'sales-analytics',
      label: 'Sales',
      fullLabel: 'Sales Analytics',
      description: 'Revenue trends & performance',
      icon: TrendingUp,
      color: 'blue',
      component: SalesReport,
      category: 'Sales'
    },
    {
      id: 'customer-insights',
      label: 'Customers',
      fullLabel: 'Customer Insights',
      description: 'Behavior & segmentation',
      icon: Users,
      color: 'indigo',
      component: CustomerAnalytics,
      category: 'Sales'
    },

    // Procurement & Supply Chain
    {
      id: 'purchase-analytics',
      label: 'Purchase',
      fullLabel: 'Purchase Analytics',
      description: 'Vendor & procurement analysis',
      icon: ShoppingCart,
      color: 'green',
      component: PurchaseReport,
      category: 'Procurement'
    },

    // Inventory & Operations
    {
      id: 'inventory-analytics',
      label: 'Inventory',
      fullLabel: 'Inventory Analytics',
      description: 'Stock movement & valuation',
      icon: Package,
      color: 'purple',
      component: InventoryReport,
      category: 'Operations'
    },
    {
      id: 'product-performance',
      label: 'Products',
      fullLabel: 'Product Performance',
      description: 'Product metrics & trends',
      icon: PieChart,
      color: 'amber',
      component: ProductAnalytics,
      category: 'Operations'
    },

    // Financial Reports
    {
      id: 'financial-overview',
      label: 'Financial',
      fullLabel: 'Financial Overview',
      description: 'Revenue, expenses & cash flow',
      icon: DollarSign,
      color: 'emerald',
      component: FinancialReport,
      category: 'Finance'
    },
    {
      id: 'ledger-analytics',
      label: 'Ledger',
      fullLabel: 'Ledger Analytics',
      description: 'Receivables & payables aging',
      icon: BookOpen,
      color: 'teal',
      component: LedgerAnalytics,
      category: 'Finance'
    },
    {
      id: 'payment-analytics',
      label: 'Payments',
      fullLabel: 'Payment Analytics',
      description: 'Collection & payment trends',
      icon: Wallet,
      color: 'cyan',
      component: PaymentAnalytics,
      category: 'Finance'
    },
    {
      id: 'profit-loss',
      label: 'P&L',
      fullLabel: 'Profit & Loss Statement',
      description: 'Income statement analysis',
      icon: Calculator,
      color: 'rose',
      component: ProfitLossStatement,
      category: 'Finance'
    },

    // Compliance & Tax
    {
      id: 'tax-analytics',
      label: 'Tax',
      fullLabel: 'Tax Analytics',
      description: 'GST compliance & insights',
      icon: Receipt,
      color: 'orange',
      component: TaxAnalytics,
      category: 'Compliance'
    },
    {
      id: 'gstr1-report',
      label: 'GSTR-1',
      fullLabel: 'GSTR-1 Report',
      description: 'Outward supply statement',
      icon: FileSpreadsheet,
      color: 'violet',
      component: GSTR1Report,
      category: 'Compliance'
    },
    {
      id: 'gstr3b-report',
      label: 'GSTR-3B',
      fullLabel: 'GSTR-3B Report',
      description: 'Summary return filing',
      icon: FileText,
      color: 'fuchsia',
      component: GSTR3BReport,
      category: 'Compliance'
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => {})}
      title="Reports & Analytics Center"
      subtitle="Enterprise business intelligence & insights"
      icon={BarChart3}
      modules={reportModules}
      defaultModule="executive-dashboard"
      showCategories={true}
    />
  );
};

export default ReportsHub;