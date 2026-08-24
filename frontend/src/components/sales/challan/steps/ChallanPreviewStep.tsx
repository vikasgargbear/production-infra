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
    AddressForm,
    GenericSuccessModal
} from '../../../global';
import KeyboardShortcuts, { SHORTCUT_SETS } from '../../../global/ui/KeyboardShortcuts';
import ChallanPreview from '../ui/ChallanPreview';
import { Challan, CustomerDetails, CreatedChallanData } from '../types/challanTypes';
import { useCompany } from '../../../../contexts/CompanyContext';

interface ChallanPreviewStepProps {
    // State
    challan: Challan;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    selectedCustomer: CustomerDetails | null;
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
    saving,
    submissionUnavailableReason,
    sameAsBilling,
    setSameAsBilling,
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

                        {/* Transport Details Section */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
                            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3">
                                        <Truck className="w-4 h-4 text-white" />
                                    </div>
                                    Transport Details
                                </h3>
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">Transport Company</label>
                                        <input
                                            type="text"
                                            value={challan.transport_company}
                                            onChange={(e) => setChallan(prev => ({ ...prev, transport_company: e.target.value }))}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Company name"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">Vehicle Number</label>
                                        <input
                                            type="text"
                                            value={challan.vehicle_number}
                                            onChange={(e) => setChallan(prev => ({ ...prev, vehicle_number: e.target.value.toUpperCase() }))}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 uppercase"
                                            placeholder="KA01AB1234"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">Driver Phone</label>
                                        <input
                                            type="tel"
                                            value={challan.driver_phone}
                                            onChange={(e) => setChallan(prev => ({ ...prev, driver_phone: e.target.value }))}
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="Phone number"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-600 mb-2">Freight Charges</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">₹</span>
                                            <input
                                                type="number"
                                                value={challan.freight_charges || ''}
                                                onChange={(e) => {
                                                    const value = parseFloat(e.target.value) || 0;
                                                    setChallan(prev => ({ ...prev, freight_charges: value }));
                                                }}
                                                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="0"
                                                step="0.01"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Address Section */}
                        {selectedCustomer && (
                            <div className="grid grid-cols-2 gap-6 mb-6">
                                {/* Billing Address */}
                                <AddressForm
                                    customer={selectedCustomer}
                                    addressType="billing"
                                    addressData={{
                                        address_line1: selectedCustomer.address || '',
                                        city: selectedCustomer.city || '',
                                        state: selectedCustomer.state || '',
                                        pincode: selectedCustomer.pincode || ''
                                    }}
                                    onChange={(addressString: string) => {
                                        setChallan(prev => ({ ...prev, billing_address: addressString }));
                                    }}
                                    className=""
                                />

                                {/* Delivery Address */}
                                <AddressForm
                                    customer={selectedCustomer}
                                    addressType="shipping"
                                    addressData={{
                                        address_line1: challan.delivery_address || '',
                                        city: challan.delivery_city || '',
                                        state: challan.delivery_state || '',
                                        pincode: challan.delivery_pincode || ''
                                    }}
                                    sameAsBilling={sameAsBilling}
                                    onSameAsBillingChange={(same: boolean) => {
                                        setSameAsBilling(same);
                                        if (same && selectedCustomer) {
                                            setChallan(prev => ({
                                                ...prev,
                                                delivery_address: selectedCustomer.address || '',
                                                delivery_city: selectedCustomer.city || '',
                                                delivery_state: selectedCustomer.state || '',
                                                delivery_pincode: selectedCustomer.pincode || ''
                                            }));
                                        }
                                    }}
                                    onChange={(addressString: string) => {
                                        setChallan(prev => ({ ...prev, delivery_address: addressString }));
                                    }}
                                    onSave={(addressData: any) => {
                                        setChallan(prev => ({
                                            ...prev,
                                            delivery_address: addressData.address_line1 || '',
                                            delivery_city: addressData.city || '',
                                            delivery_state: addressData.state || '',
                                            delivery_pincode: addressData.pincode || ''
                                        }));
                                    }}
                                    className=""
                                />
                            </div>
                        )}

                        {/* Challan Preview */}
                        <ChallanPreview
                            challan={{
                                ...challan,
                                customer_details: (selectedCustomer ? {
                                    address: selectedCustomer.address || '',
                                    city: selectedCustomer.city || '',
                                    state: selectedCustomer.state || '',
                                    pincode: selectedCustomer.pincode || '',
                                    phone: selectedCustomer.phone || ''
                                } : null) as any,
                                delivery_address: challan.delivery_address || '',
                                delivery_city: challan.delivery_city || '',
                                delivery_state: challan.delivery_state || '',
                                delivery_pincode: challan.delivery_pincode || '',
                                delivery_contact_person: challan.delivery_contact_person || '',
                                delivery_contact_phone: challan.delivery_contact_phone || ''
                            }}
                            companyInfo={(companyInfo || {}) as any}
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
                <div id="challan-submission-status" role="alert" className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    {submissionUnavailableReason}
                </div>
                <fieldset disabled aria-describedby="challan-submission-status">
                    <DocumentFooter
                        totalItems={challan.total_quantity || challan.items?.length || 0}
                        totalAmount={challan.total_amount}
                        subtotalAmount={challan.total_amount || 0}
                        taxAmount={0}
                        grandTotal={challan.total_amount || 0}
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
                        documentType: "Delivery Challan",
                        documentNumber: createdChallanData.challan_number,
                        documentData: createdChallanData as any,
                        onPrint: printChallan,
                        onThermalPrint: thermalPrintChallan,
                        onWhatsApp: shareOnWhatsApp,
                        phoneNumber: createdChallanData.customer_details?.phone || challan.customer_details?.phone
                    } as any}
                />
            )}
        </div>
    );
};

export default ChallanPreviewStep;
