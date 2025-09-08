import React from 'react';
import { 
  Pill, 
  Heart, 
  Stethoscope, 
  Activity, 
  Shield, 
  Bell, 
  Search, 
  Timer,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

/**
 * Pharma Feature Showcase Component
 * Highlights all the enhanced pharma-friendly features
 */
const PharmaFeatureShowcase = () => {
  const features = [
    {
      title: "Medical Icons & Quick Stats",
      description: "Real-time tracking with medical iconography",
      icon: Activity,
      color: "from-teal-500 to-cyan-500",
      items: [
        "Today's prescription count",
        "Low stock alerts",
        "Pending orders",
        "Expiry alerts"
      ]
    },
    {
      title: "Pharma Color Scheme",
      description: "Medical-themed colors and gradients",
      icon: Heart,
      color: "from-blue-500 to-indigo-500",
      items: [
        "Teal and mint green themes",
        "Medical cross patterns",
        "Glass morphism effects",
        "Gradient overlays"
      ]
    },
    {
      title: "Quick Medical Actions",
      description: "Rapid access to pharmaceutical tasks",
      icon: Pill,
      color: "from-green-500 to-emerald-500",
      items: [
        "Quick prescription entry",
        "Emergency stock check",
        "Drug interaction checker",
        "Batch expiry viewer"
      ]
    },
    {
      title: "Compliance Indicators",
      description: "Regulatory and licensing monitoring",
      icon: Shield,
      color: "from-amber-500 to-orange-500",
      items: [
        "DGFT compliance status",
        "GST filing status",
        "Narcotic register",
        "License expiry alerts"
      ]
    },
    {
      title: "Drug Search & Autocomplete",
      description: "Advanced pharmaceutical search",
      icon: Search,
      color: "from-purple-500 to-pink-500",
      items: [
        "Quick drug search bar",
        "Recent searches",
        "Autocomplete suggestions",
        "Frequently accessed drugs"
      ]
    },
    {
      title: "Smart Notifications",
      description: "Medical alert and notification system",
      icon: Bell,
      color: "from-red-500 to-pink-500",
      items: [
        "Stock alerts",
        "Expiry warnings",
        "Regulatory updates",
        "Order reminders"
      ]
    },
    {
      title: "Visual Enhancements",
      description: "Modern medical interface design",
      icon: Stethoscope,
      color: "from-indigo-500 to-purple-500",
      items: [
        "Animated pulse alerts",
        "Smooth transitions",
        "Medical illustrations",
        "Hover scale effects"
      ]
    },
    {
      title: "Pharmacist Profile",
      description: "Professional credentials and status",
      icon: CheckCircle2,
      color: "from-cyan-500 to-blue-500",
      items: [
        "License information",
        "Shift timing",
        "Real-time clock",
        "Quick settings"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-teal-50 p-8">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center mb-4">
          <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg mr-4">
            <Heart className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Enhanced Pharma Sidebar</h1>
            <p className="text-xl text-gray-600">Medical-themed navigation with comprehensive features</p>
          </div>
        </div>
        
        {/* Key Benefits */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto mt-8">
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-200 shadow-lg">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Pharmaceutical Focus</h3>
            <p className="text-sm text-gray-600">Designed specifically for pharmacy and healthcare workflows</p>
          </div>
          
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-200 shadow-lg">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Real-time Monitoring</h3>
            <p className="text-sm text-gray-600">Live tracking of prescriptions, stock, and compliance</p>
          </div>
          
          <div className="bg-white/80 backdrop-blur-sm p-6 rounded-xl border border-gray-200 shadow-lg">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-500 rounded-lg flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">Compliance Ready</h3>
            <p className="text-sm text-gray-600">Built-in regulatory and licensing management</p>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {features.map((feature, index) => {
          const IconComponent = feature.icon;
          return (
            <div key={index} className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              {/* Feature Header */}
              <div className={`bg-gradient-to-r ${feature.color} p-6 text-white`}>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <IconComponent className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{feature.title}</h3>
                  </div>
                </div>
                <p className="text-sm opacity-90 mt-2">{feature.description}</p>
              </div>
              
              {/* Feature Items */}
              <div className="p-6">
                <ul className="space-y-3">
                  {feature.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-center text-sm text-gray-700">
                      <div className="w-2 h-2 bg-teal-500 rounded-full mr-3 flex-shrink-0"></div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Technical Specifications */}
      <div className="max-w-4xl mx-auto mt-12">
        <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Timer className="w-6 h-6 mr-3 text-teal-600" />
            Technical Specifications
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Design Features</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Medical color palette (teal, cyan, blue)
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Glass morphism with backdrop blur
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Animated medical icons and patterns
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Gradient overlays and shadows
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Responsive design with mobile support
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-4">Functional Features</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Real-time prescription tracking
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Drug interaction checker integration
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Compliance monitoring dashboard
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Smart notification system
                </li>
                <li className="flex items-center">
                  <CheckCircle2 className="w-4 h-4 text-green-500 mr-2" />
                  Professional pharmacist profile
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Usage Example */}
      <div className="max-w-4xl mx-auto mt-12">
        <div className="bg-gray-900 rounded-xl p-8 text-green-400 font-mono text-sm shadow-lg">
          <h3 className="text-white text-lg font-bold mb-4">Usage Example</h3>
          <pre className="whitespace-pre-wrap">
{`import { EnhancedSidebar } from '../global/navigation';

const PharmaApp = () => {
  const [activeTab, setActiveTab] = useState('home');
  
  return (
    <div className="flex h-screen">
      <EnhancedSidebar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      <div className="flex-1">
        {/* Your pharmacy content */}
      </div>
    </div>
  );
};`}
          </pre>
        </div>
      </div>

      {/* Alert Note */}
      <div className="max-w-4xl mx-auto mt-8">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start">
            <AlertTriangle className="w-6 h-6 text-blue-600 mr-3 mt-0.5" />
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Production Ready</h3>
              <p className="text-blue-800 text-sm">
                This enhanced sidebar component is fully integrated with the global component system 
                and follows all established design patterns. It includes comprehensive error handling, 
                accessibility features, and performance optimizations suitable for production deployment.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PharmaFeatureShowcase;