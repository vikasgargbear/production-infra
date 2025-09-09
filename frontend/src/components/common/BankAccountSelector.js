import React, { useState, useEffect } from 'react';
import { ChevronDown, CreditCard, Star, Building2 } from 'lucide-react';
import { bankAccountsAPI } from '../../services/api';

const BankAccountSelector = ({ 
  value, 
  onChange, 
  showBalance = false,
  transactionType = 'general', // 'payment', 'receipt', 'general'
  className = '',
  required = false,
  label = 'Bank Account',
  placeholder = 'Select bank account',
  autoSelectDefault = true
}) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    fetchBankAccounts();
  }, []);

  useEffect(() => {
    // Auto-select default account if no value is provided
    if (!value && accounts.length > 0 && autoSelectDefault) {
      const defaultAccount = accounts.find(acc => acc.is_default_account);
      if (defaultAccount) {
        handleSelect(defaultAccount);
      }
    } else if (value && accounts.length > 0) {
      // Set selected account based on value
      const account = accounts.find(acc => acc.id === value || acc.bank_account_id === value);
      setSelectedAccount(account);
    }
  }, [value, accounts, autoSelectDefault]);

  const fetchBankAccounts = async () => {
    try {
      setLoading(true);
      const data = await bankAccountsAPI.getBankAccounts();
      
      // Filter based on transaction type if needed
      let filteredAccounts = data;
      if (transactionType === 'payment') {
        filteredAccounts = data.filter(acc => acc.is_payment_account !== false);
      } else if (transactionType === 'receipt') {
        filteredAccounts = data.filter(acc => acc.is_active);
      }
      
      setAccounts(filteredAccounts);
    } catch (error) {
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (account) => {
    setSelectedAccount(account);
    setIsOpen(false);
    
    // Return full account object or just ID based on use case
    if (onChange) {
      onChange({
        bank_account_id: account.id || account.bank_account_id,
        account_name: account.account_name,
        account_number: account.account_number,
        bank_name: account.bank_name,
        ifsc_code: account.ifsc_code,
        account_type: account.account_type,
        is_default: account.is_default_account
      });
    }
  };

  const formatAccountDisplay = (account) => {
    if (!account) return '';
    return `${account.bank_name} - ${account.account_number.slice(-4).padStart(account.account_number.length, '*')}`;
  };

  if (loading) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
          <span className="text-gray-500">Loading accounts...</span>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
          <span className="text-gray-500">No bank accounts configured</span>
        </div>
      </div>
    );
  }

  // If only one account exists, show it as read-only
  if (accounts.length === 1) {
    const account = accounts[0];
    return (
      <div className={className}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-gray-500" />
            <span className="text-gray-900">{formatAccountDisplay(account)}</span>
            {account.is_default_account && (
              <Star className="w-3 h-3 text-yellow-500 fill-current" />
            )}
          </div>
          <span className="text-xs text-gray-500 uppercase">{account.account_type}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-3 py-2 border rounded-lg bg-white flex items-center justify-between hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            selectedAccount ? 'border-gray-300' : 'border-gray-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            {selectedAccount ? (
              <>
                <CreditCard className="w-4 h-4 text-gray-500" />
                <span className="text-gray-900">{formatAccountDisplay(selectedAccount)}</span>
                {selectedAccount.is_default_account && (
                  <Star className="w-3 h-3 text-yellow-500 fill-current" />
                )}
              </>
            ) : (
              <span className="text-gray-500">{placeholder}</span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`} />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg">
            <div className="py-1 max-h-60 overflow-auto">
              {accounts.map((account) => (
                <button
                  key={account.id || account.bank_account_id}
                  type="button"
                  onClick={() => handleSelect(account)}
                  className={`w-full px-3 py-2 text-left hover:bg-gray-50 ${
                    selectedAccount?.id === account.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <Building2 className="w-4 h-4 text-gray-500 mt-0.5" />
                        <span className="font-medium text-gray-900">{account.bank_name}</span>
                        {account.is_default_account && (
                          <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded flex items-center">
                            <Star className="w-3 h-3 mr-0.5 fill-current" />
                            Default
                          </span>
                        )}
                      </div>
                      <div className="ml-6 mt-1 space-y-0.5">
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">A/C:</span> {account.account_number}
                        </div>
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">IFSC:</span> {account.ifsc_code}
                        </div>
                        {account.account_name && (
                          <div className="text-xs text-gray-600">
                            <span className="font-medium">Name:</span> {account.account_name}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ml-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        {account.account_type}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            
            {/* Quick Actions */}
            <div className="border-t border-gray-200 p-2">
              <a
                href="/settings/bank-accounts"
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Manage Bank Accounts →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Selected Account Details */}
      {selectedAccount && showBalance && (
        <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
          <div className="flex justify-between">
            <span>Account Type: {selectedAccount.account_type}</span>
            {selectedAccount.branch_name && (
              <span>Branch: {selectedAccount.branch_name}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default BankAccountSelector;