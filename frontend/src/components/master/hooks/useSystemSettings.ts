/**
 * useSystemSettings Hook
 * 
 * Extracted from SystemSettings.tsx (1,017 lines)
 * Handles settings state management, loading, saving, and resetting.
 */

import { useState, useEffect, useCallback } from 'react';
import { settingsApi } from '../../../services/api';

// Types (exported from SystemSettings or defined here)
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
    [key: string]: any;
}

export interface UseSystemSettingsReturn {
    // State
    settings: SettingsState;
    activeTab: string;
    hasChanges: boolean;
    isSaving: boolean;
    isLoading: boolean;
    successMessage: string;
    error: string | null;

    // Actions
    setActiveTab: (tab: string) => void;
    handleSettingChange: (category: string, field: string, value: any) => void;
    handleSave: () => Promise<void>;
    handleReset: () => void;
    loadSettings: () => Promise<void>;
}

const defaultSettings: SettingsState = {
    general: {
        companyName: '',
        financialYear: '2024-25',
        dateFormat: 'DD/MM/YYYY',
        timeZone: 'Asia/Kolkata',
        currency: 'INR',
        currencySymbol: '₹',
        decimalPlaces: 2,
        quantityDecimalPlaces: 2
    },
    invoice: {
        prefix: 'INV',
        startNumber: 1,
        autoGenerate: true,
        showLogo: true,
        showTerms: true,
        defaultTerms: '',
        footerText: '',
        printCopies: 2
    },
    stock: {
        enableNegativeStock: false,
        enableBatchTracking: true,
        enableExpiryTracking: true,
        lowStockAlert: true,
        expiryAlertDays: 30,
        enableSerialNumbers: false,
        autoUpdatePrices: false
    },
    tax: {
        enableGST: true,
        gstNumber: '',
        defaultTaxRate: 18,
        taxInclusive: false,
        enableComposite: false,
        compositeRate: 0
    },
    notifications: {
        lowStock: true,
        expiry: true,
        pendingPayments: true,
        newOrders: true,
        emailNotifications: false,
        smsNotifications: false,
        notificationEmail: '',
        notificationPhone: ''
    },
    security: {
        sessionTimeout: 30,
        enforcePasswordChange: true,
        passwordChangeDays: 90,
        minPasswordLength: 8,
        requireSpecialChar: true,
        enableTwoFactor: false,
        maxLoginAttempts: 5
    },
    backup: {
        autoBackup: true,
        backupFrequency: 'daily',
        backupTime: '02:00',
        retentionDays: 30,
        backupLocation: 'cloud',
        emailBackupReport: false
    }
};

export function useSystemSettings(): UseSystemSettingsReturn {
    const [activeTab, setActiveTab] = useState('general');
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [settings, setSettings] = useState<SettingsState>(defaultSettings);

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await settingsApi.system.getAll();

            if (response && (response as any).data) {
                const apiSettings = (response as any).data;
                setSettings(prev => ({ ...prev, ...apiSettings }));
            } else {
                const savedSettings = localStorage.getItem('systemSettings');
                if (savedSettings) {
                    setSettings(JSON.parse(savedSettings));
                }
            }
        } catch {
            const savedSettings = localStorage.getItem('systemSettings');
            if (savedSettings) {
                setSettings(JSON.parse(savedSettings));
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    const handleSettingChange = useCallback((category: string, field: string, value: any) => {
        setSettings(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [field]: value
            }
        }));
        setHasChanges(true);
    }, []);

    const handleSave = useCallback(async () => {
        setIsSaving(true);
        setError(null);

        try {
            const response = await settingsApi.system.update(settings);

            if (response && ((response as any).success || (response as any).data)) {
                setSuccessMessage('Settings saved successfully!');
                setHasChanges(false);
                localStorage.setItem('systemSettings', JSON.stringify(settings));
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        } catch {
            setError('Failed to save settings to server.');
            localStorage.setItem('systemSettings', JSON.stringify(settings));
            setSuccessMessage('Settings saved locally.');
            setTimeout(() => setSuccessMessage(''), 3000);
        } finally {
            setIsSaving(false);
        }
    }, [settings]);

    const handleReset = useCallback(() => {
        if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
            loadSettings();
            setHasChanges(false);
        }
    }, [loadSettings]);

    return {
        settings,
        activeTab,
        hasChanges,
        isSaving,
        isLoading,
        successMessage,
        error,
        setActiveTab,
        handleSettingChange,
        handleSave,
        handleReset,
        loadSettings
    };
}

export default useSystemSettings;
