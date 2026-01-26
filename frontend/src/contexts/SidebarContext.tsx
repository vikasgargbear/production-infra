import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface SidebarSettings {
    // Whether sidebar is currently expanded (controlled by hover or lock)
    isExpanded: boolean;
    // Whether to lock sidebar in expanded state (from settings)
    lockExpanded: boolean;
    // Whether user is currently hovering over sidebar
    isHovering: boolean;
}

interface SidebarContextValue {
    settings: SidebarSettings;
    setIsHovering: (hovering: boolean) => void;
    toggleLockExpanded: () => void;
    setLockExpanded: (locked: boolean) => void;
}

const SIDEBAR_SETTINGS_KEY = 'aaso_sidebar_settings';

const defaultSettings: SidebarSettings = {
    isExpanded: false,
    lockExpanded: false,
    isHovering: false
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const useSidebar = (): SidebarContextValue => {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
};

interface SidebarProviderProps {
    children: ReactNode;
}

export const SidebarProvider: React.FC<SidebarProviderProps> = ({ children }) => {
    const [settings, setSettings] = useState<SidebarSettings>(() => {
        // Load saved preferences from localStorage
        try {
            const saved = localStorage.getItem(SIDEBAR_SETTINGS_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                return {
                    ...defaultSettings,
                    lockExpanded: parsed.lockExpanded ?? false
                };
            }
        } catch (e) {
            console.warn('Failed to load sidebar settings:', e);
        }
        return defaultSettings;
    });

    // Compute isExpanded based on hover state and lock setting
    const isExpanded = settings.lockExpanded || settings.isHovering;

    // Save lockExpanded to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_SETTINGS_KEY, JSON.stringify({
                lockExpanded: settings.lockExpanded
            }));
        } catch (e) {
            console.warn('Failed to save sidebar settings:', e);
        }
    }, [settings.lockExpanded]);

    const setIsHovering = (hovering: boolean) => {
        setSettings(prev => ({ ...prev, isHovering: hovering }));
    };

    const toggleLockExpanded = () => {
        setSettings(prev => ({ ...prev, lockExpanded: !prev.lockExpanded }));
    };

    const setLockExpanded = (locked: boolean) => {
        setSettings(prev => ({ ...prev, lockExpanded: locked }));
    };

    const value: SidebarContextValue = {
        settings: {
            ...settings,
            isExpanded
        },
        setIsHovering,
        toggleLockExpanded,
        setLockExpanded
    };

    return (
        <SidebarContext.Provider value={value}>
            {children}
        </SidebarContext.Provider>
    );
};

export default SidebarContext;
