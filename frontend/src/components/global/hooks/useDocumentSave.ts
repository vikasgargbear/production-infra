/**
 * useDocumentSave — Shared offline-first document save hook
 *
 * Orchestrates: validate → local save → stock op → success UI → background sync
 * Each document hook becomes a thin wrapper providing config.
 */

import { useState, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import documentNumberGenerator from '../../../services/offline/documents/documentNumberGenerator';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import { generateTempId } from '../../sales/utils/offlineSaveHelpers';

export interface UseDocumentSaveConfig {
    docTypeKey: string;              // DOC_TYPES.INVOICE etc
    idbStoreName: string;            // 'invoices', 'sales_orders' etc
    entityType: string;              // sync queue entity type
    serverIdField: string;           // field name in API response that contains the server ID
    docNumberField: string;          // 'invoice_number', 'order_number' etc

    apiCall: (data: any) => Promise<any>;
    validate: () => string | null;   // return error message or null
    preparePayload: () => any;       // transform doc state → API payload
    getDocNumber?: () => Promise<string>;  // override for custom number logic

    stockOperation?: () => Promise<void>;  // caller handles deduct/add
    onSuccess: (tempId: string, docNo: string) => void;  // called after local save + stock op
    onSaveComplete?: () => void;
    onServerSuccess?: (response: any, tempId: string, docNo: string, payload: any) => void | Promise<void>;
    onSyncQueued?: (tempId: string, docNo: string, payload: any, reason: 'offline' | 'sync_failed') => void | Promise<void>;
    isOnline: boolean;

    // Invoice-specific
    fallbackToOffline?: boolean;
    handleConflict?: (error: any) => void;
}

export interface UseDocumentSaveReturn {
    saving: boolean;
    handleSave: () => Promise<void>;
}

export function useDocumentSave(config: UseDocumentSaveConfig): UseDocumentSaveReturn {
    const [saving, setSaving] = useState(false);
    const configRef = useRef(config);
    configRef.current = config;

    const handleSave = useCallback(async () => {
        const cfg = configRef.current;

        // 1. Validate
        const validationError = cfg.validate();
        if (validationError) {
            toast.error(validationError);
            return;
        }

        setSaving(true);
        try {
            // 2. Prepare payload
            const payload = cfg.preparePayload();

            // 3. Generate IDs
            const tempId = generateTempId();
            const docNo = cfg.getDocNumber
                ? await cfg.getDocNumber()
                : await documentNumberGenerator.generateNumber(cfg.docTypeKey as any, false);

            // 4. Build local document
            const localDoc = {
                ...payload,
                [cfg.docNumberField]: docNo,
                temp_id: tempId,
                _localId: tempId,
                sync_status: 'pending',
                created_at: new Date().toISOString(),
                created_offline: !cfg.isOnline,
            };

            // 5. Save to IDB
            await offlineDB.add(cfg.idbStoreName, localDoc);

            // 6. Stock operation (if applicable)
            if (cfg.stockOperation) {
                await cfg.stockOperation();
            }

            // 7. Success callback
            cfg.onSuccess(tempId, docNo);

            // 8. Background sync
            if (cfg.isOnline) {
                (async () => {
                    try {
                        const response = await cfg.apiCall({ ...payload, [cfg.docNumberField]: docNo });
                        const serverId = response?.data?.[cfg.serverIdField];
                        if (serverId) {
                            await offlineDB.updateLocalId(cfg.idbStoreName, tempId, serverId);
                        }
                        await cfg.onServerSuccess?.(response, tempId, docNo, payload);
                    } catch (syncError: any) {
                        // Invoice-specific: handle conflict
                        if (cfg.handleConflict && syncError.response?.status === 409) {
                            cfg.handleConflict(syncError);
                            return;
                        }

                        // Invoice-specific: fallback to offline on server errors
                        if (cfg.fallbackToOffline && (
                            syncError.response?.status >= 500 ||
                            syncError.code === 'ERR_NETWORK' ||
                            syncError.code === 'ECONNABORTED'
                        )) {
                            console.warn(`[DocumentSave] Server error, saved offline: ${cfg.entityType}`);
                        }

                        await offlineDB.addToSyncQueue(cfg.entityType, tempId, 'create', localDoc);
                        await cfg.onSyncQueued?.(tempId, docNo, payload, 'sync_failed');
                    }
                })();
            } else {
                await offlineDB.addToSyncQueue(cfg.entityType, tempId, 'create', localDoc);
                await cfg.onSyncQueued?.(tempId, docNo, payload, 'offline');
            }

            cfg.onSaveComplete?.();

        } catch (error: any) {
            const detail = error.response?.data?.detail;
            let errorMessage: string;

            if (detail) {
                if (Array.isArray(detail)) {
                    errorMessage = detail.map((e: { loc?: string[]; msg: string }) =>
                        `${e.loc?.join('.') || 'Field'}: ${e.msg}`
                    ).join('\n');
                } else if (typeof detail === 'string') {
                    errorMessage = detail;
                } else {
                    errorMessage = detail.message || JSON.stringify(detail);
                }
            } else {
                errorMessage = error.message || 'Save failed';
            }

            toast.error(errorMessage);
        } finally {
            setSaving(false);
        }
    }, []);

    return { saving, handleSave };
}

export default useDocumentSave;
