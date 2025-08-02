import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Smartphone,
  QrCode,
  CheckCircle,
  AlertCircle,
  IndianRupee,
  Package,
  Users,
  Clock,
  TrendingUp,
  Send,
  Camera,
  Share2,
  HelpCircle,
  ArrowRight,
  Star,
  Gift,
  Megaphone
} from 'lucide-react';

const WhatsAppSimple = () => {
  const [activeTab, setActiveTab] = useState('quick-start');
  const [businessPhone, setBusinessPhone] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  // Business stats
  const [stats] = useState({
    ordersToday: 12,
    pendingReplies: 5,
    todayEarnings: 8500,
    activeCustomers: 145
  });

  // Simple product catalog
  const [catalog] = useState([
    { id: 1, name: 'Paracetamol 500mg', price: 35, stock: 'In Stock' },
    { id: 2, name: 'Cough Syrup 100ml', price: 85, stock: 'In Stock' },
    { id: 3, name: 'Vitamin C Tablets', price: 120, stock: 'Low Stock' }
  ]);

  // Quick message templates in Hindi/English
  const templates = {
    welcome: {
      hindi: "नमस्ते! {{company}} में आपका स्वागत है। आज आपकी क्या मदद कर सकते हैं?\n\n1️⃣ दवाई ऑर्डर करें\n2️⃣ Price List देखें\n3️⃣ Offers देखें\n\nReply करें 1, 2 या 3",
      english: "Welcome to {{company}}! How can we help you today?\n\n1️⃣ Order Medicine\n2️⃣ View Price List\n3️⃣ Today's Offers\n\nReply 1, 2 or 3"
    },
    orderConfirm: {
      hindi: "आपका ऑर्डर confirm हो गया है! 🎉\n\nOrder #{{orderId}}\nTotal: ₹{{amount}}\n\nDelivery: {{time}}\n\nधन्यवाद! 🙏",
      english: "Your order is confirmed! 🎉\n\nOrder #{{orderId}}\nTotal: ₹{{amount}}\n\nDelivery: {{time}}\n\nThank you! 🙏"
    },
    payment: {
      hindi: "Payment के लिए:\n\n💰 Cash on Delivery\n📱 UPI: {{upi}}\n🏦 Account: {{account}}\n\nPayment के बाद screenshot भेजें",
      english: "For Payment:\n\n💰 Cash on Delivery\n📱 UPI: {{upi}}\n🏦 Account: {{account}}\n\nSend screenshot after payment"
    }
  };

  const handleConnect = () => {
    if (!businessPhone) {
      alert('कृपया अपना WhatsApp Business नंबर डालें / Please enter your WhatsApp Business number');
      return;
    }
    // Simulate connection
    setIsConnected(true);
    alert('WhatsApp Business connected successfully! 🎉');
  };

  const shareProduct = (product) => {
    const message = `*${product.name}*\n💊 Price: ₹${product.price}\n✅ ${product.stock}\n\nOrder now on WhatsApp!`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const sendBulkMessage = (template) => {
    alert(`Message template "${template}" will be sent to all customers! 📤`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Simple Header */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <MessageSquare className="w-8 h-8 mr-3" />
              <div>
                <h1 className="text-xl font-bold">WhatsApp for Business</h1>
                <p className="text-sm opacity-90">बिज़नेस बढ़ाएं WhatsApp से / Grow Business with WhatsApp</p>
              </div>
            </div>
            {isConnected ? (
              <div className="flex items-center bg-white/20 px-3 py-1 rounded-full">
                <CheckCircle className="w-4 h-4 mr-2" />
                <span className="text-sm">Connected</span>
              </div>
            ) : (
              <button
                onClick={() => setShowHelp(true)}
                className="p-2 hover:bg-white/20 rounded-full"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {isConnected && (
        <div className="bg-white border-b">
          <div className="max-w-6xl mx-auto p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{stats.ordersToday}</div>
                <div className="text-sm text-gray-600">आज के Orders</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.pendingReplies}</div>
                <div className="text-sm text-gray-600">Reply करना है</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">₹{stats.todayEarnings}</div>
                <div className="text-sm text-gray-600">आज की कमाई</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{stats.activeCustomers}</div>
                <div className="text-sm text-gray-600">Active Customers</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto p-4">
        {!isConnected ? (
          // Connection Setup - Super Simple
          <div className="bg-white rounded-lg shadow-lg p-8 text-center max-w-md mx-auto mt-8">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Smartphone className="w-10 h-10 text-green-600" />
            </div>
            
            <h2 className="text-2xl font-bold mb-2">WhatsApp से जुड़ें</h2>
            <p className="text-gray-600 mb-6">अपना WhatsApp Business नंबर डालें</p>
            
            <div className="space-y-4">
              <div>
                <input
                  type="tel"
                  placeholder="Enter your WhatsApp number (e.g., 9876543210)"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  className="w-full px-4 py-3 border rounded-lg text-center text-lg"
                  maxLength="10"
                />
              </div>
              
              <button
                onClick={handleConnect}
                className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700"
              >
                Connect WhatsApp Business
              </button>
              
              <p className="text-xs text-gray-500">
                Free for 1000 messages/month • No credit card required
              </p>
            </div>

            {/* Benefits */}
            <div className="mt-8 text-left space-y-3">
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2 mt-0.5" />
                <div>
                  <p className="font-medium">Automatic Order Taking</p>
                  <p className="text-sm text-gray-600">Customers can order 24/7</p>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2 mt-0.5" />
                <div>
                  <p className="font-medium">Share Product Catalog</p>
                  <p className="text-sm text-gray-600">Send prices instantly</p>
                </div>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2 mt-0.5" />
                <div>
                  <p className="font-medium">Payment Reminders</p>
                  <p className="text-sm text-gray-600">Automatic payment follow-ups</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="bg-white rounded-lg mb-4 p-1">
              <div className="flex space-x-1">
                {[
                  { id: 'quick-start', label: 'Quick Actions', icon: Smartphone },
                  { id: 'catalog', label: 'Product Sharing', icon: Package },
                  { id: 'broadcast', label: 'Bulk Messages', icon: Megaphone },
                  { id: 'auto-reply', label: 'Auto Reply', icon: Clock }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center px-4 py-3 rounded-lg font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-green-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <tab.icon className="w-4 h-4 mr-2" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            {activeTab === 'quick-start' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Quick Actions */}
                <div className="bg-white rounded-lg p-6">
                  <h3 className="font-semibold text-lg mb-4">Quick Actions</h3>
                  <div className="space-y-3">
                    <button className="w-full flex items-center justify-between p-4 bg-green-50 rounded-lg hover:bg-green-100">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-green-600 rounded-lg flex items-center justify-center mr-3">
                          <QrCode className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">Share QR Code</p>
                          <p className="text-sm text-gray-600">Customers scan to message</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </button>

                    <button className="w-full flex items-center justify-between p-4 bg-blue-50 rounded-lg hover:bg-blue-100">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                          <Share2 className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">Share Catalog Link</p>
                          <p className="text-sm text-gray-600">wa.me/91{businessPhone}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </button>

                    <button className="w-full flex items-center justify-between p-4 bg-purple-50 rounded-lg hover:bg-purple-100">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center mr-3">
                          <Gift className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">Today's Offer</p>
                          <p className="text-sm text-gray-600">Send to all customers</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>
                </div>

                {/* Message Templates */}
                <div className="bg-white rounded-lg p-6">
                  <h3 className="font-semibold text-lg mb-4">Ready Messages (Hindi/English)</h3>
                  <div className="space-y-3">
                    {Object.entries(templates).map(([key, template]) => (
                      <div key={key} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                          <button
                            onClick={() => navigator.clipboard.writeText(template.hindi)}
                            className="text-sm text-green-600 hover:text-green-700"
                          >
                            Copy Hindi
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-line line-clamp-2">
                          {template.hindi}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'catalog' && (
              <div className="bg-white rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-semibold text-lg">Product Catalog</h3>
                  <button className="flex items-center px-3 py-1 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                    <Camera className="w-4 h-4 mr-1" />
                    Add Photo
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {catalog.map((product) => (
                    <div key={product.id} className="border rounded-lg p-4">
                      <div className="aspect-square bg-gray-100 rounded-lg mb-3 flex items-center justify-center">
                        <Package className="w-12 h-12 text-gray-400" />
                      </div>
                      <h4 className="font-medium">{product.name}</h4>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-bold text-green-600">₹{product.price}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          product.stock === 'In Stock' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {product.stock}
                        </span>
                      </div>
                      <button
                        onClick={() => shareProduct(product)}
                        className="w-full mt-3 bg-green-100 text-green-700 py-2 rounded-lg text-sm hover:bg-green-200"
                      >
                        Share on WhatsApp
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'broadcast' && (
              <div className="bg-white rounded-lg p-6">
                <h3 className="font-semibold text-lg mb-6">Send Bulk Messages</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Quick Broadcasts</h4>
                    <div className="space-y-3">
                      <button
                        onClick={() => sendBulkMessage('Festival Offer')}
                        className="w-full p-4 border rounded-lg hover:bg-gray-50 text-left"
                      >
                        <div className="flex items-center mb-2">
                          <Star className="w-5 h-5 text-yellow-500 mr-2" />
                          <span className="font-medium">Festival Offer</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          "🪔 Diwali Special! 20% off on all medicines. Valid till Sunday only!"
                        </p>
                      </button>

                      <button
                        onClick={() => sendBulkMessage('New Stock')}
                        className="w-full p-4 border rounded-lg hover:bg-gray-50 text-left"
                      >
                        <div className="flex items-center mb-2">
                          <Package className="w-5 h-5 text-blue-500 mr-2" />
                          <span className="font-medium">New Stock Alert</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          "✅ COVID essentials back in stock! Masks, Sanitizers, Oximeters available."
                        </p>
                      </button>

                      <button
                        onClick={() => sendBulkMessage('Payment Reminder')}
                        className="w-full p-4 border rounded-lg hover:bg-gray-50 text-left"
                      >
                        <div className="flex items-center mb-2">
                          <IndianRupee className="w-5 h-5 text-green-500 mr-2" />
                          <span className="font-medium">Payment Reminder</span>
                        </div>
                        <p className="text-sm text-gray-600">
                          "🙏 Gentle reminder: Your payment of ₹{'{amount}'} is pending. Please pay at earliest."
                        </p>
                      </button>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium mb-3">Broadcast Stats</h4>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Messages Sent Today</span>
                        <span className="font-medium">156</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Read Rate</span>
                        <span className="font-medium text-green-600">92%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Reply Rate</span>
                        <span className="font-medium text-blue-600">34%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Messages Left Today</span>
                        <span className="font-medium">844</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'auto-reply' && (
              <div className="bg-white rounded-lg p-6">
                <h3 className="font-semibold text-lg mb-6">Auto Reply Setup</h3>
                
                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">Business Hours Reply</h4>
                        <p className="text-sm text-gray-600">Mon-Sat, 9 AM - 8 PM</p>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600 mr-2">Active</span>
                        <input type="checkbox" defaultChecked className="toggle" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-3 text-sm">
                      "Welcome! Send 1 for Medicine List, 2 for Today's Offers, 3 to Talk to Owner"
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">After Hours Reply</h4>
                        <p className="text-sm text-gray-600">8 PM - 9 AM, Sundays</p>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600 mr-2">Active</span>
                        <input type="checkbox" defaultChecked className="toggle" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-3 text-sm">
                      "🙏 Store closed now. We open at 9 AM. Your message saved. We'll reply tomorrow!"
                    </div>
                  </div>

                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="font-medium">Order Confirmation</h4>
                        <p className="text-sm text-gray-600">When customer sends order</p>
                      </div>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600 mr-2">Active</span>
                        <input type="checkbox" defaultChecked className="toggle" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded p-3 text-sm">
                      "✅ Order received! We'll confirm in 5 minutes with total amount and delivery time."
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">How WhatsApp Business Helps</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">For Medicine Shops:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Customers can order medicines anytime</li>
                  <li>• Share price list instantly</li>
                  <li>• Send delivery updates automatically</li>
                  <li>• Collect payments via UPI links</li>
                </ul>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">Real Examples:</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• "Rajesh Medical Store increased sales by 40%"</li>
                  <li>• "City Pharmacy saves 2 hours daily on orders"</li>
                  <li>• "Apollo Chemist gets 50+ orders via WhatsApp"</li>
                </ul>
              </div>
              
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-green-800">
                  <strong>Free Trial:</strong> Send 1000 messages free every month. No credit card needed!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppSimple;