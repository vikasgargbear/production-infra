import React, { useState, useEffect } from 'react';
import {
    CreditCard, Plus, Trash2, Check,
    X, AlertCircle, Building2, Star, Loader2, Pencil, Upload, QrCode
} from 'lucide-react';
import { bankAccountsApi, companyApi } from '../../../services/api';
import { useCompany } from '../../../contexts/CompanyContext';

interface BankAccount {
    id: number | string;
    account_name: string;
    account_number: string;
    bank_name: string;
    account_type: string;
    ifsc_code: string;
    branch_name: string;
    upi_id?: string;
    is_default_account: boolean;
}

interface NewBankAccount {
    account_name: string;
    account_number: string;
    bank_name: string;
    account_type: string;
    ifsc_code: string;
    branch_name: string;
    upi_id: string;
    is_default_account: boolean;
}

interface BankAccountManagerProps {
    companyData: {
        businessName?: string;
        [key: string]: any;
    };
    onUpdate?: (account: BankAccount | NewBankAccount) => void;
}

const BankAccountManager: React.FC<BankAccountManagerProps> = ({ companyData, onUpdate }) => {
    const { companyInfo, updateCompanyInfo } = useCompany();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [editingId, setEditingId] = useState<number | string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [qrPreview, setQrPreview] = useState<string>((companyInfo as any)?.paymentQR || '');
    const [upiId, setUpiId] = useState<string>((companyInfo as any)?.upi_id || (companyInfo as any)?.upiId || '');

    const [qrSuccess, setQrSuccess] = useState('');

    const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Show preview immediately
            const reader = new FileReader();
            reader.onloadend = () => setQrPreview(reader.result as string);
            reader.readAsDataURL(file);

            // Upload to backend
            try {
                await companyApi.uploadQRCode(file);
                setError(null);
                setQrSuccess('QR code uploaded successfully');
                setTimeout(() => setQrSuccess(''), 3000);
            } catch (err) {
                setError('Failed to upload QR code. Please try again.');
            }
        }
    };

    const handleSaveUpiId = async () => {
        try {
            const info = companyInfo || {} as any;
            await updateCompanyInfo({ ...info, upi_id: upiId });
            setQrSuccess('UPI ID saved successfully');
            setTimeout(() => setQrSuccess(''), 3000);
        } catch (err) {
            setError('Failed to save UPI ID');
        }
    };
    const [newAccount, setNewAccount] = useState<NewBankAccount>({
        account_name: '',
        account_number: '',
        bank_name: '',
        account_type: 'CURRENT',
        ifsc_code: '',
        branch_name: '',
        upi_id: '',
        is_default_account: false
    });

    // Fetch accounts on mount
    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await bankAccountsApi.getAll();
            const accountsData = response?.data?.accounts || response?.data || [];
            setAccounts(Array.isArray(accountsData) ? accountsData : []);
        } catch (error: any) {
            // Check if it's a 404 (API not deployed yet) vs actual error
            if (error.response?.status === 404) {
                // Don't show error for 404, just show empty state
                setAccounts([]);
            } else {
                setError('Failed to load bank accounts');
                setAccounts([]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    const validateIFSC = (ifsc: string) => {
        // IFSC format: 4 letters + 0 + 6 alphanumeric
        const pattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;
        return pattern.test(ifsc.toUpperCase());
    };

    const handleAddAccount = () => {
        setIsAddingNew(true);
        setEditingId(null);
        setNewAccount({
            account_name: companyData.businessName || '',
            account_number: '',
            bank_name: '',
            account_type: 'CURRENT',
            ifsc_code: '',
            branch_name: '',
            upi_id: '',
            is_default_account: accounts.length === 0
        });
    };

    const handleEditAccount = (account: BankAccount) => {
        setIsAddingNew(true);
        setEditingId(account.id);
        setNewAccount({
            account_name: account.account_name,
            account_number: account.account_number,
            bank_name: account.bank_name,
            account_type: account.account_type,
            ifsc_code: account.ifsc_code,
            branch_name: account.branch_name,
            upi_id: account.upi_id || '',
            is_default_account: account.is_default_account
        });
    };

    const handleSaveNewAccount = async () => {
        // Validate required fields
        if (!newAccount.account_number || !newAccount.ifsc_code || !newAccount.bank_name) {
            setError('Please fill in Account Number, Bank Name, and IFSC Code');
            return;
        }

        if (!validateIFSC(newAccount.ifsc_code)) {
            setError('Invalid IFSC Code format. Example: HDFC0001234');
            return;
        }

        try {
            const accountData = {
                ...newAccount,
                ifsc_code: newAccount.ifsc_code.toUpperCase()
            };

            if (editingId) {
                // Update existing account
                await bankAccountsApi.update(editingId, accountData);
            } else {
                // Create new account
                await bankAccountsApi.create(accountData);
            }

            // Refresh the list
            await fetchAccounts();

            setIsAddingNew(false);
            setEditingId(null);
            setError(null);

            // Update parent component
            if (onUpdate) {
                onUpdate(accountData);
            }
        } catch (error: any) {
            if (error.response?.status === 404) {
                setError('Bank account service is being deployed. Please try again in a few moments.');
            } else {
                setError(`Failed to ${editingId ? 'update' : 'save'} bank account. Please try again.`);
            }
        }
    };

    const handleDeleteAccount = async (id: number | string) => {
        const accountToDelete = accounts.find(acc => acc.id === id);
        if (accountToDelete?.is_default_account && accounts.length > 1) {
            setError('Cannot delete default account. Please set another account as default first.');
            return;
        }

        try {
            await bankAccountsApi.delete(id);
            await fetchAccounts();
            setError(null);
        } catch (error) {
            setError('Failed to delete bank account. Please try again.');
        }
    };

    const handleSetDefault = async (id: number | string) => {
        try {
            await bankAccountsApi.setDefaultAccount(id);
            await fetchAccounts();

            // Update parent with the new default
            const defaultAccount = accounts.find(acc => acc.id === id);
            if (defaultAccount && onUpdate) {
                onUpdate(defaultAccount);
            }
            setError(null);
        } catch (error) {
            setError('Failed to set default account. Please try again.');
        }
    };

    const accountTypes = [
        { value: 'SAVINGS', label: 'Savings' },
        { value: 'CURRENT', label: 'Current' },
        { value: 'CASH_CREDIT', label: 'Cash Credit' },
        { value: 'OVERDRAFT', label: 'Overdraft' }
    ];

    return (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Bank Accounts
                </h2>
                <button
                    onClick={handleAddAccount}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Account</span>
                </button>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
                    <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                    <span className="text-sm text-red-800">{error}</span>
                    <button
                        onClick={() => setError(null)}
                        className="ml-auto text-red-600 hover:text-red-800"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    <span className="ml-2 text-gray-600">Loading bank accounts...</span>
                </div>
            )}

            {/* Existing Accounts */}
            {!isLoading && (
                <div className="space-y-3">
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            className={`border rounded-lg p-4 ${account.is_default_account ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                        <Building2 className="w-4 h-4 text-gray-500" />
                                        <span className="font-medium text-gray-900">{account.bank_name}</span>
                                        {account.is_default_account && (
                                            <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full flex items-center">
                                                <Star className="w-3 h-3 mr-1" />
                                                Default
                                            </span>
                                        )}
                                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                                            {accountTypes.find(t => t.value === account.account_type)?.label || account.account_type}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                                        <div>
                                            <span className="text-gray-500">Account Name:</span>{' '}
                                            <span className="text-gray-900">{account.account_name}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Account No:</span>{' '}
                                            <span className="text-gray-900 font-mono">{account.account_number}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">IFSC:</span>{' '}
                                            <span className="text-gray-900 font-mono">{account.ifsc_code}</span>
                                        </div>
                                        <div>
                                            <span className="text-gray-500">Branch:</span>{' '}
                                            <span className="text-gray-900">{account.branch_name || 'N/A'}</span>
                                        </div>
                                        {account.upi_id && (
                                            <div>
                                                <span className="text-gray-500">UPI:</span>{' '}
                                                <span className="text-gray-900">{account.upi_id}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center space-x-1 ml-4">
                                    <button
                                        onClick={() => handleEditAccount(account)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                        title="Edit account"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    {!account.is_default_account && (
                                        <button
                                            onClick={() => handleSetDefault(account.id)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                            title="Set as default"
                                        >
                                            <Star className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => handleDeleteAccount(account.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                        title="Delete account"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Add New Account Form */}
                    {isAddingNew && (
                        <div className="border-2 border-dashed border-blue-300 rounded-lg p-4 bg-blue-50">
                            <h3 className="text-sm font-medium text-gray-900 mb-3">{editingId ? 'Edit Bank Account' : 'Add New Bank Account'}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Account Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={newAccount.account_name}
                                        onChange={(e) => setNewAccount({ ...newAccount, account_name: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Main Checking Account"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Account Number *
                                    </label>
                                    <input
                                        type="text"
                                        value={newAccount.account_number}
                                        onChange={(e) => setNewAccount({ ...newAccount, account_number: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., 1234567890"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Bank Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={newAccount.bank_name}
                                        onChange={(e) => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., HDFC Bank"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Account Type
                                    </label>
                                    <select
                                        value={newAccount.account_type}
                                        onChange={(e) => setNewAccount({ ...newAccount, account_type: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        {accountTypes.map(type => (
                                            <option key={type.value} value={type.value}>{type.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        IFSC Code *
                                    </label>
                                    <input
                                        type="text"
                                        value={newAccount.ifsc_code}
                                        onChange={(e) => setNewAccount({ ...newAccount, ifsc_code: e.target.value.toUpperCase() })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                                        placeholder="e.g., HDFC0001234"
                                        maxLength={11}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        Branch Name
                                    </label>
                                    <input
                                        type="text"
                                        value={newAccount.branch_name}
                                        onChange={(e) => setNewAccount({ ...newAccount, branch_name: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., Main Branch"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                        UPI ID
                                    </label>
                                    <input
                                        type="text"
                                        value={newAccount.upi_id}
                                        onChange={(e) => setNewAccount({ ...newAccount, upi_id: e.target.value })}
                                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="e.g., business@upi"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-4">
                                <label className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        checked={newAccount.is_default_account}
                                        onChange={(e) => setNewAccount({ ...newAccount, is_default_account: e.target.checked })}
                                        className="rounded text-blue-600"
                                    />
                                    <span className="text-sm text-gray-700">Set as default account</span>
                                </label>

                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => { setIsAddingNew(false); setEditingId(null); }}
                                        className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center space-x-1 text-sm"
                                    >
                                        <X className="w-4 h-4" />
                                        <span>Cancel</span>
                                    </button>
                                    <button
                                        onClick={handleSaveNewAccount}
                                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-1 text-sm"
                                    >
                                        <Check className="w-4 h-4" />
                                        <span>{editingId ? 'Update Account' : 'Save Account'}</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {accounts.length === 0 && !isAddingNew && (
                        <div className="text-center py-8 text-gray-500">
                            <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="text-sm">No bank accounts added yet.</p>
                            <p className="text-xs mt-1">Click "Add Account" to add your first bank account.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Payment QR Code Section */}
            <div className="mt-6 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                        <QrCode className="w-4 h-4 mr-2" />
                        Payment QR Code
                    </h3>
                    {qrSuccess && (
                        <span className="text-xs text-green-600 font-medium flex items-center">
                            <Check className="w-3 h-3 mr-1" />
                            {qrSuccess}
                        </span>
                    )}
                </div>
                <div className="flex items-start gap-4">
                    {qrPreview ? (
                        <img src={qrPreview} alt="Payment QR" className="w-28 h-28 object-contain border border-gray-300 rounded-lg p-1" />
                    ) : (
                        <div className="w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                            <QrCode className="w-10 h-10 text-gray-300" />
                        </div>
                    )}
                    <div className="flex-1 space-y-3">
                        <div>
                            <input type="file" id="bank-qr-upload" accept="image/*" onChange={handleQRUpload} className="hidden" />
                            <label htmlFor="bank-qr-upload" className="cursor-pointer inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                                <Upload className="w-4 h-4 mr-1.5" />
                                {qrPreview ? 'Change QR' : 'Upload QR Code'}
                            </label>
                            <p className="text-xs text-gray-500 mt-1">Upload your UPI/Payment QR code. It will appear on invoices.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">UPI ID</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={upiId}
                                    onChange={(e) => setUpiId(e.target.value)}
                                    className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., business@upi"
                                />
                                <button
                                    onClick={handleSaveUpiId}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                    Save
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">UPI ID will be shown below the QR code on invoices.</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Info Note */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                    <p className="font-medium mb-1">Bank Account Management Tips:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                        <li>The default account will be used for all transactions unless specified otherwise</li>
                        <li>IFSC code must be in the format: 4 letters + 0 + 6 alphanumeric characters</li>
                        <li>You can add multiple accounts for different purposes (e.g., operations, payroll, tax)</li>
                        <li>Account details will appear on invoices if "Show Bank Details" is enabled</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default BankAccountManager;
