/**
 * Global Modules Export
 * Central export for all business modules
 */

// Import all modules
import * as SalesModule from './sales';
import * as PurchaseModule from './purchase';
import * as ReturnsModule from './returns';
import * as PaymentModule from './payment';
import * as LedgerModule from './ledger';
import CreditDebitFlow from './payment/flows/CreditDebitFlow';
import * as InventoryModule from './inventory';

const NotesModule = { CreditDebitFlow };

// Import other important modules
import * as ChallanModule from './sales/challan';
import * as ReportsModule from './reports';
import * as DashboardModule from './Dashboard';

// Types
interface ModuleConfig {
    name: string;
    icon: string;
    shortcut: string;
    path: string;
    component: unknown;
    permissions: string[];
}

// Export all modules
export {
    SalesModule,
    PurchaseModule,
    ReturnsModule,
    PaymentModule,
    LedgerModule,
    NotesModule,
    InventoryModule,
    ChallanModule,
    ReportsModule,
    DashboardModule
};

// Module registry for dynamic loading
export const ModuleRegistry: Record<string, ModuleConfig> = {
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
        path: '/party-ledger-v2',
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
export const getModuleByPath = (path: string): ModuleConfig | undefined => {
    return Object.values(ModuleRegistry).find(module => module.path === path);
};

export const getModuleByShortcut = (shortcut: string): ModuleConfig | undefined => {
    return Object.values(ModuleRegistry).find(module => module.shortcut === shortcut);
};

export const hasModulePermission = (moduleKey: string, userPermissions: string[] = []): boolean => {
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
