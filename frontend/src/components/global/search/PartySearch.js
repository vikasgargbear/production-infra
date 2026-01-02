import React, { useState, useEffect } from 'react';
import { Search, User, Building2, MapPin, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { customersApi, suppliersApi } from '../../../services/api';
import localSearchService from '../../../services/offline/search/localSearchService';

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
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load parties with offline fallback
  const loadParties = async (searchQuery = '') => {
    setLoading(true);
    setError(null);

    try {
      let results = [];

      if (partyType === 'customer' || partyType === 'all') {
        // Use localSearchService for customer search from IndexedDB
        const customers = await localSearchService.searchCustomers(searchQuery, { limit: 20 });
        results = [...results, ...customers.map(c => ({ ...c, type: 'customer' }))];
      }

      if (partyType === 'supplier' || partyType === 'all') {
        // Suppliers don't have localFirstService support yet, fallback to API
        try {
          const response = await suppliersApi.search({ query: searchQuery });
          const suppliers = response.data || [];
          results = [...results, ...suppliers.map(s => ({ ...s, type: 'supplier' }))];
        } catch (err) {
          console.warn('Supplier search failed:', err);
          // Don't fail entire search if only supplier search fails
        }
      }

      setParties(results);

      if (results.length === 0 && searchQuery) {
        // No specific error, just no results
      }
    } catch (error) {
      console.error('Party search failed:', error);
      setError('Unable to load party data. Please check your connection.');
      setParties([]);
    } finally {
      setLoading(false);
    }
  };

  // Refresh parties
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);

    try {
      await loadParties(searchTerm);
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Search parties
  const searchParties = async (query) => {
    if (!query.trim()) {
      await loadParties();
      return;
    }

    await loadParties(query);
  };

  // Handle search input change
  const handleSearchChange = (value) => {
    setSearchTerm(value);

    // Debounce search
    const timeoutId = setTimeout(() => {
      searchParties(value);
    }, 300);

    return () => clearTimeout(timeoutId);
  };

  // Handle party selection
  const handleSelect = (party) => {
    setSearchTerm(party.name || party.party_name || '');
    setIsOpen(false);
    onSelect(party);
  };

  // Get balance color
  const getBalanceColor = (balance) => {
    if (!balance || balance === 0) return 'text-gray-600';
    if (balance > 0) return 'text-red-600'; // Receivable
    if (balance < 0) return 'text-green-600'; // Payable
    return 'text-gray-600';
  };

  // Get balance text
  const getBalanceText = (balance, partyType) => {
    if (!balance || balance === 0) return '₹0';

    const absBalance = Math.abs(balance);
    if (partyType === 'customer') {
      return balance > 0 ? `₹${absBalance.toLocaleString()} Dr` : `₹${absBalance.toLocaleString()} Cr`;
    } else {
      return balance > 0 ? `₹${absBalance.toLocaleString()} Cr` : `₹${absBalance.toLocaleString()} Dr`;
    }
  };

  // Get party icon
  const getPartyIcon = (type) => {
    return type === 'supplier' ? Building2 : User;
  };

  // Load initial data
  useEffect(() => {
    if (isOpen) {
      loadParties();
    }
  }, [isOpen, partyType]);

  // Clear old offline data periodically
  // REMOVED: offlineStorage cleanup handled by localFirstService internally
  /*
  useEffect(() => {
    const interval = setInterval(() => {
     // ...
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  */

  // Set initial value
  useEffect(() => {
    if (value) {
      setSearchTerm(value.name || value.party_name || '');
    }
  }, [value]);

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {/* Refresh Button */}
        {isOpen && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">
                {partyType === 'all' ? 'All Parties' :
                  partyType === 'customer' ? 'Customers' : 'Suppliers'}
              </h3>
              <span className="text-xs text-gray-500">
                {parties.length} found
              </span>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border-b border-red-200">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <span className="text-sm text-red-800">{error}</span>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="p-4 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-sm text-gray-600">Searching parties...</p>
            </div>
          )}

          {/* Results */}
          {!loading && (
            <>
              {parties.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  <User className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">No parties found</p>
                  {searchTerm && (
                    <p className="text-xs text-gray-400 mt-1">
                      Try a different search term
                    </p>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {parties.map((party) => {
                    const Icon = getPartyIcon(party.type);
                    const balance = party.balance || party.outstanding_balance || 0;

                    return (
                      <div
                        key={party.id || party.party_id}
                        onClick={() => handleSelect(party)}
                        className="p-3 hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <div className="flex items-start space-x-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <Icon className="w-4 h-4 text-gray-600" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="text-sm font-medium text-gray-900 mb-1">
                                  {party.name || party.party_name || 'Unnamed Party'}
                                </h4>

                                <div className="flex items-center space-x-4 text-xs text-gray-500 mb-2">
                                  {party.gstin && (
                                    <span className="font-mono">{party.gstin}</span>
                                  )}
                                  {party.phone && (
                                    <span>{party.phone}</span>
                                  )}
                                </div>

                                {party.address && (
                                  <div className="flex items-center text-xs text-gray-500 mb-2">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    <span>{party.address}</span>
                                  </div>
                                )}

                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-medium ${getBalanceColor(balance)}`}>
                                    {getBalanceText(balance, party.type)}
                                  </span>

                                  {party.group && (
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                      {party.group}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="p-2 border-t border-gray-200 bg-gray-50">
            <div className="text-xs text-gray-500 text-center">
              {parties.length > 0 && (
                <span>Click on a party to select</span>
              )}
            </div>
          </div>
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