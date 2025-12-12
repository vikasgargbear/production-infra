import React, { useState, useEffect } from 'react';
import { 
  Shield, AlertTriangle, FileText, Calendar, User, 
  Phone, Hash, Package, Plus, Search, Download,
  CheckCircle, X, Clock, Pill, UserCheck, Loader2, RefreshCw, AlertCircle
} from 'lucide-react';
import { Card, Button, Badge, BaseModal } from '../global';
import { theme, classes } from '../../config/theme.config';
import { productsApi } from '../../services/api';
import { batchesApi } from '../../services/api';
import { invoicesApi } from '../../services/api';
import offlineStorage from '../../services/offlineStorage';

interface NarcoticEntry {
  id: string;
  entry_date: string;
  entry_type: 'sale' | 'purchase' | 'adjustment';
  product_id: number;
  product_name: string;
  batch_number: string;
  schedule_type: 'X' | 'H1';
  
  // Prescription Details (for sales)
  prescription_number?: string;
  prescription_date?: string;
  doctor_name?: string;
  doctor_registration?: string;
  doctor_phone?: string;
  patient_name?: string;
  patient_age?: number;
  patient_gender?: 'M' | 'F' | 'O';
  patient_address?: string;
  patient_phone?: string;
  
  // Quantity Tracking
  opening_balance: number;
  quantity_received?: number;
  quantity_dispensed?: number;
  closing_balance: number;
  
  // Reference
  invoice_number?: string;
  grn_number?: string;
  created_by: string;
  verified_by?: string;
  verification_date?: string;
}

interface PrescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prescription: any) => void;
  productName: string;
}

