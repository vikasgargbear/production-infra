import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Search, Filter, Calendar, Download, Eye, Edit2,
  PlusCircle, MinusCircle, Users, Building, DollarSign,
  TrendingUp, AlertTriangle, CheckCircle, XCircle, Clock,
  ChevronLeft, ChevronRight, Plus, RefreshCw, Printer
} from 'lucide-react';
import { ModuleHeader, DataTable, StatusBadge } from '../global';
import { notesApi, customersApi, suppliersApi } from '../../services/api';
import { exportToExcel } from '../../utils/exportHelpers';

const NotesManagementV2 = () => {
  const [notes, setNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, credit, debit
  const [filterParty, setFilterParty] = useState('all'); // all, customer, supplier
  const [filterStatus, setFilterStatus] = useState('all'); // all, draft, sent, paid
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedNote, setSelectedNote] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Summary stats
  const [stats, setStats] = useState({
    totalNotes: 0,
    creditNotes: 0,
    debitNotes: 0,
    totalValue: 0,
    pendingNotes: 0,
    avgNoteValue: 0
  });

  // Fetch notes data
  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      // Mock data - replace with actual API call
      const mockNotes = [
        {
          id: 1,
          note_no: 'CN-2024-001',
          note_type: 'credit',
          party_type: 'customer',
          party_name: 'ABC Pharmacy',
          amount: 2500.00,
          tax_amount: 450.00,
          total_amount: 2950.00,
          reason: 'Product return',
          date: '2024-02-20',
          status: 'sent',
          linked_invoice: 'INV-2024-0123',
          created_at: '2024-02-20T10:30:00'
        },
        {
          id: 2,
          note_no: 'DN-2024-001',
          note_type: 'debit',
          party_type: 'supplier',
          party_name: 'XYZ Suppliers',
          amount: 1800.00,
          tax_amount: 324.00,
          total_amount: 2124.00,
          reason: 'Additional charges',
          date: '2024-02-19',
          status: 'draft',
          linked_invoice: 'PO-2024-0045',
          created_at: '2024-02-19T14:20:00'
        },
        {
          id: 3,
          note_no: 'CN-2024-002',
          note_type: 'credit',
          party_type: 'customer',
          party_name: 'City Hospital',
          amount: 3200.00,
          tax_amount: 576.00,
          total_amount: 3776.00,
          reason: 'Pricing adjustment',
          date: '2024-02-18',
          status: 'paid',
          linked_invoice: 'INV-2024-0125',
          created_at: '2024-02-18T09:15:00'
        }
      ];
      
      setNotes(mockNotes);
      setFilteredNotes(mockNotes);
      calculateStats(mockNotes);
    } catch (error) {
      console.error('Error fetching notes:', error);
      setMessage('Failed to load notes data');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Calculate statistics
  const calculateStats = (notesData) => {
    const stats = notesData.reduce((acc, note) => {
      acc.totalNotes++;
      if (note.note_type === 'credit') acc.creditNotes++;
      if (note.note_type === 'debit') acc.debitNotes++;
      if (note.status === 'draft') acc.pendingNotes++;
      acc.totalValue += note.total_amount || 0;
      return acc;
    }, {
      totalNotes: 0,
      creditNotes: 0,
      debitNotes: 0,
      totalValue: 0,
      pendingNotes: 0,
      avgNoteValue: 0
    });
    
    stats.avgNoteValue = stats.totalNotes > 0 ? stats.totalValue / stats.totalNotes : 0;
    setStats(stats);
  };

  // Filter notes
  useEffect(() => {
    let filtered = [...notes];

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(note => 
        note.note_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.party_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.reason?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        note.linked_invoice?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(note => note.note_type === filterType);
    }

    // Apply party filter
    if (filterParty !== 'all') {
      filtered = filtered.filter(note => note.party_type === filterParty);
    }

    // Apply status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter(note => note.status === filterStatus);
    }

    // Apply date range filter
    filtered = filtered.filter(note => {
      const noteDate = new Date(note.date);
      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      return noteDate >= startDate && noteDate <= endDate;
    });

    setFilteredNotes(filtered);
    setCurrentPage(1);
  }, [searchQuery, filterType, filterParty, filterStatus, dateRange, notes]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentNotes = filteredNotes.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredNotes.length / itemsPerPage);

  // Handle actions
  const handleView = (note) => {
    setSelectedNote(note);
    // Open detail view modal
  };

  const handleEdit = (note) => {
    // Navigate to edit note
    window.location.href = `/notes?edit=${note.id}`;
  };

  const handlePrint = (note) => {
    // Print note
    window.open(`/notes/print/${note.id}`, '_blank');
  };

  const handleSend = async (noteId) => {
    try {
      // Call API to send note
      setMessage('Note sent successfully');
      setMessageType('success');
      fetchNotes();
    } catch (error) {
      setMessage('Failed to send note');
      setMessageType('error');
    }
  };

  const handleExport = () => {
    const exportData = filteredNotes.map(note => ({
      'Note No': note.note_no,
      'Type': note.note_type === 'credit' ? 'Credit Note' : 'Debit Note',
      'Party Type': note.party_type === 'customer' ? 'Customer' : 'Supplier',
      'Party Name': note.party_name,
      'Date': new Date(note.date).toLocaleDateString(),
      'Amount': note.amount,
      'Tax': note.tax_amount,
      'Total': note.total_amount,
      'Reason': note.reason,
      'Status': note.status,
      'Linked Invoice': note.linked_invoice
    }));
    
    exportToExcel(exportData, 'credit_debit_notes');
  };

  const getNoteTypeIcon = (type) => {
    return type === 'credit' ? PlusCircle : MinusCircle;
  };

  const getNoteTypeColor = (type) => {
    return type === 'credit' ? 'green' : 'orange';
  };

  const getPartyIcon = (partyType) => {
    return partyType === 'customer' ? Users : Building;
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Credit & Debit Notes"
        icon={FileText}
        iconColor="text-indigo-600"
        actions={[
          {
            label: "New Note",
            onClick: () => setShowCreateModal(true),
            icon: Plus,
            variant: "primary"
          },
          {
            label: "Export",
            onClick: handleExport,
            icon: Download,
            variant: "default"
          }
        ]}
      />

      {/* Stats Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Notes</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalNotes}</p>
              </div>
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Credit Notes</p>
                <p className="text-2xl font-bold text-green-600">{stats.creditNotes}</p>
              </div>
              <PlusCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Debit Notes</p>
                <p className="text-2xl font-bold text-orange-600">{stats.debitNotes}</p>
              </div>
              <MinusCircle className="w-8 h-8 text-orange-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendingNotes}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Value</p>
                <p className="text-xl font-bold text-blue-600">₹{stats.totalValue.toLocaleString('en-IN')}</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Value</p>
                <p className="text-xl font-bold text-purple-600">₹{Math.round(stats.avgNoteValue).toLocaleString('en-IN')}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 pb-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by note no, party, reason, or invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Type Filter */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Types</option>
              <option value="credit">Credit Notes</option>
              <option value="debit">Debit Notes</option>
            </select>

            {/* Party Filter */}
            <select
              value={filterParty}
              onChange={(e) => setFilterParty(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Parties</option>
              <option value="customer">Customers</option>
              <option value="supplier">Suppliers</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div className="px-6 pb-4">
          <div className={`p-3 rounded-lg flex items-center ${
            messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            {message}
          </div>
        </div>
      )}

      {/* Notes Table */}
      <div className="flex-1 overflow-hidden px-6">
        <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading notes...</p>
              </div>
            </div>
          ) : currentNotes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No notes found</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create First Note
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note No</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {currentNotes.map((note) => {
                      const TypeIcon = getNoteTypeIcon(note.note_type);
                      const PartyIcon = getPartyIcon(note.party_type);
                      const typeColor = getNoteTypeColor(note.note_type);
                      
                      return (
                        <tr key={note.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{note.note_no}</p>
                              {note.linked_invoice && (
                                <p className="text-xs text-gray-500">Linked: {note.linked_invoice}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center">
                              <div className={`p-2 rounded-lg bg-${typeColor}-100`}>
                                <TypeIcon className={`w-4 h-4 text-${typeColor}-600`} />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <PartyIcon className="w-4 h-4 text-gray-400" />
                              <div>
                                <p className="text-sm text-gray-900">{note.party_name}</p>
                                <p className="text-xs text-gray-500 capitalize">{note.party_type}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <p className="text-sm text-gray-900">
                              {new Date(note.date).toLocaleDateString()}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm text-gray-900">
                              ₹{note.amount.toLocaleString('en-IN')}
                            </p>
                            <p className="text-xs text-gray-500">
                              Tax: ₹{note.tax_amount.toLocaleString('en-IN')}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-medium text-gray-900">
                              ₹{note.total_amount.toLocaleString('en-IN')}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm text-gray-600 truncate max-w-xs">
                              {note.reason}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge 
                              status={note.status} 
                              type="note"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleView(note)}
                                className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="View Details"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleEdit(note)}
                                className="p-1 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handlePrint(note)}
                                className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded"
                                title="Print"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              {note.status === 'draft' && (
                                <button
                                  onClick={() => handleSend(note.id)}
                                  className="p-1 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                                  title="Send"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredNotes.length)} of {filteredNotes.length} notes
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1 rounded-lg ${
                            currentPage === pageNum
                              ? 'bg-indigo-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Note Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Note</h2>
            <p className="text-gray-600 mb-6">Choose the type of note to create:</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  // Navigate to credit note creation
                  window.location.href = '/notes?type=credit';
                }}
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-green-50 hover:border-green-300 transition-colors flex items-center gap-3"
              >
                <div className="p-2 bg-green-100 rounded-lg">
                  <PlusCircle className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">Credit Note</p>
                  <p className="text-sm text-gray-500">Issue credit to customers</p>
                </div>
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  // Navigate to debit note creation
                  window.location.href = '/notes?type=debit';
                }}
                className="w-full p-4 border border-gray-200 rounded-lg hover:bg-orange-50 hover:border-orange-300 transition-colors flex items-center gap-3"
              >
                <div className="p-2 bg-orange-100 rounded-lg">
                  <MinusCircle className="w-5 h-5 text-orange-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-900">Debit Note</p>
                  <p className="text-sm text-gray-500">Issue debit to suppliers</p>
                </div>
              </button>
            </div>
            <button
              onClick={() => setShowCreateModal(false)}
              className="mt-4 w-full px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesManagementV2;