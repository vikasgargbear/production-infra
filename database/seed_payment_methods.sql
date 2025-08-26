-- Seed Payment Methods for all organizations
-- This script populates the financial.payment_methods table with standard payment options

-- Insert payment methods for each organization
INSERT INTO financial.payment_methods 
(org_id, method_code, method_name, method_type, requires_reference, requires_approval, processing_days, transaction_charge_percent, transaction_charge_fixed, is_active)
SELECT 
    o.org_id,
    pm.method_code,
    pm.method_name,
    pm.method_type,
    pm.requires_reference,
    pm.requires_approval,
    pm.processing_days,
    pm.transaction_charge_percent,
    pm.transaction_charge_fixed,
    true as is_active
FROM master.organizations o
CROSS JOIN (
    VALUES 
        ('CASH', 'Cash', 'instant', false, false, 0, 0.00, 0.00),
        ('UPI', 'UPI Payment', 'digital', true, false, 0, 0.00, 0.00),
        ('BANK', 'Bank Transfer', 'bank', true, false, 1, 0.00, 0.00),
        ('CHECK', 'Cheque', 'bank', true, true, 3, 0.00, 0.00),
        ('CARD', 'Credit/Debit Card', 'digital', true, false, 0, 2.00, 0.00),
        ('CREDIT', 'Credit Sale', 'credit', false, false, 0, 0.00, 0.00)
) AS pm(method_code, method_name, method_type, requires_reference, requires_approval, processing_days, transaction_charge_percent, transaction_charge_fixed)
ON CONFLICT (org_id, method_code) DO UPDATE SET
    method_name = EXCLUDED.method_name,
    method_type = EXCLUDED.method_type,
    requires_reference = EXCLUDED.requires_reference,
    requires_approval = EXCLUDED.requires_approval,
    processing_days = EXCLUDED.processing_days,
    is_active = true,
    updated_at = CURRENT_TIMESTAMP;

-- Show what was inserted
SELECT 
    pm.payment_method_id,
    o.org_name,
    pm.method_code,
    pm.method_name,
    pm.method_type,
    pm.requires_reference,
    pm.processing_days
FROM financial.payment_methods pm
JOIN master.organizations o ON pm.org_id = o.org_id
ORDER BY o.org_name, pm.payment_method_id;