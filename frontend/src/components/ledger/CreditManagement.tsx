/**
 * CreditManagement Component
 * 
 * REFACTORED: Now uses useCreditManagement hook for all state and logic.
 * This component handles only the UI/JSX rendering.
 */

import React from 'react';
import {
    Search,
    Download,
    Eye,
    Edit,
    Trash2,
    Plus,
    CreditCard,
    AlertTriangle,
    XCircle,
    TrendingUp,
    Loader2,
    RefreshCw,
    AlertCircle,
    X
} from 'lucide-react';
import { useCreditManagement, CustomerCredit } from './hooks';

const CreditManagement: React.FC = () => {
    const {
        filteredCustomers,
        creditStats,
        selectedCustomer,
        loading,
        refreshing,
        error,
        searchTerm,
        statusFilter,
        creditScoreFilter,
        showDetails,
        setSearchTerm,
        setStatusFilter,
        setCreditScoreFilter,
        handleCustomerSelect,
        handleRefresh,
        closeDetails,
        clearError,
        getStatusColor,
        getStatusText,
        getCreditScoreColor,
        getCreditScoreText
    } = useCreditManagement();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-600">Loading credit management data...</span>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Credit Management</h1>
                    <p className="text-gray-600">Monitor customer credit limits and outstanding amounts</p>
                </div>
                <div className="flex items-center space-x-3">
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                        <Plus className="h-4 w-4 mr-2" />
                        New Credit Limit
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center">
                            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                            <span className="text-red-800">{error}</span>
                        </div>
                        <button onClick={clearError} className="text-sm text-red-600 hover:text-red-800 underline">
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Credit Limit"
                    value={`₹${creditStats.totalCredit.toLocaleString()}`}
                    icon={<CreditCard className="w-6 h-6 text-blue-600" />}
                    bgColor="bg-blue-100"
                />
                <StatCard
                    title="Outstanding Amount"
                    value={`₹${creditStats.outstandingAmount.toLocaleString()}`}
                    icon={<AlertTriangle className="w-6 h-6 text-orange-600" />}
                    bgColor="bg-orange-100"
                />
                <StatCard
                    title="Overdue Amount"
                    value={`₹${creditStats.overdueAmount.toLocaleString()}`}
                    icon={<XCircle className="w-6 h-6 text-red-600" />}
                    bgColor="bg-red-100"
                />
                <StatCard
                    title="Customers on Credit"
                    value={creditStats.customersOnCredit.toString()}
                    icon={<TrendingUp className="w-6 h-6 text-green-600" />}
                    bgColor="bg-green-100"
                />
            </div>

            {/* Filters and Search */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search customers..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex items-center space-x-3">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="warning">Warning</option>
                            <option value="blocked">Blocked</option>
                        </select>
                        <select
                            value={creditScoreFilter}
                            onChange={(e) => setCreditScoreFilter(e.target.value)}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                            <option value="all">All Scores</option>
                            <option value="excellent">Excellent (90+)</option>
                            <option value="good">Good (70-89)</option>
                            <option value="fair">Fair (50-69)</option>
                            <option value="poor">Poor (&lt;50)</option>
                        </select>
                        <button className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50">
                            <Download className="h-4 w-4 mr-2" />
                            Export
                        </button>
                    </div>
                </div>
            </div>

            {/* Customers Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-medium text-gray-900">
                        Customers ({filteredCustomers.length})
                    </h3>
                </div>

                {filteredCustomers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                        <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                        <p>No customers found matching your criteria</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Limit</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Used/Available</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Score</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredCustomers.map((customer) => (
                                    <CustomerRow
                                        key={customer.id}
                                        customer={customer}
                                        onSelect={handleCustomerSelect}
                                        getStatusColor={getStatusColor}
                                        getStatusText={getStatusText}
                                        getCreditScoreColor={getCreditScoreColor}
                                        getCreditScoreText={getCreditScoreText}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Customer Details Modal */}
            {showDetails && selectedCustomer && (
                <CustomerDetailsModal customer={selectedCustomer} onClose={closeDetails} />
            )}
        </div>
    );
};

// Sub-components
interface StatCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    bgColor: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, bgColor }) => (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-gray-600">{title}</p>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
            </div>
            <div className={`p-3 ${bgColor} rounded-lg`}>{icon}</div>
        </div>
    </div>
);

