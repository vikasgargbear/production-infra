/**
 * useChallanSave Hook
 *
 * Thin wrapper around useDocumentSave for delivery challans.
 * Stock DEDUCTION (goods dispatched to customer).
 */

import { useDocumentSave } from '../../../global/hooks/useDocumentSave';
import { challansApi } from '../../../../services/api';
import { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import { deductStockLocally } from '../../utils/offlineSaveHelpers';
import { determineGstTypeForSupply } from '../../../gst/utils/gstCalculations';
import type { Challan, ChallanItem, CreatedChallanData, CustomerDetails } from '../types/challanTypes';

export interface UseChallanSaveProps {
    challan: Challan;
    selectedCustomer: CustomerDetails | null;
    companyInfo: any;
    isOnline: boolean;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    setCreatedChallanData: React.Dispatch<React.SetStateAction<CreatedChallanData | null>>;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    generateChallanNumber: () => Promise<void>;
}

export interface UseChallanSaveReturn {
    saving: boolean;
    handleSaveChallan: () => Promise<void>;
}

export function useChallanSave(props: UseChallanSaveProps): UseChallanSaveReturn {
    const {
        challan,
        selectedCustomer,
        companyInfo,
        isOnline,
        setCreatedChallanData,
        setShowSuccessModal,
        generateChallanNumber
    } = props;

    const buildPayload = () => {
        const deliveryState = challan.delivery_state || (selectedCustomer as CustomerDetails)?.state || '';
        const gstType = determineGstTypeForSupply(
            companyInfo?.state,
            deliveryState,
            companyInfo?.gst_number,
            (selectedCustomer as any)?.gst_number
        );
        const isIGST = gstType === 'IGST';

        const apiItems = challan.items.map((item: ChallanItem) => ({
            product_id: item.product_id,
            product_name: item.product_name,
            batch_id: item.batch_id || null,
            batch_number: item.batch_number || null,
            expiry_date: item.expiry_date || null,
            ordered_quantity: null,
            dispatched_quantity: item.quantity,
            unit_price: item.unit_price || item.sale_price || 0,
            gst_percent: item.gst_percent || 0,
            cgst_percent: isIGST ? 0 : (item.gst_percent || 0) / 2,
            sgst_percent: isIGST ? 0 : (item.gst_percent || 0) / 2,
            igst_percent: isIGST ? (item.gst_percent || 0) : 0,
            uom: item.unit || item.base_uom || 'NOS',
            package_type: 'UNIT'
        }));

        const totalAmount = apiItems.reduce((sum, item) =>
            sum + ((item.dispatched_quantity || 0) * (item.unit_price || 0)), 0
        ) + (parseFloat(String(challan.freight_charges)) || 0);

        return {
            challan_number: challan.challan_number,
            challan_date: challan.challan_date,
            expected_delivery_date: challan.expected_delivery_date || challan.challan_date,
            customer_id: challan.customer_id,
            customer_name: challan.customer_name,
            delivery_address: challan.delivery_address || (selectedCustomer as CustomerDetails)?.address || 'N/A',
            delivery_city: challan.delivery_city || (selectedCustomer as CustomerDetails)?.city || 'Mumbai',
            delivery_state: challan.delivery_state || (selectedCustomer as CustomerDetails)?.state || 'Maharashtra',
            delivery_pincode: challan.delivery_pincode || (selectedCustomer as CustomerDetails)?.pincode || '400001',
            items: apiItems,
            transport_company: challan.transport_company || '',
            vehicle_number: challan.vehicle_number || '',
            driver_phone: challan.driver_phone || '',
            freight_charges: parseFloat(String(challan.freight_charges)) || 0,
            lr_number: challan.lr_number || '',
            notes: challan.notes || '',
            total_amount: totalAmount
        };
    };

    const { saving, handleSave } = useDocumentSave({
        docTypeKey: DOC_TYPES.DELIVERY_CHALLAN,
        idbStoreName: 'delivery_challans',
        entityType: 'delivery_challans',
        serverIdField: 'challan_id',
        docNumberField: 'challan_number',
        isOnline,

        validate: () => {
            if (!challan.customer_id) return 'Please select a customer';
            if (!challan.items || challan.items.length === 0) return 'Please add at least one item';
            return null;
        },

        preparePayload: buildPayload,

        getDocNumber: async () => {
            let number = challan.challan_number;
            if (!number) {
                await generateChallanNumber();
                number = challan.challan_number;
            }
            if (!number) {
                const { default: docNumGen } = await import('../../../../services/offline/documents/documentNumberGenerator');
                number = await docNumGen.generateNumber(DOC_TYPES.DELIVERY_CHALLAN, false);
            }
            return number;
        },

        apiCall: (data: any) => challansApi.create(data),

        stockOperation: async () => {
            await deductStockLocally(challan.items as any);
        },

        onSuccess: (tempId: string, docNo: string) => {
            const createdData: CreatedChallanData = {
                challan_id: tempId,
                challan_number: docNo,
                customer_name: challan.customer_name,
                customer_details: challan.customer_details || undefined,
                items: challan.items,
                total_amount: challan.total_amount
            };
            setCreatedChallanData(createdData);
            setShowSuccessModal(true);
        },
    });

    return { saving, handleSaveChallan: handleSave };
}

export default useChallanSave;
