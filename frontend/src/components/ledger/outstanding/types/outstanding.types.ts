/**
 * Outstanding Types
 * Type definitions for Outstanding/Ledger components
 */

// ============================================================================
// Core Entity Types  
// ============================================================================

export interface PartyOutstanding {
    party_id: string;
    party_name: string;
    party_phone: string;
    party_email: string;
    total_outstanding: number;
    total_overdue: number;
    invoice_count: number;
    overdue_count: number;
    oldest_invoice_days: number;
    credit_limit?: number;
    credit_utilization?: number;
    invoices?: InvoiceDetail[];
    total_advance?: number;
    customer_net_position?: number;
}

export interface InvoiceDetail {
    invoice_id: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    original_amount: number;
    paid_amount: number;
    current_outstanding: number;
    days_overdue: number;
    aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | 'over_90';
    status: 'pending' | 'partial' | 'overdue';
}

export interface OutstandingSummary {
    total_receivable: number;
    total_payable: number;
    total_overdue: number;
    party_count: number;
    overdue_party_count: number;
    aging_summary: {
        current: { count: number; amount: number };
        '1-30': { count: number; amount: number };
        '31-60': { count: number; amount: number };
        '61-90': { count: number; amount: number };
        over_90: { count: number; amount: number };
    };
}

// ============================================================================
// Component Props
// ============================================================================

export interface OutstandingProps {
    partyType?: 'customer' | 'supplier';
    embedded?: boolean;
    onClose?: () => void;
}

export interface OutstandingSummaryCardsProps {
    summary: OutstandingSummary;
    totalAdvances: number;
    netPosition: number;
    partyType: 'customer' | 'supplier';
}

export interface OutstandingFiltersProps {
    status: string;
    searchQuery: string;
    viewMode: 'summary' | 'aging';
    onStatusChange: (status: string) => void;
    onSearchChange: (query: string) => void;
    onViewModeChange: (mode: 'summary' | 'aging') => void;
    onExport: () => void;
    onRefresh: () => void;
}

export interface OutstandingTableProps {
    parties: PartyOutstanding[];
    expandedParties: Set<string>;
    partyType: 'customer' | 'supplier';
    onToggleExpand: (partyId: string) => void;
    onPartyClick: (party: PartyOutstanding) => void;
    onAllocateClick: (party: PartyOutstanding) => void;
}

export interface OutstandingAgingViewProps {
    summary: OutstandingSummary;
}

export interface PartyDetailsViewProps {
    party: PartyOutstanding;
    onBack: () => void;
    onAllocatePayment: () => void;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface OutstandingFilters {
    status: string;
    searchQuery: string;
}

export interface OutstandingUIState {
    viewMode: 'summary' | 'aging';
    showDetailsView: boolean;
}

export interface AllocationModalState {
    isOpen: boolean;
    customerId: number | null;
    customerName: string;
}

export interface OutstandingState {
    expandedParties: Set<string>;
    filters: OutstandingFilters;
    ui: OutstandingUIState;
    selectedParty: PartyOutstanding | null;
    allocationModal: AllocationModalState;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface OutstandingApiResponse {
    parties: PartyOutstanding[];
    summary: OutstandingSummary;
    total_advances: number;
    net_position: number;
    customer_advances: Record<string, number>;
}
