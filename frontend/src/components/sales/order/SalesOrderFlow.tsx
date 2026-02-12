/**
 * SalesOrderFlow Component
 * Multi-step flow for creating sales orders
 * Refactored to use useSalesOrderLogic hook and step components
 */

import React, { useState, useEffect } from 'react';
import { ShoppingCart } from 'lucide-react';
import {
    ModuleHeader,
    DocumentFooter,
    GenericSuccessModal
} from '../../global';
import CustomerCreation from '../../global/creation/CustomerCreation';
import { ProductCreationModal } from '../../global';
import { DocumentImportModal } from '../../global/modals';
import { useSalesOrderLogic } from './hooks/useSalesOrderLogic';
import OrderItemsStep from './steps/OrderItemsStep';
import OrderReviewStep from './steps/OrderReviewStep';
import type { Customer, Product } from '../../../types/models';

// ==================== TYPE DEFINITIONS ====================

interface SalesOrderFlowProps {
    open?: boolean;
    onClose: () => void;
}

// Using canonical types from /types/models - no local duplicates

// ==================== MAIN COMPONENT ====================

const SalesOrderFlow: React.FC<SalesOrderFlowProps> = ({ open = true, onClose }) => {
    const [currentStep, setCurrentStep] = useState(1);

    // Use the extracted hook for all state and logic
    const {
        order,
        setOrder,
        selectedCustomer,
        sameAsBilling,
        setSameAsBilling,
        saving,
        message,
        messageType,
        selectedBankAccount,
        setSelectedBankAccount,
        createdOrderData,
        showSuccessModal,
        setShowSuccessModal,
        showCustomerModal,
        setShowCustomerModal,
        showProductModal,
        setShowProductModal,
        showImportModal,
        setShowImportModal,
        newProductName,
        setNewProductName,
        handleCustomerSelect,
        handleProductSelect,
        handleImport,
        updateItem,
        removeItem,
        saveOrder,
        printOrder,
        shareOnWhatsApp,
        resetOrder,
        companyInfo
    } = useSalesOrderLogic();

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent): void => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        if (currentStep === 2) {
                            saveOrder();
                        }
                        break;
                    case 'p':
                        // Print only available after generation (in success modal)
                        e.preventDefault();
                        break;
                    case 'n':
                        e.preventDefault();
                        setShowCustomerModal(true);
                        break;
                    case 'i':
                        e.preventDefault();
                        setShowImportModal(true);
                        break;
                    case 'f':
                        e.preventDefault();
                        const productSearchInput = document.querySelector('input[placeholder*="Search product"]') as HTMLInputElement;
                        if (productSearchInput) productSearchInput.focus();
                        break;
                }
            }

            if (e.key === 'Escape') {
                if (showCustomerModal) setShowCustomerModal(false);
                else if (showProductModal) setShowProductModal(false);
                else if (showImportModal) setShowImportModal(false);
                else if (currentStep === 2) setCurrentStep(1);
                else onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentStep, showCustomerModal, showProductModal, showImportModal, saveOrder, printOrder, setShowCustomerModal, setShowImportModal, setShowProductModal, onClose]);

    if (!open) return null;

    return (
        <>
            {/* Step 1: Create Order */}
            {currentStep === 1 && (
                <div className="h-full bg-blue-50">
                    <div className="h-full flex flex-col">
                        <ModuleHeader
                            title="Sales Order"
                            documentNumber={order.order_number}
                            status={order.status}
                            icon={ShoppingCart}
                            iconColor="text-purple-600"
                            onClose={onClose}
                        />

                        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
                            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+I</strong> - Import | <strong>Ctrl+F</strong> - Search Products | <strong>Ctrl+S</strong> - Save | <strong>Esc</strong> - Close
                        </div>

                        <div className="flex-1 overflow-y-auto bg-blue-50">
                            <OrderItemsStep
                                order={order}
                                setOrder={setOrder}
                                selectedCustomer={selectedCustomer}
                                message={message}
                                messageType={messageType}
                                onCustomerSelect={handleCustomerSelect}
                                onProductSelect={handleProductSelect}
                                onUpdateItem={updateItem}
                                onRemoveItem={removeItem}
                                onShowCustomerModal={() => setShowCustomerModal(true)}
                                onShowProductModal={() => setShowProductModal(true)}
                                onShowImportModal={() => setShowImportModal(true)}
                                onCreateProduct={(productName: string) => {
                                    setNewProductName(productName || '');
                                    setShowProductModal(true);
                                }}
                            />
                        </div>

                        <DocumentFooter
                            totalItems={order.total_quantity}
                            totalAmount={order.total_amount}
                            onCancel={onClose}
                            onContinue={() => setCurrentStep(2)}
                            onSave={() => { }}
                            cancelLabel="Cancel"
                            continueLabel="Continue"
                            continueDisabled={!order.customer_id || order.items.length === 0}
                            continueButtonColor="purple"
                        />
                    </div>

                    {/* Modals */}
                    {showCustomerModal && (
                        <CustomerCreation
                            onClose={() => setShowCustomerModal(false)}
                            onCustomerCreated={(customer: Customer) => {
                                handleCustomerSelect(customer);
                                setShowCustomerModal(false);
                            }}
                        />
                    )}

                    {showProductModal && (
                        <ProductCreationModal
                            show={showProductModal}
                            onClose={() => {
                                setShowProductModal(false);
                                setNewProductName('');
                            }}
                            onProductCreated={(product: any) => {
                                handleProductSelect(product);
                                setShowProductModal(false);
                                setNewProductName('');
                            }}
                            initialProductName={newProductName}
                        />
                    )}

                    {showImportModal && (
                        <DocumentImportModal
                            isOpen={showImportModal}
                            onClose={() => setShowImportModal(false)}
                            onImport={handleImport as any}
                        />
                    )}
                </div>
            )}

            {/* Step 2: Review and Confirm */}
            {currentStep === 2 && (
                <div className="h-full bg-blue-50">
                    <div className="h-full flex flex-col">
                        <ModuleHeader
                            title="Review Order"
                            documentNumber={order.order_number}
                            status={order.status}
                            icon={ShoppingCart}
                            iconColor="text-purple-600"
                            onClose={onClose}
                            additionalActions={[
                                {
                                    label: "Edit",
                                    onClick: () => setCurrentStep(1),
                                    variant: "default"
                                }
                            ]}
                        />

                        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
                            Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Order | <strong>Esc</strong> - Back
                        </div>

                        <div className="flex-1 overflow-y-auto bg-blue-50">
                            <OrderReviewStep
                                order={order}
                                setOrder={setOrder}
                                selectedCustomer={selectedCustomer}
                                sameAsBilling={sameAsBilling}
                                setSameAsBilling={setSameAsBilling}
                                selectedBankAccount={selectedBankAccount}
                                setSelectedBankAccount={setSelectedBankAccount}
                                message={message}
                                messageType={messageType}
                                companyInfo={companyInfo}
                            />
                        </div>

                        <DocumentFooter
                            totalItems={order.total_quantity}
                            totalAmount={order.total_amount}
                            subtotalAmount={order.subtotal_amount}
                            taxAmount={order.tax_amount}
                            roundOffAmount={order.round_off}
                            grandTotal={order.total_amount}
                            onSave={saveOrder}
                            saveLabel="Generate Order"
                            isSaving={saving}
                            showActionButtons={true}
                            showPrintOptions={false}
                        />
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <GenericSuccessModal
                    isOpen={showSuccessModal}
                    onClose={() => {
                        setShowSuccessModal(false);
                        onClose();
                    }}
                    title="Sales Order Created!"
                    documentNumber={createdOrderData?.orderNumber}
                    documentId={createdOrderData?.orderId}
                    documentType="sales-order"
                    customerName={createdOrderData?.customerName}
                    totalAmount={createdOrderData?.totalAmount}
                    autoCloseDelay={5}
                    additionalActions={[
                        {
                            label: "Create Another Order",
                            onClick: () => {
                                setShowSuccessModal(false);
                                resetOrder();
                                setCurrentStep(1);
                            },
                            variant: "primary"
                        }
                    ]}
                    onPrint={() => {
                        printOrder();
                        setShowSuccessModal(false);
                    }}
                    onWhatsApp={() => {
                        shareOnWhatsApp();
                        setShowSuccessModal(false);
                    }}
                    showCopy={true}
                    enableShare={true}
                    partyDetails={{
                        name: selectedCustomer?.customer_name,
                        phone: selectedCustomer?.phone,
                        email: selectedCustomer?.email,
                        customer_id: selectedCustomer?.customer_id
                    }}
                    documentData={{
                        expectedDelivery: order.expected_delivery_date,
                        paymentTerms: order.payment_terms,
                        itemCount: order.items?.length || 0,
                        date: order.order_date
                    }}
                    companyInfo={companyInfo as any}
                />
            )}
        </>
    );
};

export default SalesOrderFlow;
