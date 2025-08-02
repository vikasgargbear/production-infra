import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, 
  Download, Upload, Loader2, AlertCircle, Check,
  Phone, Mail, MapPin
} from 'lucide-react';
import { customersApi, suppliersApi } from '../../services/api';
import { PartyEditModal } from '../global/modals';

const PartyMaster = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingParty, setEditingParty] = useState(null);
  const [selectedParties, setSelectedParties] = useState([]);
  const [parties, setParties] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  
  // Load parties on component mount
  useEffect(() => {
    if (open) {
      loadParties();
    }
  }, [open, filterType]);
  
  // Load parties from API
  const loadParties = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      let allParties = [];
      
      if (filterType === 'all' || filterType === 'customer') {
        const customersResponse = await customersApi.getAll();
        console.log('Customers API Response:', customersResponse);
        console.log('Customers data structure:', customersResponse.data);
        console.log('First customer:', customersResponse.data?.[0] || customersResponse.data?.data?.[0] || customersResponse.data?.customers?.[0]);
        // Handle different response formats
        let customersData = [];
        if (customersResponse.data) {
          if (Array.isArray(customersResponse.data)) {
            customersData = customersResponse.data;
          } else if (customersResponse.data.data && Array.isArray(customersResponse.data.data)) {
            customersData = customersResponse.data.data;
          } else if (customersResponse.data.customers && Array.isArray(customersResponse.data.customers)) {
            customersData = customersResponse.data.customers;
          }
        }
        const customers = customersData.map(c => ({ ...c, type: 'customer' }));
        allParties = [...allParties, ...customers];
      }
      
      if (filterType === 'all' || filterType === 'supplier') {
        const suppliersResponse = await suppliersApi.getAll();
        console.log('Suppliers API Response:', suppliersResponse);
        // Handle different response formats
        let suppliersData = [];
        if (suppliersResponse.data) {
          if (Array.isArray(suppliersResponse.data)) {
            suppliersData = suppliersResponse.data;
          } else if (suppliersResponse.data.data && Array.isArray(suppliersResponse.data.data)) {
            suppliersData = suppliersResponse.data.data;
          } else if (suppliersResponse.data.suppliers && Array.isArray(suppliersResponse.data.suppliers)) {
            suppliersData = suppliersResponse.data.suppliers;
          }
        }
        const suppliers = suppliersData.map(s => ({ ...s, type: 'supplier' }));
        allParties = [...allParties, ...suppliers];
      }
      
      setParties(allParties);
    } catch (err) {
      console.error('Error loading parties:', err);
      setError('Failed to load parties. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Search parties
  const searchParties = async (query) => {
    if (!query.trim()) {
      loadParties();
      return;
    }
    
    try {
      setIsLoading(true);
      let searchResults = [];
      
      if (filterType === 'all' || filterType === 'customer') {
        const customersResponse = await customersApi.search(query);
        // Handle different response formats
        let customersData = [];
        if (customersResponse.data) {
          if (Array.isArray(customersResponse.data)) {
            customersData = customersResponse.data;
          } else if (customersResponse.data.data && Array.isArray(customersResponse.data.data)) {
            customersData = customersResponse.data.data;
          } else if (customersResponse.data.customers && Array.isArray(customersResponse.data.customers)) {
            customersData = customersResponse.data.customers;
          }
        }
        const customers = customersData.map(c => ({ ...c, type: 'customer' }));
        searchResults = [...searchResults, ...customers];
      }
      
      if (filterType === 'all' || filterType === 'supplier') {
        const suppliersResponse = await suppliersApi.search(query);
        // Handle different response formats
        let suppliersData = [];
        if (suppliersResponse.data) {
          if (Array.isArray(suppliersResponse.data)) {
            suppliersData = suppliersResponse.data;
          } else if (suppliersResponse.data.data && Array.isArray(suppliersResponse.data.data)) {
            suppliersData = suppliersResponse.data.data;
          } else if (suppliersResponse.data.suppliers && Array.isArray(suppliersResponse.data.suppliers)) {
            suppliersData = suppliersResponse.data.suppliers;
          }
        }
        const suppliers = suppliersData.map(s => ({ ...s, type: 'supplier' }));
        searchResults = [...searchResults, ...suppliers];
      }
      
      setParties(searchResults);
    } catch (err) {
      console.error('Error searching parties:', err);
      setError('Failed to search parties.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      searchParties(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const partyTypes = [
    { value: 'all', label: 'All' },
    { value: 'customer', label: 'Customer' },
    { value: 'supplier', label: 'Supplier' },
    { value: 'both', label: 'Both' }
  ];


  // Handle sorting
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  // Sort parties
  const sortedParties = [...parties].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];
    
    // Handle special cases
    if (sortConfig.key === 'balance') {
      aValue = a.current_balance || a.balance || a.outstanding_amount || a.currentBalance || 0;
      bValue = b.current_balance || b.balance || b.outstanding_amount || b.currentBalance || 0;
    } else if (sortConfig.key === 'default_discount') {
      aValue = a.default_discount || a.defaultDiscount || 0;
      bValue = b.default_discount || b.defaultDiscount || 0;
    }
    
    // Numeric comparison
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    }
    
    // String comparison
    aValue = String(aValue || '').toLowerCase();
    bValue = String(bValue || '').toLowerCase();
    
    if (sortConfig.direction === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  const filteredParties = sortedParties.filter(party => {
    const matchesSearch = searchTerm === '' ||
                         party.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         party.party_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         party.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         party.gstin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         party.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || party.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleEdit = (party) => {
    setEditingParty(party);
    setShowAddModal(true);
  };

  const handleDelete = async (id, type) => {
    if (window.confirm('Are you sure you want to delete this party?')) {
      try {
        const api = type === 'supplier' ? suppliersApi : customersApi;
        await api.delete(id);
        setSuccessMessage('Party deleted successfully!');
        await loadParties();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (err) {
        console.error('Error deleting party:', err);
        setError(err.response?.data?.message || 'Failed to delete party.');
      }
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingParty(null);
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    alert('Export functionality coming soon!');
  };

  const handleImport = () => {
    // TODO: Implement import functionality
    alert('Import functionality coming soon!');
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'customer': return 'blue';
      case 'supplier': return 'green';
      case 'both': return 'purple';
      default: return 'gray';
    }
  };

  const formatBalance = (balance) => {
    const amount = Math.abs(balance || 0);
    const formatted = `₹${amount.toLocaleString('en-IN')}`;
    if (balance < 0) {
      return <span className="text-red-600">{formatted} Dr</span>;
    } else if (balance > 0) {
      return <span className="text-green-600">{formatted} Cr</span>;
    }
    return <span className="text-gray-600">{formatted}</span>;
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Users className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Party Master</h1>
            <span className="text-sm text-gray-500">({parties.length} parties)</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Party</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, code, or GSTIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {partyTypes.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Parties Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading parties...</span>
          </div>
        ) : (
        <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
          <div className="flex-1 overflow-auto">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedParties(filteredParties.map(p => p.id));
                        } else {
                          setSelectedParties([]);
                        }
                      }}
                    />
                  </th>
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center">
                      Party Details
                      {sortConfig.key === 'name' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact Info</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Terms</th>
                  <th 
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('default_discount')}
                  >
                    <div className="flex items-center justify-center">
                      Discount %
                      {sortConfig.key === 'default_discount' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('balance')}
                  >
                    <div className="flex items-center justify-end">
                      Balance
                      {sortConfig.key === 'balance' && (
                        <span className="ml-1">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredParties.map((party, index) => {
                  const typeColor = getTypeColor(party.type);
                  const partyId = party.id || party.customer_id || party.supplier_id || party.party_id || `${party.type}-${index}`;
                  return (
                    <tr key={partyId} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedParties.includes(partyId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedParties([...selectedParties, partyId]);
                            } else {
                              setSelectedParties(selectedParties.filter(id => id !== partyId));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {party.name || party.party_name || party.customer_name || party.supplier_name || 'Unnamed Party'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {party.gstin ? `GSTIN: ${party.gstin}` : 'No GSTIN'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full bg-${getTypeColor(party.type)}-100 text-${getTypeColor(party.type)}-800`}>
                              {party.type || 'customer'}
                            </span>
                            {(party.tags || []).map(tag => (
                              <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          {party.phone && (
                            <div className="flex items-center text-sm text-gray-900">
                              <Phone className="w-3 h-3 mr-1 text-gray-400" />
                              {party.phone}
                            </div>
                          )}
                          {party.email && (
                            <div className="flex items-center text-sm text-gray-600">
                              <Mail className="w-3 h-3 mr-1 text-gray-400" />
                              {party.email}
                            </div>
                          )}
                          {party.address && (
                            <div className="text-sm text-gray-600">
                              {party.address}
                            </div>
                          )}
                          {(party.city || party.state) && (
                            <div className="flex items-center text-sm text-gray-600">
                              <MapPin className="w-3 h-3 mr-1 text-gray-400" />
                              {[party.city, party.state].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1">
                          <p className="text-sm text-gray-900">
                            ₹{(party.credit_limit || party.creditLimit || 0).toLocaleString('en-IN')}
                          </p>
                          <p className="text-sm text-gray-600">
                            {party.credit_days || party.creditDays || 30} days
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
                          {party.default_discount || party.defaultDiscount || 0}%
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {formatBalance(party.current_balance || party.balance || party.outstanding_amount || party.currentBalance || 0)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(party)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(partyId, party.type)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {/* Global Party Edit Modal */}
      <PartyEditModal 
        isOpen={showAddModal}
        onClose={handleCloseModal}
        party={editingParty}
        partyType={filterType === 'all' ? 'customer' : filterType}
        onSave={() => {
          loadParties();
          setSuccessMessage(editingParty ? 'Party updated successfully!' : 'Party added successfully!');
          setTimeout(() => setSuccessMessage(''), 3000);
        }}
        mode={editingParty ? 'edit' : 'create'}
      />
    </div>
  );
};

export default PartyMaster;