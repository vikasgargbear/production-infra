/**
 * SalesOrderFlow Component
 * Multi-step flow for creating sales orders
 * Refactored to use useSalesOrderLogic hook and step components
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShoppingCart, AlertTriangle } from 'lucide-react';
import {
    ModuleHeader,
    DocumentFooter,
    GenericSuccessModal
} from '../../global';
import CustomerCreation from '../../global/creation/CustomerCreation';
import { ProductCreationModal } from '../../global';
import { DocumentImportModal } from '../../global/modals';
import { useSalesOrderLogic } from './hooks/useSalesOrderLogic';
import { salesOrderImportDocumentTypes } from './salesOrderImportTypes';
import OrderItemsStep from './steps/OrderItemsStep';
import OrderReviewStep from './steps/OrderReviewStep';
import type { Customer } from '../../../types/models';
import CanonicalSalesCommandReview from '../CanonicalSalesCommandReview';
import { toast } from 'react-toastify';
import { resolvedSalesOrderDeliveryAddress } from '../utils/canonicalSalesChainCommand';

// ==================== TYPE DEFINITIONS ====================

interface SalesOrderFlowProps {
    open?: boolean;
    onClose: () => void;
}

// Using canonical types from /types/models - no local duplicates

// ==================== MAIN COMPONENT ====================

const SalesOrderFlow: React.FC<SalesOrderFlowProps> = ({ open = true, onClose }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);
    const cancelBackButtonRef = useRef<HTMLButtonElement>(null);

    // Use the extracted hook for all state and logic
    const {
        order,
        setOrder,
        documentPolicy,
        businessDate,
        selectedCustomer,
        sameAsBilling,
        setSameAsBilling,
        saving,
        submissionUnavailableReason,
        preparedPreview,
        reviewOpen,
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
        confirmPreparedOrder,
        closeOrderReview,
        printOrder,
        shareOnWhatsApp,
        resetOrder,
        companyInfo
    } = useSalesOrderLogic();

    /** Ask for confirmation before discarding a partially-filled order. */
    const handleCancelRequest = useCallback(() => {
        const hasUnsavedData = Boolean(order.customer_id) || order.items.length > 0;
        if (hasUnsavedData) {
            setShowCancelConfirm(true);
        } else {
            onClose();
        }
    }, [onClose, order.customer_id, order.items.length]);

    useEffect(() => {
        if (showCancelConfirm) cancelBackButtonRef.current?.focus();
    }, [showCancelConfirm]);

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
                if (showCancelConfirm) setShowCancelConfirm(false);
                else if (showCustomerModal) setShowCustomerModal(false);
                else if (showProductModal) setShowProductModal(false);
                else if (showImportModal) setShowImportModal(false);
                else if (currentStep === 2) setCurrentStep(1);
                else handleCancelRequest();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentStep, handleCancelRequest, showCancelConfirm, showCustomerModal, showProductModal, showImportModal, saveOrder, printOrder, setShowCustomerModal, setShowImportModal, setShowProductModal]);

    if (!open) return null;

    const deliveryAddressReady = Boolean(
        resolvedSalesOrderDeliveryAddress(order.shipping_address_data),
    );

    return (
        <>
            {/* Step 1: Create Order */}
            {currentStep === 1 && (
                <div className="h-full bg-gray-50">
                    <div className="h-full flex flex-col">
                        <ModuleHeader
                            title="Sales Order"
                            documentNumber={order.order_number}
                            status={order.status}
                            icon={ShoppingCart}
                            iconColor="text-blue-600"
                            onClose={handleCancelRequest}
                        />

                        <div className="bg-white px-4 py-2 text-xs text-gray-600 border-b border-gray-200">
                            Keyboard shortcuts: <strong>Ctrl+N</strong> - Add Customer | <strong>Ctrl+I</strong> - Import | <strong>Ctrl+F</strong> - Search Products | <strong>Esc</strong> - Close
                        </div>

                        <div className="flex-1 overflow-y-auto bg-gray-50">
                            <OrderItemsStep
                                order={order}
                                setOrder={setOrder}
                                maximumOrderDate={businessDate}
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
                            totalItems={order.items.length}
                            totalAmount={order.total_amount}
                            onCancel={handleCancelRequest}
                            onContinue={() => setCurrentStep(2)}
                            cancelLabel="Cancel"
                            continueLabel="Continue"
                            continueDisabled={!order.customer_id || !deliveryAddressReady || order.items.length === 0 || !order.order_date || !order.expected_delivery_date}
                            continueButtonColor="blue"
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
                            onProductCreated={(product) => {
                                setShowProductModal(false);
                                setNewProductName('');
                                toast.info(`Product ${product.product_code} is a draft and was not added. Complete classification and activation before ordering it.`);
                            }}
                            initialProductName={newProductName}
                        />
                    )}

                    {showImportModal && (
                        <DocumentImportModal
                            isOpen={showImportModal}
                            onClose={() => setShowImportModal(false)}
                            onImport={handleImport}
                            title="Import from Invoice or Delivery Challan"
                            documentTypes={salesOrderImportDocumentTypes}
                        />
                    )}
                </div>
            )}

            {/* Step 2: Review and Confirm */}
            {currentStep === 2 && (
                <div className="h-full bg-gray-50">
                    <div className="h-full flex flex-col">
                        <ModuleHeader
                            title="Review Order"
                            documentNumber={order.order_number}
                            status={order.status}
                            icon={ShoppingCart}
                            iconColor="text-blue-600"
                            onClose={handleCancelRequest}
                            additionalActions={[
                                {
                                    label: "Edit",
                                    onClick: () => setCurrentStep(1),
                                    variant: "default"
                                }
                            ]}
                        />

                        <div className="bg-white px-4 py-2 text-xs text-gray-600 border-b border-gray-200">
                            Keyboard shortcuts: <strong>Ctrl+S</strong> - Save Order | <strong>Esc</strong> - Back
                        </div>

                        <div className="flex-1 overflow-y-auto bg-gray-50">
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
                                documentPolicy={documentPolicy}
                            />
                        </div>

                        {submissionUnavailableReason && <div id="sales-order-submission-status" role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                            {submissionUnavailableReason}
                        </div>}
                        <fieldset disabled={Boolean(submissionUnavailableReason)} aria-describedby={submissionUnavailableReason ? "sales-order-submission-status" : undefined}>
                            <DocumentFooter
                                totalItems={order.items.length}
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
                        </fieldset>
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
            <CanonicalSalesCommandReview
                title="Review exact sales order"
                preview={preparedPreview}
                open={reviewOpen}
                posting={saving}
                onBack={closeOrderReview}
                onPost={confirmPreparedOrder}
            />

            {/* Cancel confirmation modal */}
            {showCancelConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div
                        className="w-full max-w-sm rounded-lg border border-gray-200 bg-white shadow-xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="cancel-order-confirm-title"
                    >
                        <div className="flex items-center gap-3 border-b border-gray-200 p-4">
                            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
                            <h3 id="cancel-order-confirm-title" className="text-base font-semibold text-gray-900">
                                Cancel this order?
                            </h3>
                        </div>
                        <p className="px-4 py-3 text-sm text-gray-600">
                            Your order details will not be saved. This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2 border-t border-gray-200 p-4">
                            <button
                                ref={cancelBackButtonRef}
                                type="button"
                                onClick={() => setShowCancelConfirm(false)}
                                className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowCancelConfirm(false); onClose(); }}
                                className="min-h-11 rounded-md border border-red-500 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                            >
                                Confirm Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default SalesOrderFlow;
