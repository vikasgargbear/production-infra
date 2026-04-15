/**
 * usePaymentEntry Hook
 * 
 * Extracts payment entry logic from ModularPaymentEntry.tsx
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { paymentsApi, ledgerApi, customersApi } from '../../../services/api';
import { toast } from 'react-toastify';
import { showFinancialEntryNotification } from '../../../utils/financialEntryNotifier';

// ============================================
// Type Definitions
// ============================================

export interface PaymentFormData {
    customer_id: number | null;
    customer_name: string;
    amount: string;
    payment_mode: string;
    payment_date: string;
    reference_number: string;
    bank_account_id: number | null;
    notes: string;
}

export interface InvoiceAllocation {
    invoice_id: number;
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    balance_due: number;
    allocated_amount: number;
    selected: boolean;
}

export interface PaymentCustomer {
    customer_id: number;
    customer_name: string;
    outstanding: number;
    phone?: string;
    email?: string;
}

export type PaymentStep = 'customer' | 'amount' | 'allocation' | 'summary' | 'success';
export type AllocationMethod = 'fifo' | 'lifo' | 'proportional' | 'manual';

// ============================================
// Default Values
// ============================================

const getInitialFormData = (): PaymentFormData => ({
    customer_id: null,
    customer_name: '',
    amount: '',
    payment_mode: 'cash',
    payment_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    bank_account_id: null,
    notes: ''
});

// ============================================
// Receipt Number Generator
// ============================================

const generateReceiptNumber = (): string => {
    const date = new Date();
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `RCP-${dateStr}-${random}`;
};

// ============================================
// Hook Implementation
// ============================================

export function usePaymentEntry() {
    // Form State
    const [formData, setFormData] = useState<PaymentFormData>(getInitialFormData());
    const [receiptNumber, setReceiptNumber] = useState(generateReceiptNumber());

    // Flow State
    const [currentStep, setCurrentStep] = useState<PaymentStep>('customer');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Customer State
    const [selectedCustomer, setSelectedCustomer] = useState<PaymentCustomer | null>(null);
    const [customerInvoices, setCustomerInvoices] = useState<InvoiceAllocation[]>([]);
    const [loadingInvoices, setLoadingInvoices] = useState(false);

    // Allocation State
    const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
    const [allocationMethod, setAllocationMethod] = useState<AllocationMethod>('fifo');

    // ============================================
    // Computed Values
    // ============================================

    const paymentAmount = useMemo(() => {
        return parseFloat(formData.amount) || 0;
    }, [formData.amount]);

    const totalAllocated = useMemo(() => {
        return allocations.reduce((sum, a) => sum + a.allocated_amount, 0);
    }, [allocations]);

    const unallocatedAmount = useMemo(() => {
        return paymentAmount - totalAllocated;
    }, [paymentAmount, totalAllocated]);

    const isValid = useMemo(() => {
        return (
            formData.customer_id !== null &&
            paymentAmount > 0 &&
            formData.payment_mode !== ''
        );
    }, [formData, paymentAmount]);

    // ============================================
    // Customer Actions
    // ============================================

    const handleCustomerSelect = useCallback(async (customer: PaymentCustomer) => {
        setSelectedCustomer(customer);
        setFormData(prev => ({
            ...prev,
            customer_id: customer.customer_id,
            customer_name: customer.customer_name
        }));

        // Load customer's outstanding invoices
        setLoadingInvoices(true);
        try {
            const response = await ledgerApi.getOutstandingBills(
                customer.customer_id,
                'customer'
            );

            if (response.data) {
                const invoices = (response.data.invoices || response.data || []).map((inv: any) => ({
                    invoice_id: inv.invoice_id,
                    invoice_number: inv.invoice_number,
                    invoice_date: inv.invoice_date,
                    total_amount: inv.total_amount || inv.total_amount,
                    balance_due: inv.balance_due || inv.current_outstanding,
                    allocated_amount: 0,
                    selected: false
                }));
                setCustomerInvoices(invoices);
                setAllocations(invoices);
            }
        } catch (err) {
            console.error('Failed to load invoices:', err);
        } finally {
            setLoadingInvoices(false);
        }

        setCurrentStep('amount');
    }, []);

    // ============================================
    // Form Actions
    // ============================================

    const updateFormField = useCallback((field: keyof PaymentFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    }, []);

    const resetForm = useCallback(() => {
        setFormData(getInitialFormData());
        setSelectedCustomer(null);
        setCustomerInvoices([]);
        setAllocations([]);
        setCurrentStep('customer');
        setReceiptNumber(generateReceiptNumber());
        setError(null);
    }, []);

    // ============================================
    // Allocation Actions
    // ============================================

    const applyAllocationMethod = useCallback((method: AllocationMethod) => {
        setAllocationMethod(method);

        let remaining = paymentAmount;
        const newAllocations = [...customerInvoices];

        if (method === 'fifo') {
            // First In First Out - oldest invoices first
            newAllocations.sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime());
        } else if (method === 'lifo') {
            // Last In First Out - newest invoices first
            newAllocations.sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
        } else if (method === 'proportional') {
            // Proportional allocation
            const totalDue = newAllocations.reduce((sum, inv) => sum + inv.balance_due, 0);
            newAllocations.forEach(inv => {
                const proportion = inv.balance_due / totalDue;
                inv.allocated_amount = Math.min(inv.balance_due, Math.round(paymentAmount * proportion * 100) / 100);
                inv.selected = inv.allocated_amount > 0;
            });
            setAllocations(newAllocations);
            return;
        }

        // For FIFO/LIFO
        newAllocations.forEach(inv => {
            if (remaining > 0) {
                const allocate = Math.min(remaining, inv.balance_due);
                inv.allocated_amount = allocate;
                inv.selected = allocate > 0;
                remaining -= allocate;
            } else {
                inv.allocated_amount = 0;
                inv.selected = false;
            }
        });

        setAllocations(newAllocations);
    }, [paymentAmount, customerInvoices]);

    const updateAllocation = useCallback((invoiceId: number, amount: number) => {
        setAllocations(prev => prev.map(alloc =>
            alloc.invoice_id === invoiceId
                ? { ...alloc, allocated_amount: Math.min(amount, alloc.balance_due), selected: amount > 0 }
                : alloc
        ));
    }, []);

    const toggleInvoiceSelection = useCallback((invoiceId: number, selected: boolean) => {
        setAllocations(prev => prev.map(alloc => {
            if (alloc.invoice_id === invoiceId) {
                return {
                    ...alloc,
                    selected,
                    allocated_amount: selected ? Math.min(unallocatedAmount + alloc.allocated_amount, alloc.balance_due) : 0
                };
            }
            return alloc;
        }));
    }, [unallocatedAmount]);

    // ============================================
    // Navigation Actions
    // ============================================

    const goToStep = useCallback((step: PaymentStep) => {
        setCurrentStep(step);
    }, []);

    const goBack = useCallback(() => {
        const steps: PaymentStep[] = ['customer', 'amount', 'allocation', 'summary'];
        const currentIndex = steps.indexOf(currentStep);
        if (currentIndex > 0) {
            setCurrentStep(steps[currentIndex - 1]);
        }
    }, [currentStep]);

    const goNext = useCallback(() => {
        const steps: PaymentStep[] = ['customer', 'amount', 'allocation', 'summary'];
        const currentIndex = steps.indexOf(currentStep);
        if (currentIndex < steps.length - 1) {
            setCurrentStep(steps[currentIndex + 1]);
        }
    }, [currentStep]);

    // ============================================
    // Save Actions
    // ============================================

    const validatePayment = useCallback((): boolean => {
        if (!formData.customer_id) {
            setError('Please select a customer');
            return false;
        }
        if (paymentAmount <= 0) {
            setError('Please enter a valid amount');
            return false;
        }
        setError(null);
        return true;
    }, [formData.customer_id, paymentAmount]);

    const savePayment = useCallback(async (): Promise<boolean> => {
        if (!validatePayment()) return false;

        setSaving(true);
        setError(null);

        try {
            const selectedAllocations = allocations
                .filter(a => a.selected && a.allocated_amount > 0)
                .map(a => ({
                    invoice_id: a.invoice_id,
                    amount: a.allocated_amount
                }));

            const payload = {
                party_id: formData.customer_id,
                party_type: 'customer' as const,
                payment_type: 'receipt' as const,
                amount: paymentAmount,
                payment_mode: formData.payment_mode,
                payment_date: formData.payment_date,
                reference_number: formData.reference_number || receiptNumber,
                bank_account_id: formData.bank_account_id,
                notes: formData.notes,
                allocations: selectedAllocations
            };

            const response = await paymentsApi.create(payload as any);

            if (response.data) {
                showFinancialEntryNotification({
                    title: 'Payment Receipt Posted',
                    reference: response.data.payment_reference || receiptNumber,
                    amount: paymentAmount,
                    status: 'confirmed',
                    impacts: [
                        'This money is now marked as received.',
                        'The customer now owes less by this amount.',
                        'If you linked invoices, this payment is used against those bills.'
                    ]
                });
                toast.success('Payment recorded successfully!');
                setCurrentStep('success');
                return true;
            }
            return false;
        } catch (err: any) {
            setError(err.message || 'Failed to save payment');
            toast.error('Failed to save payment');
            return false;
        } finally {
            setSaving(false);
        }
    }, [formData, paymentAmount, allocations, receiptNumber, validatePayment]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Form
        formData,
        updateFormField,
        resetForm,
        receiptNumber,

        // Flow
        currentStep,
        goToStep,
        goBack,
        goNext,
        loading,
        saving,
        error,

        // Customer
        selectedCustomer,
        handleCustomerSelect,
        customerInvoices,
        loadingInvoices,

        // Allocation
        allocations,
        allocationMethod,
        applyAllocationMethod,
        updateAllocation,
        toggleInvoiceSelection,

        // Computed
        paymentAmount,
        totalAllocated,
        unallocatedAmount,
        isValid,

        // Actions
        validatePayment,
        savePayment
    };
}

export default usePaymentEntry;
