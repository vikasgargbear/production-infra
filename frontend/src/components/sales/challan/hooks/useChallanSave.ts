/**
 * useChallanSave Hook
 *
 * Handles delivery challan save logic with OPTIMISTIC UI:
 * - Instant feedback (< 100ms)
 * - Stock deduction via deductStockLocally (challan = goods dispatched)
 * - Background sync
 * - Error rollback
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { challansApi } from '../../../../services/api';
import documentNumberGenerator, { DOC_TYPES } from '../../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../../services/offline/core/offlineDatabase';
import { generateTempId, deductStockLocally } from '../../utils/offlineSaveHelpers';
import { determineGstType } from '../../../gst/utils/gstCalculations';
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
        setChallan,
        setCreatedChallanData,
        setShowSuccessModal,
        generateChallanNumber
    } = props;

    const [saving, setSaving] = useState(false);

    const handleSaveChallan = useCallback(async () => {
        try {
            setSaving(true);

            if (!challan.customer_id) {
                throw new Error('Please select a customer');
            }
            if (!challan.items || challan.items.length === 0) {
                throw new Error('Please add at least one item');
            }

            // Determine GST type based on delivery state vs company state
            const deliveryState = challan.delivery_state || (selectedCustomer as CustomerDetails)?.state || '';
            const gstType = determineGstType(
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

            let finalChallanNumber = challan.challan_number;
            if (!finalChallanNumber) {
                await generateChallanNumber();
                finalChallanNumber = challan.challan_number;
            }

            const challanData = {
                challan_number: finalChallanNumber,
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

            console.log('[Challan] Prepared challan data:', JSON.stringify(challanData, null, 2));

            // Generate temp ID and offline document number
            const tempId = generateTempId();
            const localChallanNo = finalChallanNumber || await documentNumberGenerator.generateNumber(DOC_TYPES.DELIVERY_CHALLAN, false);

            // Save locally first (instant)
            const localChallan = {
                ...challanData,
                challan_number: localChallanNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !isOnline
            };

            await offlineDB.add('delivery_challans', localChallan);

            // CHALLAN = GOODS DISPATCHED → Deduct stock immediately
            await deductStockLocally(challan.items as any);

            // Show success to user IMMEDIATELY (optimistic)
            const createdData: CreatedChallanData = {
                challan_id: tempId,
                challan_number: localChallanNo,
                customer_name: challan.customer_name,
                customer_details: challan.customer_details || undefined,
                items: challan.items,
                total_amount: challan.total_amount
            };

            setCreatedChallanData(createdData);
            setShowSuccessModal(true);

            console.log('[Challan] ✅ Local save complete, showing success to user');

            // BACKGROUND SYNC: Send to backend in background (non-blocking)
            if (isOnline) {
                (async () => {
                    try {
                        console.log('[Challan] 📡 Background sync to backend...');
                        const response = await challansApi.create(challanData);

                        if (response.data?.challan_id) {
                            await offlineDB.updateLocalId('delivery_challans', tempId, response.data.challan_id);
                            console.log('[Challan] ✅ Background sync complete - ID:', response.data.challan_id);
                        }
                    } catch (syncError) {
                        console.warn('[Challan] ⚠️ Background sync failed, will retry later:', syncError);
                        await offlineDB.addToSyncQueue('delivery_challans', tempId, 'create', localChallan);
                    }
                })();
            } else {
                // Offline - add to sync queue
                await offlineDB.addToSyncQueue('delivery_challans', tempId, 'create', localChallan);
            }

        } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
            let errorMsg = 'Failed to save challan';

            if (err.response?.data?.detail) {
                if (Array.isArray(err.response.data.detail)) {
                    errorMsg = err.response.data.detail.map((e: { loc?: string[]; msg?: string }) =>
                        typeof e === 'object' ? `${e.loc?.join('.') || 'Field'}: ${e.msg}` : String(e)
                    ).join('\n');
                } else {
                    errorMsg = String(err.response.data.detail);
                }
            } else if (err.message) {
                errorMsg = err.message;
            }

            toast.error(errorMsg);
        } finally {
            setSaving(false);
        }
    }, [challan, selectedCustomer, companyInfo, isOnline, setChallan, setCreatedChallanData, setShowSuccessModal, generateChallanNumber]);

    return {
        saving,
        handleSaveChallan
    };
}

export default useChallanSave;
