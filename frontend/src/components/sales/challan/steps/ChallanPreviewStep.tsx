/**
 * ChallanPreviewStep
 * 
 * Step 2: Review, transport details, addresses, and save
 * Pattern: Matches InvoicePreviewStep structure
 */

import React from 'react';
import { Truck } from 'lucide-react';
import {
    ModuleHeader,
    DocumentFooter,
    NotesSection,
    GenericSuccessModal
} from '../../../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../../../global/ui/KeyboardShortcuts';
import ChallanPreview from '../ui/ChallanPreview';
import { Challan, CustomerDetails, CreatedChallanData } from '../types/challanTypes';
import { useCompany } from '../../../../contexts/CompanyContext';
import { canonicalDispatchPreviewUnavailableReason } from '../../utils/canonicalSalesPreviewFacts';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';

interface ChallanPreviewStepProps {
    // State
    challan: Challan;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    selectedCustomer: CustomerDetails | null;
    documentPolicy: CanonicalDocumentPolicy | null;
    saving: boolean;
    submissionUnavailableReason: string;
    sameAsBilling: boolean;
    setSameAsBilling: React.Dispatch<React.SetStateAction<boolean>>;
    showSuccessModal: boolean;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    createdChallanData: CreatedChallanData | null;

    // Handlers
    saveChallan: () => Promise<void>;
    printChallan: () => void;
    thermalPrintChallan: (width?: string) => void;
    shareOnWhatsApp: () => void;

    // Navigation
    onClose?: () => void;
    onBack: () => void;
}

const ChallanPreviewStep: React.FC<ChallanPreviewStepProps> = ({
    challan,
    setChallan,
    selectedCustomer,
    documentPolicy,
    saving,
    submissionUnavailableReason,
    showSuccessModal,
    setShowSuccessModal,
    createdChallanData,
    saveChallan,
    printChallan,
    thermalPrintChallan,
    shareOnWhatsApp,
    onClose,
    onBack
}) => {
    const { companyInfo } = useCompany();
    const previewUnavailableReason = canonicalDispatchPreviewUnavailableReason(challan);
    const blockingReason = submissionUnavailableReason || previewUnavailableReason || '';

    return (
        <div className="h-full bg-gray-50">
            <div className="h-full flex flex-col">

                {/* Header */}
                <ModuleHeader
                    title="Review Challan"
                    documentNumber={challan.challan_number}
                    status={challan.status}
                    icon={Truck}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    historyType="challan"
                    additionalActions={[
                        { label: "Edit", onClick: onBack, variant: "default" }
                    ]}
                />

                {/* Keyboard Shortcuts */}
                <KeyboardShortcuts shortcuts={SHORTCUT_SETS.REVIEW} />

                {/* Content */}
                <div className="flex-1 overflow-y-auto bg-gray-50">
                    <div className="max-w-6xl mx-auto px-6 py-6">

                        {/* Only logistics fields accepted by sales.dispatch.prepare are editable. */}
                        <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                                <h3 className="flex items-center text-sm font-semibold uppercase tracking-wider text-gray-900">
                                    <span className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                                        <Truck className="h-4 w-4 text-white" />
                                    </span>
                                    Transport evidence
                                </h3>
                            </div>
                            <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2">
                                <div>
                                    <span className="mb-2 block text-sm font-medium text-gray-600">Transport mode</span>
                                    <div className="min-h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800">
                                        {documentPolicy?.logistics_modes[0]?.display_name
                                            || 'Waiting for server policy'}
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="dispatch-distance-km" className="mb-2 block text-sm font-medium text-gray-600">
                                        Exact distance (km)
                                    </label>
                                    <input
                                        id="dispatch-distance-km"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        value={challan.distance_km}
                                        onChange={(event) => setChallan(previous => ({
                                            ...previous,
                                            distance_km: event.target.value,
                                        }))}
                                        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter measured distance"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                            The shipping address is resolved from the approved sales order by the canonical prepare operation. This screen does not create or override an unverified address.
                        </div>

                        {/* Challan Preview */}
                        <ChallanPreview
                            challan={challan}
                            companyInfo={companyInfo ?? undefined}
                        />

                        {/* Notes Section */}
                        <div className="bg-white rounded-lg border border-gray-200 p-4 mt-6">
                            <NotesSection
                                value={challan.notes}
                                onChange={(value: string) => setChallan(prev => ({ ...prev, notes: value }))}
                                placeholder="Add delivery instructions or special notes..."
                                rows={2}
                                className=""
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                {blockingReason && <div id="challan-submission-status" role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    {blockingReason}
                </div>}
                <fieldset disabled={Boolean(blockingReason)} aria-describedby={blockingReason ? "challan-submission-status" : undefined}>
                    <DocumentFooter
                        totalItems={challan.items.length}
                        onSave={saveChallan}
                        saveLabel="Generate Challan"
                        isSaving={saving}
                        showActionButtons={true}
                        showPrintOptions={false}
                    />
                </fieldset>

            </div>

            {/* Success Modal */}
            {showSuccessModal && createdChallanData && (
                <GenericSuccessModal
                    {...{
                        isOpen: showSuccessModal,
                        onClose: () => {
                            setShowSuccessModal(false);
                            onClose?.();
                        },
                        title: "Challan Created Successfully!",
                        documentType: "challan",
                        documentNumber: createdChallanData.challan_number,
                        documentId: createdChallanData.challan_id,
                        documentData: createdChallanData as any,
                        onPrint: printChallan,
                        onThermalPrint: thermalPrintChallan,
                        onWhatsApp: shareOnWhatsApp,
                        phoneNumber: createdChallanData.customer_details?.primary_phone
                            || challan.customer_details?.primary_phone
                    } as any}
                />
            )}
        </div>
    );
};

export default ChallanPreviewStep;
