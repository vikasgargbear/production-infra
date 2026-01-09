/**
 * SystemSettings Types
 * Type definitions for system settings management
 */

export interface GeneralSettings {
    companyName: string;
    financialYear: string;
    dateFormat: string;
    timeZone: string;
    currency: string;
    currencySymbol: string;
    decimalPlaces: number;
    quantityDecimalPlaces: number;
}

export interface InvoiceSettings {
    prefix: string;
    startNumber: number;
    autoGenerate: boolean;
    showLogo: boolean;
    showTerms: boolean;
    defaultTerms: string;
    footerText: string;
    printCopies: number;
}

export interface StockSettings {
    enableNegativeStock: boolean;
    enableBatchTracking: boolean;
    enableExpiryTracking: boolean;
    lowStockAlert: boolean;
    expiryAlertDays: number;
    enableSerialNumbers: boolean;
    autoUpdatePrices: boolean;
}

export interface TaxSettings {
    enableGST: boolean;
    gstNumber: string;
    defaultTaxRate: number;
    taxInclusive: boolean;
    enableComposite: boolean;
    compositeRate: number;
}

export interface NotificationSettings {
    lowStock: boolean;
    expiry: boolean;
    pendingPayments: boolean;
    newOrders: boolean;
    emailNotifications: boolean;
    smsNotifications: boolean;
    notificationEmail: string;
    notificationPhone: string;
}

export interface SecuritySettings {
    sessionTimeout: number;
    enforcePasswordChange: boolean;
    passwordChangeDays: number;
    minPasswordLength: number;
    requireSpecialChar: boolean;
    enableTwoFactor: boolean;
    maxLoginAttempts: number;
}

export interface BackupSettings {
    autoBackup: boolean;
    backupFrequency: string;
    backupTime: string;
    retentionDays: number;
    backupLocation: string;
    emailBackupReport: boolean;
}

export interface SettingsState {
    general: GeneralSettings;
    invoice: InvoiceSettings;
    stock: StockSettings;
    tax: TaxSettings;
    notifications: NotificationSettings;
    security: SecuritySettings;
    backup: BackupSettings;
}

export interface SystemSettingsUIState {
    activeTab: string;
    hasChanges: boolean;
    isSaving: boolean;
    isLoading: boolean;
    successMessage: string;
    error: string | null;
}

export interface SystemSettingsProps {
    open?: boolean;
    onClose?: () => void;
}

export interface SettingsTabProps {
    settings: SettingsState;
    onSettingChange: (category: string, field: string, value: any) => void;
}