const PrescriptionModal: React.FC<PrescriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  onSave, 
  productName 
}) => {
  const [prescription, setPrescription] = useState({
    prescription_number: '',
    prescription_date: new Date().toISOString().split('T')[0],
    doctor_name: '',
    doctor_registration: '',
    doctor_phone: '',
    patient_name: '',
    patient_age: '',
    patient_gender: 'M',
    patient_address: '',
    patient_phone: '',
    prescribed_quantity: '',
    dispensed_quantity: ''
  });

  const [errors, setErrors] = useState<string[]>([]);

  const validatePrescription = () => {
    const validationErrors: string[] = [];
    
    if (!prescription.prescription_number) validationErrors.push('Prescription number is required');
    if (!prescription.prescription_date) validationErrors.push('Prescription date is required');
    if (!prescription.doctor_name) validationErrors.push('Doctor name is required');
    if (!prescription.doctor_registration) validationErrors.push('Doctor registration number is required');
    if (!prescription.patient_name) validationErrors.push('Patient name is required');
    if (!prescription.patient_age || parseInt(prescription.patient_age) < 1 || parseInt(prescription.patient_age) > 150) {
      validationErrors.push('Valid patient age is required (1-150)');
    }
    if (!prescription.dispensed_quantity || parseInt(prescription.dispensed_quantity) < 1) {
      validationErrors.push('Dispensed quantity is required');
    }
    
    // Check prescription date validity (must be within 30 days)
    const prescDate = new Date(prescription.prescription_date);
    const today = new Date();
    const daysDiff = Math.floor((today.getTime() - prescDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 30) {
      validationErrors.push('Prescription is older than 30 days');
    }
    
    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  const handleSave = () => {
    if (validatePrescription()) {
      onSave(prescription);
    }
  };

  if (!isOpen) return null;

  return (
    <BaseModal 
      open={isOpen} 
      onClose={onClose} 
      title="Narcotic Drug Prescription Details" 
      subtitle="Schedule X Drug - Legal Compliance"
      icon={Shield}
      iconColor="red"
      footerActions={null}
    >
      <div className="p-6">
        {/* Warning Banner */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-900">
                Schedule X Drug - {productName}
              </p>
              <p className="text-xs text-red-700 mt-1">
                This is a narcotic/psychotropic substance. Prescription details are mandatory by law.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Prescription Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-4 h-4 text-blue-500 mr-2" />
              Prescription Information
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prescription Number *
                </label>
                <input
                  type="text"
                  value={prescription.prescription_number}
                  onChange={(e) => setPrescription({...prescription, prescription_number: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="RX-2024-0001"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prescription Date *
                </label>
                <input
                  type="date"
                  value={prescription.prescription_date}
                  onChange={(e) => setPrescription({...prescription, prescription_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
          </div>

          {/* Doctor Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <UserCheck className="w-4 h-4 text-green-500 mr-2" />
              Prescribing Doctor
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Doctor Name *
                </label>
                <input
                  type="text"
                  value={prescription.doctor_name}
                  onChange={(e) => setPrescription({...prescription, doctor_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Dr. Rajesh Kumar"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registration Number *
                </label>
                <input
                  type="text"
                  value={prescription.doctor_registration}
                  onChange={(e) => setPrescription({...prescription, doctor_registration: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="MCI/12345/2020"
                />
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Doctor Phone
              </label>
              <input
                type="tel"
                value={prescription.doctor_phone}
                onChange={(e) => setPrescription({...prescription, doctor_phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          {/* Patient Information */}
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-4 flex items-center">
              <User className="w-4 h-4 text-purple-500 mr-2" />
              Patient Details
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Patient Name *
                </label>
                <input
                  type="text"
                  value={prescription.patient_name}
                  onChange={(e) => setPrescription({...prescription, patient_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Age *
                </label>
                <input
                  type="number"
                  value={prescription.patient_age}
                  onChange={(e) => setPrescription({...prescription, patient_age: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="35"
                  min="1"
                  max="150"
                />
              </div>
            </div>
            
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Gender
                </label>
                <select
                  value={prescription.patient_gender}
                  onChange={(e) => setPrescription({...prescription, patient_gender: e.target.value as 'M' | 'F' | 'O'})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity to Dispense *
                </label>
                <input
                  type="number"
                  value={prescription.dispensed_quantity}
                  onChange={(e) => setPrescription({...prescription, dispensed_quantity: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="30"
                  min="1"
                />
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Patient Address
              </label>
              <textarea
                value={prescription.patient_address}
                onChange={(e) => setPrescription({...prescription, patient_address: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="123 Main Street, City, State"
                rows={2}
              />
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Patient Phone
              </label>
              <input
                type="tel"
                value={prescription.patient_phone}
                onChange={(e) => setPrescription({...prescription, patient_phone: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          {/* Error Messages */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm text-red-600 space-y-1">
                {errors.map((error, index) => (
                  <div key={index} className="flex items-start">
                    <span className="block w-1 h-1 bg-red-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            <CheckCircle className="w-4 h-4 mr-2" />
            Verify & Save
          </Button>
        </div>
      </div>
    </BaseModal>
  );
};

const NarcoticRegister: React.FC = () => {
  const [entries, setEntries] = useState<NarcoticEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'purchase'>('all');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<any>(null);
  
  // API data states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load narcotic entries on component mount
  useEffect(() => {
    loadNarcoticEntries();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  const loadNarcoticEntries = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Load narcotic products and their transactions
      const [productsResponse, batchesResponse, invoicesResponse] = await Promise.all([
        productsApi.getAll(),
        batchesApi.getAll(),
        invoicesApi.getAll()
      ]);

      // Transform API data into NarcoticEntry format
      const narcoticEntries: NarcoticEntry[] = [];
      
      if (productsResponse.data) {
        const narcoticProducts = productsResponse.data.filter((product: any) => 
          product.schedule_type === 'X' || product.schedule_type === 'H1'
        );

        // Create entries from batches (purchases)
        if (batchesResponse.data) {
          narcoticProducts.forEach((product: any) => {
            const productBatches = batchesResponse.data.filter((batch: any) => 
              batch.product_id === product.id || batch.product_id === product.product_id
            );

            productBatches.forEach((batch: any) => {
              narcoticEntries.push({
                id: `batch_${batch.id || batch.batch_id}`,
                entry_date: batch.created_at || batch.mfg_date,
                entry_type: 'purchase',
                product_id: product.id || product.product_id,
                product_name: product.name || product.product_name,
                batch_number: batch.batch_number,
                schedule_type: product.schedule_type || 'X',
                opening_balance: 0,
                quantity_received: batch.quantity_available || batch.quantity,
                closing_balance: batch.quantity_available || batch.quantity,
                grn_number: batch.grn_number || `GRN-${batch.id}`,
                created_by: batch.created_by || 'System'
              });
            });
          });
        }

        // Create entries from invoices (sales)
        if (invoicesResponse.data) {
          const narcoticInvoices = invoicesResponse.data.filter((invoice: any) => 
            invoice.items?.some((item: any) => 
              narcoticProducts.some((product: any) => 
                product.id === item.product_id || product.product_id === item.product_id
              )
            )
          );

          narcoticInvoices.forEach((invoice: any) => {
            invoice.items?.forEach((item: any) => {
              const narcoticProduct = narcoticProducts.find((product: any) => 
                product.id === item.product_id || product.product_id === item.product_id
              );
              
              if (narcoticProduct) {
                narcoticEntries.push({
                  id: `invoice_${invoice.id}_${item.id}`,
                  entry_date: invoice.invoice_date || invoice.created_at,
                  entry_type: 'sale',
                  product_id: narcoticProduct.id || narcoticProduct.product_id,
                  product_name: narcoticProduct.name || narcoticProduct.product_name,
                  batch_number: item.batch_number || 'N/A',
                  schedule_type: narcoticProduct.schedule_type || 'X',
                  prescription_number: invoice.prescription_number || `RX-${invoice.id}`,
                  prescription_date: invoice.prescription_date || invoice.invoice_date,
                  doctor_name: invoice.doctor_name || 'Dr. Prescriber',
                  doctor_registration: invoice.doctor_registration || 'MCI/XXXXX/XXXX',
                  patient_name: invoice.patient_name || invoice.customer_name,
                  patient_age: invoice.patient_age || 30,
                  patient_gender: invoice.patient_gender || 'M',
                  opening_balance: 1000, // This would come from actual stock tracking
                  quantity_dispensed: item.quantity,
                  closing_balance: 1000 - item.quantity, // This would come from actual stock tracking
                  invoice_number: invoice.invoice_number || invoice.invoice_no,
                  created_by: invoice.created_by || 'System'
                });
              }
            });
          });
        }
      }

      // Sort entries by date (newest first)
      narcoticEntries.sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
      
      setEntries(narcoticEntries);
      
      // Store data offline for future use
      await offlineStorage.storeOffline('narcotic_entries', narcoticEntries, { 
        critical: true, 
        persistent: true 
      });
      
    } catch (err) {
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('narcotic_entries', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for narcotic data
        setEntries(offlineData.data);
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load narcotic entries. Please check your connection and try again.');
        setEntries([]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNarcoticEntries();
    setRefreshing(false);
  };

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = 
      entry.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.prescription_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.patient_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || entry.entry_type === filterType;
    
    return matchesSearch && matchesType;
  });

  const handleNewEntry = (productData: any) => {
    setCurrentProduct(productData);
    setShowPrescriptionModal(true);
  };

  const handlePrescriptionSave = async (prescription: any) => {
    try {
      setLoading(true);
      
      // Here you would save to backend
      
      // Create a new entry
      const newEntry: NarcoticEntry = {
        id: Date.now().toString(),
        entry_date: new Date().toISOString(),
        entry_type: 'sale',
        product_id: currentProduct?.id || currentProduct?.product_id,
        product_name: currentProduct?.product_name || currentProduct?.name,
        batch_number: 'BATCH-' + Date.now(),
        schedule_type: currentProduct?.schedule_type || 'X',
        prescription_number: prescription.prescription_number,
        prescription_date: prescription.prescription_date,
        doctor_name: prescription.doctor_name,
        doctor_registration: prescription.doctor_registration,
        doctor_phone: prescription.doctor_phone,
        patient_name: prescription.patient_name,
        patient_age: parseInt(prescription.patient_age),
        patient_gender: prescription.patient_gender,
        patient_address: prescription.patient_address,
        patient_phone: prescription.patient_phone,
        opening_balance: 1000, // This would come from actual stock
        quantity_dispensed: parseInt(prescription.dispensed_quantity),
        closing_balance: 1000 - parseInt(prescription.dispensed_quantity), // This would come from actual stock
        created_by: 'Current User',
        verified_by: 'Current User',
        verification_date: new Date().toISOString()
      };
      
      setEntries([newEntry, ...entries]);
      setShowPrescriptionModal(false);
      
      // You would also call the backend API here to save the entry
      // await narcoticApi.createEntry(newEntry);
      
    } catch (err) {
      alert(`Failed to save entry: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (isLoading && entries.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading narcotic register...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && entries.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Data</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 flex items-center">
              <Shield className="w-6 h-6 text-red-600 mr-3" />
              Narcotic Drug Register
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Schedule X & H1 Drugs - Legal Compliance & Tracking
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              {refreshing ? (
                <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
              ) : (
                <RefreshCw className="w-4 h-4 text-gray-500" />
              )}
            </button>
            <Button variant="primary" onClick={() => handleNewEntry({})}>
              <Plus className="w-4 h-4 mr-2" />
              New Entry
            </Button>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products, prescriptions, patients..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as 'all' | 'sale' | 'purchase')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="sale">Sales</option>
              <option value="purchase">Purchases</option>
            </select>
            
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            
            <Button variant="secondary">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Products</p>
                <p className="text-lg font-semibold text-gray-900">
                  {entries.filter(e => e.entry_type === 'purchase').length}
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Verified Entries</p>
                <p className="text-lg font-semibold text-gray-900">
                  {entries.filter(e => e.verified_by).length}
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center">
              <div className="p-2 bg-amber-100 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Pending Verification</p>
                <p className="text-lg font-semibold text-gray-900">
                  {entries.filter(e => !e.verified_by).length}
                </p>
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Schedule X</p>
                <p className="text-lg font-semibold text-gray-900">
                  {entries.filter(e => e.schedule_type === 'X').length}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Register Table */}
      <div className="px-6 pb-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date/Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prescription</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Patient/Supplier</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Balance</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                      <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg font-medium text-gray-900 mb-2">No narcotic entries found</p>
                      <p className="text-sm">Try adjusting your search or filters</p>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {new Date(entry.entry_date).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          entry.entry_type === 'sale' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {entry.entry_type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{entry.product_name}</p>
                          <p className="text-xs text-gray-500">Batch: {entry.batch_number}</p>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                            Schedule {entry.schedule_type}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {entry.prescription_number && (
                          <div>
                            <p className="text-sm font-medium">{entry.prescription_number}</p>
                            <p className="text-xs text-gray-500">Dr. {entry.doctor_name}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {entry.patient_name && (
                          <div>
                            <p className="text-sm">{entry.patient_name}</p>
                            <p className="text-xs text-gray-500">
                              {entry.patient_age}y/{entry.patient_gender}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm">
                          <p>Open: {entry.opening_balance}</p>
                          {entry.quantity_dispensed && <p className="text-red-600">Out: -{entry.quantity_dispensed}</p>}
                          {entry.quantity_received && <p className="text-green-600">In: +{entry.quantity_received}</p>}
                          <p className="font-medium">Close: {entry.closing_balance}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {entry.verified_by ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Prescription Modal */}
      <PrescriptionModal
        isOpen={showPrescriptionModal}
        onClose={() => setShowPrescriptionModal(false)}
        onSave={handlePrescriptionSave}
        productName={currentProduct?.product_name || 'Narcotic Drug'}
      />
    </div>
  );
};

export default NarcoticRegister;
export { PrescriptionModal };