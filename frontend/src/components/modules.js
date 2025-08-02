/**
 * Global Modules Export
 * Central export for all business modules
 */

// Import all modules
import SalesModule from './sales';
import PurchaseModule from './purchase';
import ReturnsModule from './returns';
import PaymentModule from './payment';
import LedgerModule from './ledger';
import NotesModule from './notes';
import InventoryModule from './inventory';

// Import other important modules
import InvoiceModule from './invoice';
import ChallanModule from './challan';
import ReportsModule from './reports';
import DashboardModule from './dashboard';

// Export all modules
export {
  SalesModule,
  PurchaseModule,
  ReturnsModule,
  PaymentModule,
  LedgerModule,
  NotesModule,
  InventoryModule,
  InvoiceModule,
  ChallanModule,
  ReportsModule,
  DashboardModule
};

// Module registry for dynamic loading
export const ModuleRegistry = {
  sales: {
    name: 'Sales',
    icon: 'ShoppingCart',
    shortcut: 'Ctrl+S',
    path: '/sales',
    component: SalesModule,
    permissions: ['sales.view', 'sales.create']
  },
  purchase: {
    name: 'Purchase Entry',
    icon: 'Package',
    shortcut: 'Ctrl+P',
    path: '/purchase',
    component: PurchaseModule,
    permissions: ['purchase.view', 'purchase.create']
  },
  returns: {
    name: 'Returns Management',
    icon: 'RotateCcw',
    shortcut: 'F8',
    path: '/returns',
    component: ReturnsModule,
    permissions: ['returns.view', 'returns.create']
  },
  stockMovement: {
    name: 'Stock Movement',
    icon: 'Package2',
    shortcut: 'Ctrl+I',
    path: '/stock-movement',
    component: InventoryModule,
    permissions: ['inventory.view', 'inventory.manage']
  },
  partyLedger: {
    name: 'Party Ledger',
    icon: 'BookOpen',
    shortcut: 'Ctrl+L',
    path: '/party-ledger',
    component: LedgerModule,
    permissions: ['ledger.view']
  },
  creditDebitNote: {
    name: 'Credit/Debit Note',
    icon: 'FileText',
    shortcut: 'Ctrl+N',
    path: '/notes',
    component: NotesModule,
    permissions: ['notes.view', 'notes.create']
  },
  paymentEntry: {
    name: 'Payment Entry',
    icon: 'CreditCard',
    shortcut: 'Ctrl+M',
    path: '/payment',
    component: PaymentModule,
    permissions: ['payment.view', 'payment.create']
  }
};

// Module utilities
export const getModuleByPath = (path) => {
  return Object.values(ModuleRegistry).find(module => module.path === path);
};

export const getModuleByShortcut = (shortcut) => {
  return Object.values(ModuleRegistry).find(module => module.shortcut === shortcut);
};

export const hasModulePermission = (moduleKey, userPermissions = []) => {
  const module = ModuleRegistry[moduleKey];
  if (!module || !module.permissions) return true;
  
  return module.permissions.some(permission => userPermissions.includes(permission));
};

// Default export
const Modules = {
  registry: ModuleRegistry,
  modules: {
    SalesModule,
    PurchaseModule,
    ReturnsModule,
    PaymentModule,
    LedgerModule,
    NotesModule,
    InventoryModule,
    InvoiceModule,
    ChallanModule,
    ReportsModule,
    DashboardModule
  },
  utils: {
    getModuleByPath,
    getModuleByShortcut,
    hasModulePermission
  }
};

export default Modules;