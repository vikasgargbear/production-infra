import React, { useState, useEffect } from 'react';
import { 
  Building2, Search, CheckCircle, AlertCircle, 
  Plus, MapPin, Phone, FileText, Calendar,
  ChevronDown, ChevronUp, Landmark, Info
} from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import { debounce } from 'lodash';

/**
 * SupplierVerificationModal - Verify or create supplier from extracted data
 */
const SupplierVerificationModal = ({ 
  extractedSupplier, 
  onVerified, 
  onCancel 
}) => {
  const [mode, setMode] = useState('searching'); // 'searching', 'found', 'create'
  const [searchResults, setSearchResults] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [searchQuery, setSearchQuery] = useState(extractedSupplier?.name || '');
  const [supplierForm, setSupplierForm] = useState({
    // Basic Information
    supplier_name: extractedSupplier?.name || '',
    supplier_code: '',
    contact_person: extractedSupplier?.contact_person || '',
    contact_person_phone: extractedSupplier?.contact_phone || '',
    contact_person_email: '',
    phone: extractedSupplier?.mobile || extractedSupplier?.phone || '',
    whatsapp_number: extractedSupplier?.mobile || '',
    alternate_phone: '',
    email: extractedSupplier?.email || '',
    website: extractedSupplier?.website || '',
    
    // Address Information
    address: extractedSupplier?.address || '',
    address_line1: extractedSupplier?.address_line1 || '',
    address_line2: extractedSupplier?.address_line2 || '',
    city: extractedSupplier?.city || '',
    state: extractedSupplier?.state || 'Maharashtra',
    pincode: extractedSupplier?.pincode || '',
    country: 'India',
    
    // Tax & Compliance
    gstin: extractedSupplier?.gstin || '',
    pan_number: extractedSupplier?.pan || '',
    drug_license_no: extractedSupplier?.drug_license || '',
    drug_license_validity: '',
    
    // Banking Details
    payment_terms: '30',
    bank_name: extractedSupplier?.bank_name || '',
    bank_account_no: extractedSupplier?.account_no || '',
    bank_ifsc_code: extractedSupplier?.ifsc || '',
    account_holder_name: '',
    
    // Additional
    supplier_type: 'distributor',
    notes: '',
    is_active: true
  });
  const [loading, setLoading] = useState(false);
  const [autoSelected, setAutoSelected] = useState(null);
  const [expandedSections, setExpandedSections] = useState({
    compliance: false,
    banking: false,
    address: true // Keep address expanded by default
  });

  // Search for existing supplier
  useEffect(() => {
    // Initial search with multiple approaches
    const performInitialSearch = async () => {
      setLoading(true);
      
      // Try GSTIN search first if available
      if (extractedSupplier?.gstin) {
        await searchSupplier(extractedSupplier.gstin);
      }
      
      // Also try name search
      if (extractedSupplier?.name && searchResults.length === 0) {
        await searchSupplier(extractedSupplier.name);
      }
      
      setLoading(false);
    };
    
    performInitialSearch();
  }, []);

  const searchSupplier = async (query = null) => {
    setLoading(true);
    try {
      const searchTerm = query || searchQuery || extractedSupplier?.name || '';
      
      if (!searchTerm && !extractedSupplier?.gstin) {
        setMode('create');
        setLoading(false);
        return;
      }

      // Search using the search API
      const response = await suppliersApi.search(searchTerm, { limit: 10 });
      
      if (response && response.length > 0) {
        // Process results and check for matches
        const results = response.map(supplier => {
          let matchScore = 0;
          let matchType = [];
          
          // Check GSTIN match (highest priority)
          if (extractedSupplier?.gstin && supplier.gstin) {
            if (supplier.gstin.toLowerCase() === extractedSupplier.gstin.toLowerCase()) {
              matchScore = 100;
              matchType.push('GSTIN');
            }
          }
          
          // Check name match with fuzzy matching
          if (supplier.supplier_name && extractedSupplier?.name) {
            const supplierNameLower = supplier.supplier_name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const extractedNameLower = extractedSupplier.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            
            // Check various matching strategies
            if (supplierNameLower === extractedNameLower) {
              // Exact match (ignoring special chars)
              matchScore = Math.max(matchScore, 90);
              matchType.push('Name (Exact)');
            } else if (supplierNameLower.includes(extractedNameLower) || extractedNameLower.includes(supplierNameLower)) {
              // Partial match
              matchScore = Math.max(matchScore, 70);
              matchType.push('Name (Partial)');
            } else {
              // Check if significant words match (for cases like "ABC Pharma Ltd" vs "ABC Pharma Limited")
              const supplierWords = supplier.supplier_name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
              const extractedWords = extractedSupplier.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
              const matchingWords = supplierWords.filter(w => extractedWords.includes(w));
              
              if (matchingWords.length >= 2 || (matchingWords.length === 1 && matchingWords[0].length > 5)) {
                matchScore = Math.max(matchScore, 60);
                matchType.push('Name (Words)');
              }
            }
          }
          
          // Check mobile match
          if (extractedSupplier?.mobile && supplier.mobile) {
            if (supplier.mobile.replace(/\D/g, '').includes(extractedSupplier.mobile.replace(/\D/g, ''))) {
              matchScore = Math.max(matchScore, 80);
              matchType.push('Mobile');
            }
          }
          
          return {
            ...supplier,
            matchScore,
            matchType: matchType.join(', ')
          };
        });
        
        // Sort by match score
        results.sort((a, b) => b.matchScore - a.matchScore);
        
        setSearchResults(results);
        
        // Auto-select if we have a perfect GSTIN match or very high name match
        const perfectMatch = results.find(r => r.matchScore >= 90);
        if (perfectMatch) {
          setAutoSelected(perfectMatch);
          setSelectedSupplier(perfectMatch);
        } else if (results.length === 1 && results[0].matchScore >= 70) {
          // If only one result with good match, auto-select it
          setAutoSelected(results[0]);
          setSelectedSupplier(results[0]);
        }
        
        setMode('found');
      } else {
        // No results found, show create form
        setMode('create');
      }
    } catch (error) {
      console.error('Error searching supplier:', error);
      setMode('create');
    } finally {
      setLoading(false);
    }
  };

  // Select existing supplier
  const handleSelectSupplier = (supplier) => {
    setSelectedSupplier(supplier);
    onVerified(supplier);
  };

  // Create new supplier
  const handleCreateSupplier = async () => {
    setLoading(true);
    try {
      const response = await suppliersApi.create(supplierForm);
      if (response.data) {
        onVerified({
          supplier_id: response.data.supplier_id,
          supplier_name: supplierForm.supplier_name,
          gstin: supplierForm.gstin,
          address: supplierForm.address
        });
      }
    } catch (error) {
      console.error('Error creating supplier:', error);
      alert('Failed to create supplier');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Invoice Info - Compact horizontal layout */}
      <div className="bg-blue-50 rounded-lg px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <FileText className="w-4 h-4 text-blue-600" />
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-blue-900">Invoice #:</span>
                <span className="text-sm font-semibold text-blue-700">{extractedSupplier?.invoice_number}</span>
              </div>
              <div className="w-px h-4 bg-blue-300"></div>
              <div className="flex items-center space-x-2">
                <Calendar className="w-3 h-3 text-blue-600" />
                <span className="text-xs font-medium text-blue-900">Date:</span>
                <span className="text-sm font-semibold text-blue-700">{extractedSupplier?.invoice_date}</span>
              </div>
            </div>
          </div>
          {extractedSupplier?.total_amount && (
            <>
              <div className="w-px h-4 bg-blue-300"></div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium text-blue-900">Amount:</span>
                <span className="text-sm font-bold text-blue-700">₹{extractedSupplier.total_amount}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {!loading && mode === 'found' && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="flex items-center space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    searchSupplier(searchQuery);
                  }
                }}
                placeholder="Search by supplier name, GSTIN, or mobile..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              onClick={() => searchSupplier(searchQuery)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Search
            </button>
            <button
              onClick={() => setMode('create')}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Create New
            </button>
          </div>

          {/* Auto-selected indicator */}
          {autoSelected && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-green-800">
                      Auto-selected: {autoSelected.supplier_name}
                    </span>
                    <p className="text-xs text-green-600 mt-0.5">
                      {autoSelected.matchScore}% match ({autoSelected.matchType})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setAutoSelected(null);
                    setSelectedSupplier(null);
                  }}
                  className="text-sm text-green-600 hover:text-green-700"
                >
                  Change Selection
                </button>
              </div>
            </div>
          )}

          {/* Search Results */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>No suppliers found</p>
                <button
                  onClick={() => setMode('create')}
                  className="mt-2 text-indigo-600 hover:text-indigo-700"
                >
                  Create new supplier
                </button>
              </div>
            ) : (
              searchResults.map((supplier) => (
                <div
                  key={supplier.supplier_id}
                  onClick={() => handleSelectSupplier(supplier)}
                  className={`p-4 border rounded-lg cursor-pointer transition ${
                    selectedSupplier?.supplier_id === supplier.supplier_id
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium">{supplier.supplier_name}</p>
                        {supplier.matchScore > 0 && (
                          <span className={`text-xs px-2 py-1 rounded-full ${
                            supplier.matchScore === 100 ? 'bg-green-100 text-green-700' :
                            supplier.matchScore >= 80 ? 'bg-blue-100 text-blue-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {supplier.matchScore}% match ({supplier.matchType})
                          </span>
                        )}
                      </div>
                      {supplier.gstin && (
                        <p className="text-sm text-gray-600 mt-1">
                          GSTIN: {supplier.gstin}
                        </p>
                      )}
                      {supplier.mobile && (
                        <p className="text-sm text-gray-500">
                          <Phone className="w-3 h-3 inline mr-1" />
                          {supplier.mobile}
                        </p>
                      )}
                      {supplier.address && (
                        <p className="text-sm text-gray-500 mt-1">
                          <MapPin className="w-3 h-3 inline mr-1" />
                          {supplier.address}
                        </p>
                      )}
                    </div>
                    {selectedSupplier?.supplier_id === supplier.supplier_id && (
                      <CheckCircle className="w-5 h-5 text-indigo-600" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Action Buttons */}
          {selectedSupplier && (
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                onClick={onCancel}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSelectSupplier(selectedSupplier)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center space-x-2"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Use Selected Supplier</span>
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && mode === 'create' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Create New Supplier</h3>
            {searchResults.length > 0 && (
              <button
                onClick={() => setMode('found')}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                View Matches ({searchResults.length})
              </button>
            )}
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-yellow-600 flex-shrink-0" />
              <p className="text-xs text-yellow-800">
                <span className="font-medium">New supplier will be created.</span> Extracted data has been pre-filled.
              </p>
            </div>
          </div>

          {/* Compact form with collapsible sections */}
          <div className="space-y-3">
            {/* Basic Information - Always visible */}
            <div className="border rounded-lg p-3">
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
                <Building2 className="w-4 h-4 mr-2" />
                Basic Information
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Supplier Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={supplierForm.supplier_name}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      supplier_name: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Phone/Mobile
                  </label>
                  <input
                    type="text"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      phone: e.target.value,
                      whatsapp_number: e.target.value // Auto-fill WhatsApp
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="9876543210"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      email: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="supplier@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={supplierForm.contact_person}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      contact_person: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    value={supplierForm.whatsapp_number}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      whatsapp_number: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Tax & Compliance - Collapsible */}
            <div className="border rounded-lg">
              <button
                type="button"
                onClick={() => setExpandedSections(prev => ({ ...prev, compliance: !prev.compliance }))}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <FileText className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-700">Tax & Compliance</span>
                  {supplierForm.gstin && (
                    <span className="text-xs text-green-600 ml-2">✓ GSTIN provided</span>
                  )}
                </div>
                {expandedSections.compliance ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSections.compliance && (
                <div className="p-3 pt-0 border-t">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={supplierForm.gstin}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      gstin: e.target.value.toUpperCase() 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    PAN Number
                  </label>
                  <input
                    type="text"
                    value={supplierForm.pan_number}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      pan_number: e.target.value.toUpperCase() 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="AAAAA0000A"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Drug License No.
                  </label>
                  <input
                    type="text"
                    value={supplierForm.drug_license_no}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      drug_license_no: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="20B/21B License"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    License Validity
                  </label>
                  <input
                    type="date"
                    value={supplierForm.drug_license_validity}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      drug_license_validity: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Address Information - Collapsible, expanded by default */}
            <div className="border rounded-lg">
              <button
                type="button"
                onClick={() => setExpandedSections(prev => ({ ...prev, address: !prev.address }))}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-700">Address Information</span>
                </div>
                {expandedSections.address ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSections.address && (
                <div className="p-3 pt-0 border-t">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    value={supplierForm.address_line1 || supplierForm.address}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      address_line1: e.target.value,
                      address: e.target.value // Keep both in sync for compatibility
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Street, building, floor"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Address Line 2 <span className="text-gray-400">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={supplierForm.address_line2}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      address_line2: e.target.value
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Landmark, area"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={supplierForm.city}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      city: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={supplierForm.state}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      state: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Pincode
                  </label>
                  <input
                    type="text"
                    value={supplierForm.pincode}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      pincode: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                    maxLength="6"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Payment Terms (Days)
                  </label>
                  <input
                    type="number"
                    value={supplierForm.payment_terms}
                    onChange={(e) => setSupplierForm(prev => ({ 
                      ...prev, 
                      payment_terms: e.target.value 
                    }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Banking Details - Collapsible */}
            <div className="border rounded-lg">
              <button
                type="button"
                onClick={() => setExpandedSections(prev => ({ ...prev, banking: !prev.banking }))}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center">
                  <Landmark className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-sm font-semibold text-gray-700">Banking Details</span>
                  <span className="text-xs text-gray-500 ml-2">(Optional)</span>
                </div>
                {expandedSections.banking ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {expandedSections.banking && (
                <div className="p-3 pt-0 border-t">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={supplierForm.bank_name}
                        onChange={(e) => setSupplierForm(prev => ({ 
                          ...prev, 
                          bank_name: e.target.value 
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={supplierForm.bank_account_no}
                        onChange={(e) => setSupplierForm(prev => ({ 
                          ...prev, 
                          bank_account_no: e.target.value 
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        IFSC Code
                      </label>
                      <input
                        type="text"
                        value={supplierForm.bank_ifsc_code}
                        onChange={(e) => setSupplierForm(prev => ({ 
                          ...prev, 
                          bank_ifsc_code: e.target.value.toUpperCase() 
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        value={supplierForm.account_holder_name}
                        onChange={(e) => setSupplierForm(prev => ({ 
                          ...prev, 
                          account_holder_name: e.target.value 
                        }))}
                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateSupplier}
              disabled={!supplierForm.supplier_name || loading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Supplier</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierVerificationModal;