#!/usr/bin/env python3
"""
Migration script to replace insecure get_org_id_from_header with secure JWT-based auth
"""
import os
import re
from pathlib import Path

# Files to update (excluding already updated ones and tenant-service-based ones)
FILES_TO_UPDATE = [
    "app/api/routes/sales.py",
    "app/api/routes/inventory.py",
    "app/api/routes/payments.py",
    "app/api/routes/billing.py",
    "app/api/routes/suppliers.py",
    "app/api/routes/invoices.py",
    "app/api/routes/orders.py",
    "app/api/routes/grn.py",
    "app/api/routes/stock_adjustments.py",
    "app/api/routes/bank_accounts.py",
    "app/api/routes/employees.py",
    "app/api/routes/departments.py",
    "app/api/routes/branches.py",
    "app/api/routes/company.py",
    "app/api/routes/settings.py",
    "app/api/routes/gst.py",
    "app/api/routes/inventory_batches.py",
    "app/api/routes/stock_receive.py",
    "app/api/routes/stock_movements.py",
    "app/api/routes/delivery_challan.py",
    "app/api/routes/enterprise_delivery_challan.py",
    "app/api/routes/tax_entries.py",
    "app/api/routes/journal_entries.py",
    "app/api/routes/expense_claims.py",
    "app/api/routes/credit_debit_notes.py",
    "app/api/routes/party_ledger_v2.py",
    "app/api/routes/payment_allocation.py",
    "app/api/routes/customer_outstanding.py",
    "app/api/routes/collection_center.py",
    "app/api/routes/purchase_enhanced.py",
    "app/api/routes/purchase_returns_enhanced.py",
    "app/api/routes/supplier_invoices.py",
    "app/api/routes/sale_returns.py",
    "app/api/routes/master_settings.py",
    "app/api/routes/schemes_discounts.py",
    "app/api/routes/loyalty_points.py",
    "app/api/routes/compliance.py",
    "app/api/routes/metadata.py",
    "app/api/routes/master_data_crud.py",
    "app/api/routes/enterprise_api_complete.py",
    "app/api/routes/invoice_calculation.py",
    "app/api/routes/enterprise_calculations.py",
    "app/api/routes/quick_sale.py",
    "app/api/routes/api_wrapper.py",
    "app/api/routes/stock_dashboard.py",
    "app/api/routes/organization_settings.py",
    "app/api/routes/users.py",
    "app/api/routes/org_users.py",
    "app/api/routes/order_items.py",
    "app/api/routes/create_user.py",
    "app/api/routes/purchase_upload.py"
]

# Import pattern to replace
OLD_IMPORT_PATTERN = r'from \.\.\.core\.auth_utils import get_org_id_from_header'
NEW_IMPORT = 'from ...core.secure_auth import get_org_id_string  # SECURE: JWT-based auth'

# Dependency pattern to replace
OLD_DEPENDS_PATTERN = r'org_id:\s*str\s*=\s*Depends\(get_org_id_from_header\)'
NEW_DEPENDS = 'org_id: str = Depends(get_org_id_string)'

def update_file(file_path: Path):
    """Update a single file"""
    if not file_path.exists():
        print(f"⚠️  File not found: {file_path}")
        return False
    
    try:
        content = file_path.read_text()
        original_content = content
        
        # Replace import statement
        content = re.sub(OLD_IMPORT_PATTERN, NEW_IMPORT, content)
        
        # Replace all dependency declarations
        content = re.sub(OLD_DEPENDS_PATTERN, NEW_DEPENDS, content)
        
        if content != original_content:
            file_path.write_text(content)
            print(f"✅ Updated: {file_path}")
            return True
        else:
            print(f"⏭️  No changes needed: {file_path}")
            return False
            
    except Exception as e:
        print(f"❌ Error updating {file_path}: {e}")
        return False

def main():
    """Run the migration"""
    script_dir = Path(__file__).parent
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    print("=" * 60)
    print("🔐 Starting Security Migration")
    print("=" * 60)
    print(f"Replacing: get_org_id_from_header")
    print(f"With: get_org_id_string (JWT-based)")
    print("=" * 60)
    print()
    
    for file_rel_path in FILES_TO_UPDATE:
        file_path = script_dir / file_rel_path
        result = update_file(file_path)
        if result:
            updated_count += 1
        elif result is False:
            skipped_count += 1
        else:
            error_count += 1
    
    print()
    print("=" * 60)
    print("📊 Migration Summary")
    print("=" * 60)
    print(f"✅ Updated: {updated_count} files")
    print(f"⏭️  Skipped: {skipped_count} files")
    print(f"❌ Errors: {error_count} files")
    print("=" * 60)
    print()
    
    if updated_count > 0:
        print("🎉 Migration completed successfully!")
        print()
        print("Next steps:")
        print("1. Test critical endpoints with JWT tokens")
        print("2. Remove X-Org-Id header fallback from get_org_id_secure()")
        print("3. Update frontend to always send Bearer tokens")
        print("4. Deploy to production")
    else:
        print("ℹ️  No files needed updating")

if __name__ == "__main__":
    main()
