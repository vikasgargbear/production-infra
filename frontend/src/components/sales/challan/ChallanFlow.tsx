/**
 * ChallanFlow
 * 
 * Main orchestrator for challan creation flow
 * Pattern: Matches Invoice Flow structure - thin wrapper that composes hook + steps
 */

import React, { useEffect } from 'react';
import { useChallanLogic } from './hooks/useChallanLogic';
import ChallanDetailsStep from './steps/ChallanDetailsStep';
import ChallanPreviewStep from './steps/ChallanPreviewStep';
import { useEnterAsTab } from '../../../hooks/useEnterAsTab';
import useEscapeKey from '../../../hooks/useEscapeKey';
import CanonicalSalesCommandReview from '../CanonicalSalesCommandReview';

interface ChallanFlowProps {
    open?: boolean;
    onClose?: () => void;
}

const ChallanFlow: React.FC<ChallanFlowProps> = ({ open = true, onClose }) => {
    // Get all logic from hook
    const logic = useChallanLogic({ onClose });

    // Enable Enter-as-Tab navigation (Marg ERP style)
    useEnterAsTab({
        containerRef: logic.challanFormRef,
        enabled: true,
        excludeSelectors: ['textarea', 'button[type="submit"]', '[data-no-enter-tab]']
    });

    // ESC key handling - hierarchical modal management
    const shouldHandleMainEsc = !logic.showCreateCustomer && !logic.showCreateProduct && !logic.showImportModal;
    useEscapeKey(
        () => { if (onClose) onClose(); },
        shouldHandleMainEsc,
        'ChallanFlow-Main'
    );

    useEscapeKey(
        () => logic.setShowCreateCustomer(false),
        logic.showCreateCustomer,
        'CustomerModal'
    );

    useEscapeKey(
        () => logic.setShowCreateProduct(false),
        logic.showCreateProduct,
        'ProductModal'
    );

    useEscapeKey(
        () => logic.setShowImportModal(false),
        logic.showImportModal,
        'ImportModal'
    );

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 's':
                        e.preventDefault();
                        if (logic.currentStep === 2) {
                            logic.saveChallan();
                        } else if (logic.challan.customer_id && logic.challan.items.length > 0) {
                            logic.setCurrentStep(2);
                        }
                        break;
                    case 'p':
                        // Print only available after generation (in success modal)
                        e.preventDefault();
                        break;
                    case 'n':
                        e.preventDefault();
                        logic.setShowCreateCustomer(true);
                        break;
                    case 'i':
                        e.preventDefault();
                        logic.setShowImportModal(true);
                        break;
                    case 'f':
                        e.preventDefault();
                        if (logic.productSearchRef.current) {
                            logic.productSearchRef.current.focus();
                        }
                        break;
                }
            }

            if (e.key === 'Escape') {
                if (logic.showCreateCustomer) logic.setShowCreateCustomer(false);
                else if (logic.showCreateProduct) logic.setShowCreateProduct(false);
                else if (logic.showImportModal) logic.setShowImportModal(false);
                else if (logic.currentStep === 2) logic.setCurrentStep(1);
                else onClose?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        logic.currentStep,
        logic.showCreateCustomer,
        logic.showCreateProduct,
        logic.showImportModal,
        logic.challan.customer_id,
        logic.challan.items.length,
        logic.setShowCreateCustomer,
        logic.setShowCreateProduct,
        logic.setShowImportModal,
        logic.setCurrentStep,
        logic.saveChallan,
        logic.printChallan,
        logic.productSearchRef,
        onClose
    ]);

    if (!open) return null;

    // Step 1: Details & Items
    if (logic.currentStep === 1) {
        return (
            <ChallanDetailsStep
                // State
                challan={logic.challan}
                setChallan={logic.setChallan}
                selectedCustomer={logic.selectedCustomer}
                employees={logic.employees}
                selectedMR={logic.selectedMR}
                setSelectedMR={logic.setSelectedMR}

                // Modals
                showCreateCustomer={logic.showCreateCustomer}
                setShowCreateCustomer={logic.setShowCreateCustomer}
                showCreateProduct={logic.showCreateProduct}
                setShowCreateProduct={logic.setShowCreateProduct}
                showImportModal={logic.showImportModal}
                setShowImportModal={logic.setShowImportModal}
                newProductName={logic.newProductName}
                setNewProductName={logic.setNewProductName}

                // Handlers
                handleCustomerSelect={logic.handleCustomerSelect}
                handleProductSelect={logic.handleProductSelect}
                handleImport={logic.handleImport}
                updateItem={logic.updateItem}
                removeItem={logic.removeItem}

                // Refs
                challanFormRef={logic.challanFormRef}
                itemsTableRef={logic.itemsTableRef}
                productSearchRef={logic.productSearchRef as React.RefObject<HTMLInputElement>}

                // Navigation
                onClose={onClose}
                onContinue={() => logic.setCurrentStep(2)}
            />
        );
    }

    // Step 2: Preview & Save
    return (
        <>
        <ChallanPreviewStep
            // State
            challan={logic.challan}
            setChallan={logic.setChallan}
            selectedCustomer={logic.selectedCustomer}
            documentPolicy={logic.documentPolicy}
            saving={logic.saving}
            submissionUnavailableReason={logic.submissionUnavailableReason}
            sameAsBilling={logic.sameAsBilling}
            setSameAsBilling={logic.setSameAsBilling}
            showSuccessModal={logic.showSuccessModal}
            setShowSuccessModal={logic.setShowSuccessModal}
            createdChallanData={logic.createdChallanData}

            // Handlers
            saveChallan={logic.saveChallan}
            printChallan={logic.printChallan}
            thermalPrintChallan={logic.thermalPrintChallan}
            shareOnWhatsApp={logic.shareOnWhatsApp}

            // Navigation
            onClose={onClose}
            onBack={() => logic.setCurrentStep(1)}
        />
        <CanonicalSalesCommandReview
            title="Review exact delivery dispatch"
            preview={logic.preparedPreview}
            open={logic.reviewOpen}
            posting={logic.saving}
            onBack={logic.closeChallanReview}
            onPost={logic.confirmPreparedChallan}
        />
        </>
    );
};

export default ChallanFlow;
