import React, { useState, useEffect } from 'react';
import { 
  Plug, Settings, Check, X, AlertCircle, 
  MessageSquare, FileText, Database, Smartphone,
  Mail, Globe, ShoppingCart, Package, 
  CreditCard, BarChart3, ExternalLink, Shield,
  Loader2, Info, ChevronRight, Search
} from 'lucide-react';
import { settingsApi } from '../../services/api/modules/settings.api';

const ThirdPartyIntegrations = ({ open, onClose }) => {
  const [activeIntegration, setActiveIntegration] = useState(null);
  const [configuring, setConfiguring] = useState(null);
  const [testingConnection, setTestingConnection] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Load integrations on component mount
  useEffect(() => {
    if (open) {
      loadIntegrations();
    }
  }, [open]);

  const loadIntegrations = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await settingsApi.integrations.getAll();
      
      if (response?.data && Array.isArray(response.data)) {
        setIntegrations(response.data.map(integration => ({
          ...integration,
          icon: getIconForType(integration.id),
          color: getColorForType(integration.id)
        })));
      } else {
        // Use mock data as fallback
        setIntegrations(mockIntegrations);
      }
    } catch (error) {
      console.error('Error loading integrations:', error);
      setError('Failed to load integrations. Using offline data.');
      // Use mock data on error
      setIntegrations(mockIntegrations);
    } finally {
      setIsLoading(false);
    }
  };

  // Integration state
  const [integrations, setIntegrations] = useState([]);

  // Mock data as fallback
  const mockIntegrations = [
    {
      id: 'whatsapp',
      name: 'WhatsApp Business',
      description: 'Send invoices, payment reminders, and updates via WhatsApp',
      icon: MessageSquare,
      category: 'communication',
      status: 'active',
      color: 'green',
      features: [
        'Send invoices automatically',
        'Payment reminders',
        'Order confirmations',
        'Delivery updates'
      ],
      config: {
        api_key: '***************',
        phone_number: '+91 98765 43210',
        webhook_url: 'https://api.example.com/whatsapp/webhook',
        enabled: true
      }
    },
    {
      id: 'tally',
      name: 'Tally ERP',
      description: 'Sync invoices, purchases, and accounting data with Tally',
      icon: FileText,
      category: 'accounting',
      status: 'inactive',
      color: 'blue',
      features: [
        'Auto-sync invoices',
        'Purchase entries',
        'GST reports',
        'Ledger sync'
      ],
      config: {
        server_url: '',
        company_name: '',
        username: '',
        password: '',
        sync_frequency: 'hourly',
        enabled: false
      }
    },
    {
      id: 'sms',
      name: 'SMS Gateway',
      description: 'Send SMS notifications for orders and payments',
      icon: Smartphone,
      category: 'communication',
      status: 'active',
      color: 'purple',
      features: [
        'Order confirmation SMS',
        'Payment alerts',
        'Promotional messages',
        'OTP verification'
      ],
      config: {
        provider: 'textlocal',
        api_key: '***************',
        sender_id: 'PHARMA',
        enabled: true
      }
    },
    {
      id: 'email',
      name: 'Email Service',
      description: 'Configure email provider for transactional emails',
      icon: Mail,
      category: 'communication',
      status: 'active',
      color: 'red',
      features: [
        'Invoice emails',
        'Payment receipts',
        'Marketing campaigns',
        'Reports delivery'
      ],
      config: {
        provider: 'smtp',
        host: 'smtp.gmail.com',
        port: 587,
        username: 'noreply@pharmaerp.com',
        password: '***************',
        enabled: true
      }
    },
    {
      id: 'payment_gateway',
      name: 'Payment Gateway',
      description: 'Accept online payments through various methods',
      icon: CreditCard,
      category: 'payment',
      status: 'inactive',
      color: 'indigo',
      features: [
        'UPI payments',
        'Card payments',
        'Net banking',
        'Payment links'
      ],
      config: {
        provider: 'razorpay',
        api_key: '',
        api_secret: '',
        webhook_secret: '',
        enabled: false
      }
    },
    {
      id: 'ecommerce',
      name: 'E-commerce Platform',
      description: 'Sync inventory and orders with online store',
      icon: ShoppingCart,
      category: 'sales',
      status: 'inactive',
      color: 'orange',
      features: [
        'Inventory sync',
        'Order import',
        'Price updates',
        'Product catalog sync'
      ],
      config: {
        platform: 'woocommerce',
        store_url: '',
        api_key: '',
        api_secret: '',
        sync_inventory: true,
        sync_orders: true,
        enabled: false
      }
    },
    {
      id: 'analytics',
      name: 'Analytics Platform',
      description: 'Advanced analytics and business intelligence',
      icon: BarChart3,
      category: 'analytics',
      status: 'inactive',
      color: 'cyan',
      features: [
        'Sales analytics',
        'Customer insights',
        'Inventory trends',
        'Custom dashboards'
      ],
      config: {
        provider: 'google_analytics',
        tracking_id: '',
        api_key: '',
        enabled: false
      }
    },
    {
      id: 'cloud_backup',
      name: 'Cloud Backup',
      description: 'Automatic backup to cloud storage',
      icon: Database,
      category: 'storage',
      status: 'active',
      color: 'gray',
      features: [
        'Automatic daily backup',
        'Encrypted storage',
        'Version history',
        'One-click restore'
      ],
      config: {
        provider: 'aws_s3',
        bucket_name: 'pharma-backup',
        access_key: '***************',
        secret_key: '***************',
        region: 'ap-south-1',
        retention_days: 30,
        enabled: true
      }
    }
  ];

  const categories = [
    { id: 'all', name: 'All Integrations', count: integrations.length },
    { id: 'communication', name: 'Communication', count: 3 },
    { id: 'accounting', name: 'Accounting', count: 1 },
    { id: 'payment', name: 'Payment', count: 1 },
    { id: 'sales', name: 'Sales', count: 1 },
    { id: 'analytics', name: 'Analytics', count: 1 },
    { id: 'storage', name: 'Storage', count: 1 }
  ];

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Form states for different integrations
  const [whatsappConfig, setWhatsappConfig] = useState({
    api_key: '',
    phone_number: '',
    webhook_url: ''
  });

  const [tallyConfig, setTallyConfig] = useState({
    server_url: '',
    company_name: '',
    username: '',
    password: '',
    sync_frequency: 'hourly'
  });

  const [emailConfig, setEmailConfig] = useState({
    provider: 'smtp',
    host: 'smtp.gmail.com',
    port: 587,
    username: '',
    password: '',
    use_tls: true
  });

  const filteredIntegrations = integrations.filter(integration => {
    const matchesCategory = selectedCategory === 'all' || integration.category === selectedCategory;
    const matchesSearch = searchTerm === '' || 
      integration.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      integration.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleTestConnection = async (integrationId) => {
    setTestingConnection(integrationId);
    
    try {
      const response = await settingsApi.integrations.test(integrationId);
      alert(`Connection test ${response?.success ? 'successful' : 'failed'}!`);
    } catch (error) {
      console.error('Error testing connection:', error);
      alert('Connection test failed!');
    } finally {
      setTestingConnection(null);
    }
  };

  const handleToggleIntegration = async (integrationId) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration.config.enabled && !isConfigured(integration)) {
      alert('Please configure the integration first');
      setActiveIntegration(integrationId);
      setConfiguring(integrationId);
      return;
    }
    
    try {
      if (integration.config.enabled) {
        await settingsApi.integrations.disable(integrationId);
      } else {
        await settingsApi.integrations.enable(integrationId);
      }
      
      // Update local state
      setIntegrations(prev => prev.map(integ =>
        integ.id === integrationId
          ? { ...integ, config: { ...integ.config, enabled: !integ.config.enabled } }
          : integ
      ));
      
      alert(`${integration.name} ${integration.config.enabled ? 'disabled' : 'enabled'} successfully!`);
    } catch (error) {
      console.error('Error toggling integration:', error);
      alert('Failed to update integration status');
    }
  };

  const handleSaveConfig = async (integrationId) => {
    try {
      let configData = {};
      
      // Get config data based on integration type
      switch (integrationId) {
        case 'whatsapp':
          configData = whatsappConfig;
          break;
        case 'tally':
          configData = tallyConfig;
          break;
        case 'email':
          configData = emailConfig;
          break;
      }
      
      await settingsApi.integrations.configure(integrationId, configData);
      
      // Update local state
      setIntegrations(prev => prev.map(integ =>
        integ.id === integrationId
          ? { ...integ, config: { ...integ.config, ...configData } }
          : integ
      ));
      
      alert('Configuration saved successfully!');
    } catch (error) {
      console.error('Error saving configuration:', error);
      alert('Failed to save configuration');
    } finally {
      setConfiguring(null);
    }
  };

  const isConfigured = (integration) => {
    switch (integration.id) {
      case 'whatsapp':
        return integration.config.api_key && integration.config.phone_number;
      case 'tally':
        return integration.config.server_url && integration.config.username;
      case 'email':
        return integration.config.host && integration.config.username;
      default:
        return Object.values(integration.config).some(value => value && value !== '');
    }
  };

  const getIconForType = (type) => {
    const icons = {
      whatsapp: MessageSquare,
      tally: FileText,
      sms: Smartphone,
      email: Mail,
      payment_gateway: CreditCard,
      ecommerce: ShoppingCart,
      analytics: BarChart3,
      cloud_backup: Database
    };
    return icons[type] || Plug;
  };

  const getColorForType = (type) => {
    const colors = {
      whatsapp: 'green',
      tally: 'blue',
      sms: 'purple',
      email: 'red',
      payment_gateway: 'indigo',
      ecommerce: 'orange',
      analytics: 'cyan',
      cloud_backup: 'gray'
    };
    return colors[type] || 'gray';
  };

  const renderConfigForm = (integration) => {
    switch (integration.id) {
      case 'whatsapp':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Business API Key</label>
              <input
                type="password"
                value={whatsappConfig.api_key}
                onChange={(e) => setWhatsappConfig({...whatsappConfig, api_key: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your API key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Business Number</label>
              <input
                type="tel"
                value={whatsappConfig.phone_number}
                onChange={(e) => setWhatsappConfig({...whatsappConfig, phone_number: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Webhook URL (Optional)</label>
              <input
                type="url"
                value={whatsappConfig.webhook_url}
                onChange={(e) => setWhatsappConfig({...whatsappConfig, webhook_url: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="https://api.example.com/webhook"
              />
            </div>
          </div>
        );
        
      case 'tally':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tally Server URL</label>
              <input
                type="url"
                value={tallyConfig.server_url}
                onChange={(e) => setTallyConfig({...tallyConfig, server_url: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="http://localhost:9000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
              <input
                type="text"
                value={tallyConfig.company_name}
                onChange={(e) => setTallyConfig({...tallyConfig, company_name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Your Company Name in Tally"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={tallyConfig.username}
                  onChange={(e) => setTallyConfig({...tallyConfig, username: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={tallyConfig.password}
                  onChange={(e) => setTallyConfig({...tallyConfig, password: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sync Frequency</label>
              <select
                value={tallyConfig.sync_frequency}
                onChange={(e) => setTallyConfig({...tallyConfig, sync_frequency: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="realtime">Real-time</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="manual">Manual</option>
              </select>
            </div>
          </div>
        );
        
      case 'email':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Provider</label>
              <select
                value={emailConfig.provider}
                onChange={(e) => setEmailConfig({...emailConfig, provider: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="smtp">SMTP</option>
                <option value="sendgrid">SendGrid</option>
                <option value="mailgun">Mailgun</option>
                <option value="ses">Amazon SES</option>
              </select>
            </div>
            {emailConfig.provider === 'smtp' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
                    <input
                      type="text"
                      value={emailConfig.host}
                      onChange={(e) => setEmailConfig({...emailConfig, host: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="smtp.gmail.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                    <input
                      type="number"
                      value={emailConfig.port}
                      onChange={(e) => setEmailConfig({...emailConfig, port: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="587"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username/Email</label>
                  <input
                    type="email"
                    value={emailConfig.username}
                    onChange={(e) => setEmailConfig({...emailConfig, username: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="noreply@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={emailConfig.password}
                    onChange={(e) => setEmailConfig({...emailConfig, password: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={emailConfig.use_tls}
                      onChange={(e) => setEmailConfig({...emailConfig, use_tls: e.target.checked})}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Use TLS encryption</span>
                  </label>
                </div>
              </>
            )}
          </div>
        );
        
      default:
        return (
          <div className="text-center py-8 text-gray-500">
            Configuration form for {integration.name} is not available yet.
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading integrations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Plug className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Third-Party Integrations</h1>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search integrations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Categories</h3>
            <nav className="space-y-1">
              {categories.map(category => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg ${
                    selectedCategory === category.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span>{category.name}</span>
                  <span className="text-xs text-gray-500">{category.count}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {filteredIntegrations.map(integration => {
                const Icon = integration.icon;
                const isActive = integration.status === 'active';
                const isExpanded = activeIntegration === integration.id;
                const isConfigMode = configuring === integration.id;
                
                return (
                  <div
                    key={integration.id}
                    className={`bg-white rounded-lg border border-gray-200 overflow-hidden ${
                      isExpanded ? 'lg:col-span-2' : ''
                    }`}
                  >
                    {/* Integration Header */}
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-start space-x-4">
                          <div className={`p-3 bg-${integration.color}-100 text-${integration.color}-600 rounded-lg`}>
                            <Icon className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-lg font-medium text-gray-900">{integration.name}</h3>
                            <p className="text-sm text-gray-500 mt-1">{integration.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleIntegration(integration.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                              isActive ? 'bg-green-600' : 'bg-gray-200'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                isActive ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                          <span className={`text-xs font-medium ${
                            isActive ? 'text-green-600' : 'text-gray-500'
                          }`}>
                            {isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mb-4">
                        <h4 className="text-sm font-medium text-gray-700 mb-2">Features</h4>
                        <ul className="space-y-1">
                          {integration.features.map((feature, index) => (
                            <li key={index} className="flex items-center text-sm text-gray-600">
                              <Check className="w-4 h-4 text-green-500 mr-2" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => {
                            setActiveIntegration(isExpanded ? null : integration.id);
                            setConfiguring(integration.id);
                          }}
                          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
                        >
                          <Settings className="w-4 h-4" />
                          <span>Configure</span>
                        </button>
                        {isConfigured(integration) && (
                          <button
                            onClick={() => handleTestConnection(integration.id)}
                            disabled={testingConnection === integration.id}
                            className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex items-center space-x-2 disabled:opacity-50"
                          >
                            {testingConnection === integration.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Shield className="w-4 h-4" />
                            )}
                            <span>Test Connection</span>
                          </button>
                        )}
                        <a
                          href="#"
                          className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
                        >
                          <span>Documentation</span>
                          <ExternalLink className="w-3 h-3 ml-1" />
                        </a>
                      </div>
                    </div>

                    {/* Configuration Panel */}
                    {isExpanded && isConfigMode && (
                      <div className="border-t border-gray-200 p-6 bg-gray-50">
                        <h4 className="text-sm font-medium text-gray-900 mb-4">Configuration Settings</h4>
                        {renderConfigForm(integration)}
                        <div className="mt-6 flex items-center justify-end space-x-3">
                          <button
                            onClick={() => {
                              setConfiguring(null);
                              setActiveIntegration(null);
                            }}
                            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveConfig(integration.id)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Save Configuration
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThirdPartyIntegrations;