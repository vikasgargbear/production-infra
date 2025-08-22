import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  FileMinus, 
  FilePlus,
  Search, 
  Download,
  Eye,
  X
} from 'lucide-react';
import { creditNotesApi, debitNotesApi } from '../../services/api';
import { Pagination, StatusBadge, useToast } from '../global';
import { format } from 'date-fns';

/**
 * NotesHistory Component
 * Shows all credit and debit notes in one unified view
 */
const NotesHistory = ({ onClose, onSelectNote }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState([]);
  const [filteredNotes, setFilteredNotes] = useState([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [noteType, setNoteType] = useState('all'); // all, credit, debit
  const [partyFilter, setPartyFilter] = useState('');

  // Fetch all notes
  const fetchNotes = async () => {
    setLoading(true);
    try {
      const notesList = [];
      
      // Fetch credit notes
      if (noteType === 'all' || noteType === 'credit') {
        try {
          const creditRes = await creditNotesApi.getAll({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo
          });
          
          const creditNotes = (creditRes.data?.credit_notes || creditRes.data || []).map(note => ({
            ...note,
            note_type: 'credit',
            note_number: note.credit_note_number || note.note_number,
            note_date: note.credit_note_date || note.note_date,
            party_name: note.customer_name || note.party_name,
            amount: note.total_amount || note.amount,
            status: note.status || 'active',
            reason: note.return_reason || note.reason,
            icon: FileMinus,
            color: 'green'
          }));
          notesList.push(...creditNotes);
        } catch (err) {
          console.error('Failed to fetch credit notes:', err);
        }
      }
      
      // Fetch debit notes  
      if (noteType === 'all' || noteType === 'debit') {
        try {
          const debitRes = await debitNotesApi.getAll({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo
          });
          
          const debitNotes = (debitRes.data?.debit_notes || debitRes.data || []).map(note => ({
            ...note,
            note_type: 'debit',
            note_number: note.debit_note_number || note.note_number,
            note_date: note.debit_note_date || note.note_date,
            party_name: note.supplier_name || note.party_name,
            amount: note.total_amount || note.amount,
            status: note.status || 'active',
            reason: note.return_reason || note.reason,
            icon: FilePlus,
            color: 'red'
          }));
          notesList.push(...debitNotes);
        } catch (err) {
          console.error('Failed to fetch debit notes:', err);
        }
      }
      
      // Sort by date (newest first)
      notesList.sort((a, b) => {
        const dateA = new Date(a.note_date);
        const dateB = new Date(b.note_date);
        return dateB - dateA;
      });
      
      setNotes(notesList);
      applyFilters(notesList);
    } catch (error) {
      console.error('Error fetching notes:', error);
      toast.error('Failed to fetch notes');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters to notes
  const applyFilters = (notesList = notes) => {
    let filtered = [...notesList];
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(note => 
        note.note_number?.toLowerCase().includes(search) ||
        note.party_name?.toLowerCase().includes(search) ||
        note.reason?.toLowerCase().includes(search)
      );
    }
    
    // Party filter
    if (partyFilter) {
      const party = partyFilter.toLowerCase();
      filtered = filtered.filter(note => 
        note.party_name?.toLowerCase().includes(party)
      );
    }
    
    // Pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filtered.slice(startIndex, endIndex);
    
    setFilteredNotes(paginated);
    setTotalItems(filtered.length);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  };

  // Load notes on mount and filter changes
  useEffect(() => {
    fetchNotes();
  }, [noteType, dateFrom, dateTo]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, partyFilter, currentPage]);

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd MMM yyyy');
    } catch {
      return date;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Credit & Debit Notes</h2>
            <p className="text-sm text-gray-500 mt-1">View all credit and debit notes</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200">
          <div className="flex space-x-4">
            <button
              onClick={() => {
                setNoteType('all');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                noteType === 'all' 
                  ? 'bg-gray-100 text-gray-700 border border-gray-300' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileText className="h-4 w-4 inline mr-2" />
              All Notes
            </button>
            <button
              onClick={() => {
                setNoteType('credit');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                noteType === 'credit' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileMinus className="h-4 w-4 inline mr-2" />
              Credit Notes
            </button>
            <button
              onClick={() => {
                setNoteType('debit');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                noteType === 'debit' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FilePlus className="h-4 w-4 inline mr-2" />
              Debit Notes
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search notes..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Party Filter */}
            <input
              type="text"
              placeholder="Filter by party..."
              value={partyFilter}
              onChange={(e) => {
                setPartyFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />

            {/* Date From */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />

            {/* Date To */}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Note No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="8" className="px-6 py-4 text-center text-gray-500">
                    Loading notes...
                  </td>
                </tr>
              ) : filteredNotes.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-4 text-center text-gray-500">
                    No notes found
                  </td>
                </tr>
              ) : (
                filteredNotes.map((note, index) => {
                  const Icon = note.icon;
                  return (
                    <tr key={`${note.note_type}-${note.note_number}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`flex items-center text-${note.color}-600`}>
                          <Icon className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium capitalize">{note.note_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">{note.note_number}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(note.note_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{note.party_name || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {formatCurrency(note.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{note.reason || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge 
                          status={note.status} 
                          color={note.status === 'active' ? 'green' : 'gray'}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => onSelectNote && onSelectNote(note)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toast.info('Download feature coming soon')}
                            className="text-gray-600 hover:text-gray-900"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            loading={loading}
            itemName="notes"
          />
        </div>
      </div>
    </div>
  );
};

export default NotesHistory;