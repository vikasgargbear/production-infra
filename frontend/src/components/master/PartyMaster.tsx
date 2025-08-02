import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, 
  Download, Upload, Loader2, AlertCircle, Check,
  Phone, Mail, MapPin
} from 'lucide-react';
import { customersApi, suppliersApi } from '../../services/api';
import { PartyEditModal } from '../global/modals';

interface Party {
  id: string;
  name?: string;
  customer_name?: string;
  supplier_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gst_number?: string;
  type: 'customer' | 'supplier';
  is_active?: boolean;
  credit_limit?: number;
  [key: string]: any;
}

interface SortConfig {
  key: string | null;
  direction: 'asc' | 'desc';
}

interface PartyMasterProps {
  open: boolean;
  onClose: () => void;
}

const PartyMaster: React.FC<PartyMasterProps> = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
  
  // Load parties on component mount
  useEffect(() => {
    if (open) {
      loadParties();
    }
  }, [open, filterType]);
  
  // Load parties from API
  const loadParties = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      
      let allParties: Party[] = [];
      
      if (filterType === 'all' || filterType === 'customer') {
        const customersResponse = await customersApi.getAll();
        console.log('Customers API Response:', customersResponse);
        console.log('Customers data structure:', customersResponse.data);
        console.log('First customer:', customersResponse.data?.[0] || customersResponse.data?.data?.[0] || customersResponse.data?.customers?.[0]);
        // Handle different response formats
        let customersData: any[] = [];
        if (customersResponse.data) {
          if (Array.isArray(customersResponse.data)) {
            customersData = customersResponse.data;
          } else if (customersResponse.data.data && Array.isArray(customersResponse.data.data)) {
            customersData = customersResponse.data.data;
          } else if (customersResponse.data.customers && Array.isArray(customersResponse.data.customers)) {
            customersData = customersResponse.data.customers;
          }
        }
        const customers = customersData.map(c => ({ ...c, type: 'customer' as const }));
        allParties = [...allParties, ...customers];
      }
      
      if (filterType === 'all' || filterType === 'supplier') {
        const suppliersResponse = await suppliersApi.getAll();
        console.log('Suppliers API Response:', suppliersResponse);
        // Handle different response formats
        let suppliersData: any[] = [];
        if (suppliersResponse.data) {
          if (Array.isArray(suppliersResponse.data)) {
            suppliersData = suppliersResponse.data;
          } else if (suppliersResponse.data.data && Array.isArray(suppliersResponse.data.data)) {
            suppliersData = suppliersResponse.data.data;
          } else if (suppliersResponse.data.suppliers && Array.isArray(suppliersResponse.data.suppliers)) {
            suppliersData = suppliersResponse.data.suppliers;
          }
        }
        const suppliers = suppliersData.map(s => ({ ...s, type: 'supplier' as const }));
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
  const searchParties = async (query: string): Promise<void> => {
    if (!query.trim()) {
      loadParties();
      return;
    }
    
    try {
      setIsLoading(true);
      let searchResults: Party[] = [];
      
      if (filterType === 'all' || filterType === 'customer') {
        const customersResponse = await customersApi.search(query);
        // Handle different response formats
        let customersData: any[] = [];
        if (customersResponse.data) {
          if (Array.isArray(customersResponse.data)) {
            customersData = customersResponse.data;
          } else if (customersResponse.data.data && Array.isArray(customersResponse.data.data)) {
            customersData = customersResponse.data.data;
          }
        }
        const customers = customersData.map(c => ({ ...c, type: 'customer' as const }));
        searchResults = [...searchResults, ...customers];
      }
      
      if (filterType === 'all' || filterType === 'supplier') {
        const suppliersResponse = await suppliersApi.search(query);
        let suppliersData: any[] = [];
        if (suppliersResponse.data) {
          if (Array.isArray(suppliersResponse.data)) {
            suppliersData = suppliersResponse.data;
          } else if (suppliersResponse.data.data && Array.isArray(suppliersResponse.data.data)) {
            suppliersData = suppliersResponse.data.data;
          }
        }
        const suppliers = suppliersData.map(s => ({ ...s, type: 'supplier' as const }));
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

  const getPartyName = (party: Party): string => {
    return party.name || party.customer_name || party.supplier_name || 'Unknown';
  };

  const handleEditParty = (party: Party): void => {
    setEditingParty(party);
  };

  const handleDeleteParty = async (partyId: string, partyType: string): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this party?')) {
      return;
    }

    try {
      if (partyType === 'customer') {
        await customersApi.delete(partyId);
      } else {
        await suppliersApi.delete(partyId);
      }
      setSuccessMessage('Party deleted successfully');
      loadParties();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error deleting party:', err);
      setError('Failed to delete party.');
    }
  };

  const handlePartySaved = (): void => {
    setEditingParty(null);
    setShowAddModal(false);
    loadParties();
    setSuccessMessage('Party saved successfully');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const togglePartySelection = (partyId: string): void => {
    setSelectedParties(prev => 
      prev.includes(partyId) 
        ? prev.filter(id => id !== partyId)
        : [...prev, partyId]
    );
  };

  const toggleAllSelection = (): void => {
    if (selectedParties.length === parties.length) {
      setSelectedParties([]);
    } else {
      setSelectedParties(parties.map(p => p.id));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl mx-4 h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Users className="w-6 h-6 text-gray-700" />
              <h1 className="text-2xl font-bold text-gray-900">Party Master</h1>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Party</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-green-800">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search parties by name, phone, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Parties</option>
              <option value="customer">Customers Only</option>
              <option value="supplier">Suppliers Only</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Loading parties...</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedParties.length === parties.length && parties.length > 0}
                        onChange={toggleAllSelection}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GST Number</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {parties.map((party) => (
                    <tr key={party.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedParties.includes(party.id)}
                          onChange={() => togglePartySelection(party.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900">{getPartyName(party)}</div>
                        {party.address && (
                          <div className="text-sm text-gray-500 flex items-center mt-1">
                            <MapPin className="w-3 h-3 mr-1" />
                            {party.address}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          party.type === 'customer' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          {party.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {party.phone && (
                          <div className="text-sm text-gray-900 flex items-center">
                            <Phone className="w-3 h-3 mr-1" />
                            {party.phone}
                          </div>
                        )}
                        {party.email && (
                          <div className="text-sm text-gray-500 flex items-center mt-1">
                            <Mail className="w-3 h-3 mr-1" />
                            {party.email}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{party.gst_number || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          party.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {party.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEditParty(party)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteParty(party.id, party.type)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {parties.length === 0 && !isLoading && (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No parties found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Party Edit/Add Modal */}
      {(showAddModal || editingParty) && (
        <PartyEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingParty(null);
          }}
          onSave={handlePartySaved}
          party={editingParty}
        />
      )}
    </div>
  );
};

export default PartyMaster;