import React, { useState, useEffect } from 'react';
import {
    Plug, Settings, Check, X, AlertCircle,
    MessageSquare, FileText, Database, Smartphone,
    Mail, Globe, ShoppingCart, Package,
    CreditCard, BarChart3, ExternalLink, Shield,
    Loader2, Info, ChevronRight, Search, RefreshCw,
    LucideIcon
} from 'lucide-react';
import { settingsApi } from '../../../services/api';

// Types
interface Integration {
    id: string;
    name: string;
    description: string;
    icon: LucideIcon;
    color: string;
    status: 'active' | 'inactive' | 'error';
    enabled: boolean;
    features?: string[];
    config?: Record<string, string>;
}

interface ThirdPartyIntegrationsProps {
    open?: boolean;
    onClose?: () => void;
}

const ThirdPartyIntegrations: React.FC<ThirdPartyIntegrationsProps> = ({ open, onClose }) => {
    const [activeIntegration, setActiveIntegration] = useState<Integration | null>(null);
    const [configuring, setConfiguring] = useState<string | null>(null);
    const [testingConnection, setTestingConnection] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    // Integration state
    const [integrations, setIntegrations] = useState<Integration[]>([]);

    // Load integrations on component mount
    useEffect(() => {
        if (open) {
            loadIntegrations();
        }
    }, [open]);

    const loadIntegrations = async (): Promise<void> => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await settingsApi.integrations.getAll();

            if (response?.data && Array.isArray(response.data)) {
                setIntegrations(response.data.map((integration: any) => ({
                    ...integration,
                    icon: getIconForType(integration.id),
                    color: getColorForType(integration.id)
                })));
            } else {
                setError('No integrations found. Please configure integrations through the settings.');
                setIntegrations([]);
            }
        } catch (err) {
            setError('Failed to load integrations. Please try again.');
            setIntegrations([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefresh = async (): Promise<void> => {
        setRefreshing(true);
        setError(null);
        try {
            await loadIntegrations();
        } catch (err) {
            setError('Failed to refresh integrations. Please try again.');
        } finally {
            setRefreshing(false);
        }
    };

    const getIconForType = (type: string): LucideIcon => {
        const iconMap: Record<string, LucideIcon> = {
            'whatsapp': MessageSquare,
            'tally': FileText,
            'sms': Smartphone,
            'email': Mail,
            'payment_gateway': CreditCard,
            'ecommerce': ShoppingCart,
            'analytics': BarChart3,
            'default': Plug
        };
        return iconMap[type] || iconMap.default;
    };

    const getColorForType = (type: string): string => {
        const colorMap: Record<string, string> = {
            'whatsapp': 'green',
            'tally': 'blue',
            'sms': 'purple',
            'email': 'red',
            'payment_gateway': 'indigo',
            'ecommerce': 'orange',
            'analytics': 'cyan',
            'default': 'gray'
        };
        return colorMap[type] || colorMap.default;
    };

    const handleTestConnection = async (integrationId: string): Promise<void> => {
        setTestingConnection(integrationId);
        try {
            const response = await settingsApi.integrations.testConnection(integrationId);
            if (response.success) {
                // Update integration status
                setIntegrations(prev => prev.map(integration =>
                    integration.id === integrationId
                        ? { ...integration, status: 'active' as const }
                        : integration
                ));
            }
        } catch (err) {
            // Silent fail - could show error toast
        } finally {
            setTestingConnection(null);
        }
    };

    const handleToggleIntegration = async (integrationId: string, enabled: boolean): Promise<void> => {
        try {
            const response = await settingsApi.integrations.update(integrationId, { enabled });
            if (response.success) {
                setIntegrations(prev => prev.map(integration =>
                    integration.id === integrationId
                        ? { ...integration, enabled }
                        : integration
                ));
            }
        } catch (err) {
            // Silent fail - could show error toast
        }
    };

    const handleConfigureIntegration = (integration: Integration): void => {
        setActiveIntegration(integration);
        setConfiguring(integration.id);
    };

    const handleSaveConfiguration = async (integrationId: string, config: Record<string, string> | undefined): Promise<void> => {
        try {
            const response = await settingsApi.integrations.update(integrationId, config || {});
            if (response.success) {
                setIntegrations(prev => prev.map(integration =>
                    integration.id === integrationId
                        ? { ...integration, ...config }
                        : integration
                ));
                setActiveIntegration(null);
                setConfiguring(null);
            }
        } catch (err) {
            // Silent fail - could show error toast
        }
    };

    if (!open) return null;

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                    <div className="flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                        <span className="ml-2 text-gray-600">Loading integrations...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Third Party Integrations</h2>
                        <p className="text-gray-600">Manage external service connections and APIs</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button
                            onClick={onClose}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
                        >
                            <X className="h-4 w-4 mr-1" />
                            Close
                        </button>
                    </div>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center">
                                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                                <span className="text-red-800">{error}</span>
                            </div>
                            <button
                                onClick={handleRefresh}
                                className="text-sm text-red-600 hover:text-red-800 underline"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* Integrations Grid */}
                {integrations.length === 0 ? (
                    <div className="text-center py-12">
                        <Plug className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Integrations Found</h3>
                        <p className="text-gray-500 mb-4">Configure integrations through the settings panel</p>
                        <button
                            onClick={handleRefresh}
                            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {integrations.map((integration) => {
                            const IconComponent = integration.icon;
                            return (
                                <div key={integration.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${integration.color}-100`}>
                                            <IconComponent className={`h-6 w-6 text-${integration.color}-600`} />
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <button
                                                onClick={() => handleTestConnection(integration.id)}
                                                disabled={testingConnection === integration.id}
                                                className="p-1 text-gray-400 hover:text-gray-600"
                                                title="Test Connection"
                                            >
                                                {testingConnection === integration.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Check className="h-4 w-4" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleConfigureIntegration(integration)}
                                                className="p-1 text-gray-400 hover:text-gray-600"
                                                title="Configure"
                                            >
                                                <Settings className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{integration.name}</h3>
                                    <p className="text-gray-600 text-sm mb-4">{integration.description}</p>

                                    <div className="space-y-3 mb-4">
                                        {integration.features?.slice(0, 3).map((feature, index) => (
                                            <div key={index} className="flex items-center text-sm text-gray-600">
                                                <Check className="h-4 w-4 text-green-500 mr-2" />
                                                {feature}
                                            </div>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${integration.status === 'active'
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                {integration.status}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleToggleIntegration(integration.id, !integration.enabled)}
                                            className={`px-3 py-1 rounded-md text-sm font-medium ${integration.enabled
                                                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                                                }`}
                                        >
                                            {integration.enabled ? 'Enabled' : 'Disabled'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Configuration Modal */}
                {activeIntegration && (
                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-60">
                        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold">Configure {activeIntegration.name}</h3>
                                <button
                                    onClick={() => setActiveIntegration(null)}
                                    className="text-gray-400 hover:text-gray-600"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="space-y-4">
                                {Object.entries(activeIntegration.config || {}).map(([key, value]) => (
                                    <div key={key}>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                        </label>
                                        <input
                                            type={key.includes('password') || key.includes('secret') ? 'password' : 'text'}
                                            defaultValue={value}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                                            placeholder={`Enter ${key.replace(/_/g, ' ')}`}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center justify-end space-x-2 mt-6">
                                <button
                                    onClick={() => setActiveIntegration(null)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => handleSaveConfiguration(activeIntegration.id, activeIntegration.config)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ThirdPartyIntegrations;