interface CustomerRowProps {
    customer: CustomerCredit;
    onSelect: (customer: CustomerCredit) => void;
    getStatusColor: (customer: CustomerCredit) => string;
    getStatusText: (customer: CustomerCredit) => string;
    getCreditScoreColor: (score: number) => string;
    getCreditScoreText: (score: number) => string;
}

const CustomerRow: React.FC<CustomerRowProps> = ({
    customer,
    onSelect,
    getStatusColor,
    getStatusText,
    getCreditScoreColor,
    getCreditScoreText
}) => (
    <tr className="hover:bg-gray-50">
        <td className="px-6 py-4 whitespace-nowrap">
            <div>
                <div className="text-sm font-medium text-gray-900">{customer.name || 'Unknown Customer'}</div>
                <div className="text-sm text-gray-500">{customer.phone || 'No phone'}</div>
            </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
            <div className="text-sm text-gray-900">₹{(customer.credit_limit || 0).toLocaleString()}</div>
            <div className="text-xs text-gray-500">{customer.payment_terms || 30} days</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
            <div className="text-sm text-gray-900">
                <div>Used: ₹{(customer.creditUsed || 0).toLocaleString()}</div>
                <div className={`font-medium ${customer.creditAvailable >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    Available: ₹{(customer.creditAvailable || 0).toLocaleString()}
                </div>
            </div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
            <div className={`font-medium ${getCreditScoreColor(customer.credit_score || 0)}`}>
                {customer.credit_score || 'N/A'}
            </div>
            <div className="text-xs text-gray-500">{getCreditScoreText(customer.credit_score || 0)}</div>
        </td>
        <td className="px-6 py-4 whitespace-nowrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(customer)}`}>
                {getStatusText(customer)}
            </span>
        </td>
        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <div className="flex items-center space-x-2">
                <button onClick={() => onSelect(customer)} className="text-blue-600 hover:text-blue-900" title="View Details">
                    <Eye className="h-4 w-4" />
                </button>
                <button className="text-gray-600 hover:text-gray-900" title="Edit">
                    <Edit className="h-4 w-4" />
                </button>
                <button className="text-red-600 hover:text-red-900" title="Delete">
                    <Trash2 className="h-4 w-4" />
                </button>
            </div>
        </td>
    </tr>
);

interface CustomerDetailsModalProps {
    customer: CustomerCredit;
    onClose: () => void;
}

const CustomerDetailsModal: React.FC<CustomerDetailsModalProps> = ({ customer, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-bold text-gray-900">Customer Credit Details</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                        <h3 className="font-medium text-gray-900 mb-3">Customer Information</h3>
                        <div className="space-y-2">
                            <InfoRow label="Name" value={customer.name || 'Unknown'} />
                            <InfoRow label="Phone" value={customer.phone || 'N/A'} />
                            <InfoRow label="Email" value={customer.email || 'N/A'} />
                        </div>
                    </div>
                    <div>
                        <h3 className="font-medium text-gray-900 mb-3">Credit Information</h3>
                        <div className="space-y-2">
                            <InfoRow label="Credit Limit" value={`₹${(customer.credit_limit || 0).toLocaleString()}`} />
                            <InfoRow label="Credit Used" value={`₹${(customer.creditUsed || 0).toLocaleString()}`} />
                            <InfoRow
                                label="Credit Available"
                                value={`₹${(customer.creditAvailable || 0).toLocaleString()}`}
                                valueClass={customer.creditAvailable >= 0 ? 'text-green-600' : 'text-red-600'}
                            />
                        </div>
                    </div>
                </div>

                {customer.outstandingInvoices && customer.outstandingInvoices.length > 0 && (
                    <div>
                        <h3 className="font-medium text-gray-900 mb-3">Outstanding Invoices</h3>
                        <div className="space-y-2">
                            {customer.outstandingInvoices.map((invoice, index) => (
                                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                    <div>
                                        <div className="font-medium">{invoice.invoiceNo}</div>
                                        <div className="text-sm text-gray-500">Due: {invoice.dueDate}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-medium">₹{invoice.amount?.toLocaleString()}</div>
                                        {invoice.daysOverdue > 0 && (
                                            <div className="text-sm text-red-600">{invoice.daysOverdue} days overdue</div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
);

const InfoRow: React.FC<{ label: string; value: string; valueClass?: string }> = ({ label, value, valueClass = '' }) => (
    <div className="flex justify-between">
        <span className="text-gray-600">{label}:</span>
        <span className={`font-medium ${valueClass}`}>{value}</span>
    </div>
);

export default CreditManagement;
