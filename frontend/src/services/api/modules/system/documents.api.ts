/**
 * Documents API Module
 * Handles generic document operations like number reservation
 */
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';

export const documentsApi = {
    /**
     * Reserve the next server-backed document number for a supported type.
     * @param type Document type code (INV, PO, DC, etc.)
     */
    reserveNumber: (type: string) => {
        void type;
        return rejectCanonicalWrite('Legacy document-number reservation');
    }
};
