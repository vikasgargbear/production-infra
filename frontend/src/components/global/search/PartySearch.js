import React, { useState, useEffect } from 'react';
import { Search, User, Building2, MapPin } from 'lucide-react';

const PartySearch = ({ 
  onSelect, 
  placeholder = "Search party...", 
  partyType = "customer", // customer, supplier, or all
  disabled = false,
  value = null,
  className = ""
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);

  // Mock data - in real app, this would come from API
  const mockParties = [
    {
      id: 1,
      name: 'Apollo Pharmacy',
      type: 'customer',
      address: 'Mumbai, Maharashtra',
      phone: '+91 9876543210',
      gstin: '27ABCDE1234F1Z5',
      balance: 25000,
      group: 'Retail Chain'
    },
    {
      id: 2,
      name: 'MedPlus Mart',
      type: 'customer',
      address: 'Hyderabad, Telangana',
      phone: '+91 9876543211',
      gstin: '36ABCDE1234F1Z6',
      balance: -15000,
      group: 'Retail Chain'
    },
    {
      id: 3,
      name: 'Sun Pharmaceuticals',
      type: 'supplier',
      address: 'Ahmedabad, Gujarat',
      phone: '+91 9876543212',
      gstin: '24ABCDE1234F1Z7',
      balance: -50000,
      group: 'Manufacturer'
    },
    {
      id: 4,
      name: 'Cipla Limited',
      type: 'supplier',
      address: 'Mumbai, Maharashtra',
      phone: '+91 9876543213',
      gstin: '27ABCDE1234F1Z8',
      balance: -30000,
      group: 'Manufacturer'
    },
    {
      id: 5,
      name: 'Wellness Forever',
      type: 'customer',
      address: 'Pune, Maharashtra',
      phone: '+91 9876543214',
      gstin: '27ABCDE1234F1Z9',
      balance: 18000,
      group: 'Retail Chain'
    }
  ];

  useEffect(() => {
    const filteredParties = mockParties.filter(party => {
      const matchesType = partyType === 'all' || party.type === partyType;
      const matchesSearch = party.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           party.gstin.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesType && matchesSearch;
    });
    setParties(filteredParties);
  }, [searchTerm, partyType]);

  const handleSelect = (party) => {
    setSearchTerm(party.name);
    setIsOpen(false);
    onSelect(party);
  };

  const getBalanceColor = (balance) => {
    if (balance > 0) return 'text-red-600'; // Receivable
    if (balance < 0) return 'text-green-600'; // Payable
    return 'text-gray-600'; // Zero balance
  };

  const getBalanceText = (balance, partyType) => {
    if (balance === 0) return '₹0';
    if (partyType === 'customer') {
      return balance > 0 ? `₹${balance.toLocaleString()} Dr` : `₹${Math.abs(balance).toLocaleString()} Cr`;
    } else {
      return balance > 0 ? `₹${balance.toLocaleString()} Cr` : `₹${Math.abs(balance).toLocaleString()} Dr`;
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={value ? value.name : searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            if (!e.target.value && value) {
              onSelect(null);
            }
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
      </div>

      {isOpen && searchTerm && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              <span className="mt-2 block">Searching...</span>
            </div>
          ) : parties.length > 0 ? (
            <div className="py-2">
              {parties.map((party) => (
                <button
                  key={party.id}
                  onClick={() => handleSelect(party)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        {party.type === 'customer' ? (
                          <User className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Building2 className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-sm font-medium text-gray-900 truncate">
                            {party.name}
                          </h4>
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            party.type === 'customer' 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {party.type}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <p className="text-xs text-gray-500 truncate">{party.address}</p>
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          <p className="text-xs text-gray-500">GSTIN: {party.gstin}</p>
                          <span className="text-gray-300">•</span>
                          <p className="text-xs text-gray-500">{party.group}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-medium ${getBalanceColor(party.balance)}`}>
                        {getBalanceText(party.balance, party.type)}
                      </p>
                      <p className="text-xs text-gray-400">Balance</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500">
              <User className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>No parties found</p>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default PartySearch;