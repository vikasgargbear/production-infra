/**
 * Contexts Barrel Export
 * All React contexts for global state management
 */

// Auth - Global authentication state
export { AuthProvider, useAuth } from './AuthContext';

// Company - Company profile and settings
export { CompanyProvider, useCompany } from './CompanyContext';

// EscapeKey - ESC key handling stack
export { EscapeKeyProvider, useEscapeKey, useEscapeHandler } from './EscapeKeyContext';

// Payment - Payment entry state
export { PaymentProvider, usePayment } from './PaymentContext';

// NOTE: PurchaseContext has been removed - use usePurchaseTransaction hook instead
// import { usePurchaseTransaction } from '@/components/purchase/hooks';

