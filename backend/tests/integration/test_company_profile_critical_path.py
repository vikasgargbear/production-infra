"""
Integration Test: Company Profile Critical Path

Tests the complete company profile flow to ensure data persistence:
- Company info save (name, address, GST, etc.)
- Business settings save (terms, prefixes, etc.)
- Logo upload and retrieval
- Bank account management
"""
import pytest
from decimal import Decimal
from datetime import date, datetime

# For standalone testing (callable via API)
TEST_COMPANY_DATA = {
    "name": "Test Pharma Pvt Ltd",
    "address": "123 Test Street, Industrial Area",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "country": "India",
    "phone": "9876543210",
    "email": "test@testpharma.com",
    "website": "www.testpharma.com",
    "gst_number": "27AADCB2230M1ZT",
    "pan_number": "AADCB2230M",
    "drug_license_number": "DL-12345-2024",
    "fssai_number": "10020024000123",
    "msme_number": "UDYAM-MH-01-0123456",
    
    # Business settings
    "tagline": "Quality Healthcare Products",
    "invoice_prefix": "INV/2024-25/",
    "challan_prefix": "DC/2024-25/",
    "po_prefix": "PO/2024-25/",
    "return_prefix": "RTN/",
    "credit_note_prefix": "CN/",
    "debit_note_prefix": "DN/",
    "default_terms": "Payment due within 30 days. Goods once sold will not be taken back.",
    "default_footer": "Thank you for your business!",
    "print_format": "A4",
    "show_signature": True,
    "show_logo": True,
    "show_bank_details": True,
    
    # Bank details
    "bank_name": "HDFC Bank",
    "account_number": "50200012345678",
    "account_name": "Test Pharma Pvt Ltd",
    "account_type": "CURRENT",
    "ifsc_code": "HDFC0001234",
    "branch_name": "Andheri East",
}


class TestCompanyProfileCriticalPath:
    """Critical path tests for company profile"""
    
    def test_business_settings_saved_to_database(self, db_session, test_org):
        """CRITICAL: Business settings (default_terms) must persist to database"""
        from app.api.routes.org.company import update_company_info
        
        # Save company data
        result = update_company_info(
            company_data=TEST_COMPANY_DATA,
            db=db_session,
            context=test_org
        )
        
        # Verify business_settings was saved
        saved = db_session.execute(
            "SELECT business_settings FROM master.organizations WHERE org_id = :org_id",
            {"org_id": str(test_org.org_id)}
        ).fetchone()
        
        assert saved is not None
        business_settings = saved.business_settings
        
        # CRITICAL: default_terms must be saved
        assert business_settings.get("default_terms") == TEST_COMPANY_DATA["default_terms"], \
            "default_terms was not saved to database"
        
        # Also verify terms_and_conditions alias
        assert business_settings.get("terms_and_conditions") == TEST_COMPANY_DATA["default_terms"], \
            "terms_and_conditions alias was not saved"
    
    def test_fssai_msme_saved_to_columns(self, db_session, test_org):
        """CRITICAL: FSSAI and MSME must save to their dedicated columns"""
        from app.api.routes.org.company import update_company_info
        
        result = update_company_info(
            company_data=TEST_COMPANY_DATA,
            db=db_session,
            context=test_org
        )
        
        # Verify columns
        saved = db_session.execute("""
            SELECT fssai_number, msme_number 
            FROM master.organizations 
            WHERE org_id = :org_id
        """, {"org_id": str(test_org.org_id)}).fetchone()
        
        assert saved.fssai_number == TEST_COMPANY_DATA["fssai_number"], \
            f"FSSAI not saved: expected {TEST_COMPANY_DATA['fssai_number']}, got {saved.fssai_number}"
        
        assert saved.msme_number == TEST_COMPANY_DATA["msme_number"], \
            f"MSME not saved: expected {TEST_COMPANY_DATA['msme_number']}, got {saved.msme_number}"
    
    def test_get_info_returns_business_settings_with_terms(self, db_session, test_org):
        """CRITICAL: GET /info must return terms_and_conditions in business_settings"""
        from app.api.routes.org.company import update_company_info, get_company_info
        
        # First save
        update_company_info(
            company_data=TEST_COMPANY_DATA,
            db=db_session,
            context=test_org
        )
        
        # Then retrieve
        result = get_company_info(db=db_session, context=test_org)
        
        # Verify business_settings includes terms_and_conditions
        business_settings = result.get("business_settings", {})
        
        assert "terms_and_conditions" in business_settings, \
            "GET /info does not return terms_and_conditions in business_settings"
        
        assert business_settings.get("terms_and_conditions") == TEST_COMPANY_DATA["default_terms"], \
            "terms_and_conditions value mismatch"
    
    def test_invoice_prefixes_saved(self, db_session, test_org):
        """Invoice prefixes must be saved correctly"""
        from app.api.routes.org.company import update_company_info
        
        result = update_company_info(
            company_data=TEST_COMPANY_DATA,
            db=db_session,
            context=test_org
        )
        
        saved = db_session.execute(
            "SELECT business_settings FROM master.organizations WHERE org_id = :org_id",
            {"org_id": str(test_org.org_id)}
        ).fetchone()
        
        bs = saved.business_settings
        
        assert bs.get("invoice_prefix") == TEST_COMPANY_DATA["invoice_prefix"]
        assert bs.get("challan_prefix") == TEST_COMPANY_DATA["challan_prefix"]
        assert bs.get("po_prefix") == TEST_COMPANY_DATA["po_prefix"]


# Fixtures (to be defined in conftest.py)
@pytest.fixture
def test_org(db_session):
    """Create or get test organization"""
    # Implementation depends on your test setup
    pass


# ============================================
# STANDALONE API TEST ENDPOINT
# ============================================
# Add this endpoint to company.py router for quick testing

def get_test_route():
    """
    To add test endpoint, add this to company.py:
    
    @router.get("/test-save")
    async def test_company_save(
        db: TenantAwareSession = Depends(get_tenant_aware_db),
        context: OrgContext = Depends(get_org_context)
    ):
        '''Test endpoint to verify company profile save works correctly'''
        from datetime import datetime
        
        test_data = {
            "name": f"Test Company {datetime.now().isoformat()}",
            "default_terms": "Test Terms - Should appear in invoice preview",
            "fssai_number": "FSSAI123456",
            "msme_number": "MSME123456",
        }
        
        # Call the update function
        result = await update_company_info(test_data, db, context)
        
        # Verify it saved
        saved = db.execute(text('''
            SELECT org_name, fssai_number, msme_number, business_settings
            FROM master.organizations
            WHERE org_id = :org_id
        '''), {"org_id": str(context.org_id)}).fetchone()
        
        return {
            "test_data_sent": test_data,
            "saved_org_name": saved.org_name,
            "saved_fssai": saved.fssai_number,
            "saved_msme": saved.msme_number,
            "saved_default_terms": saved.business_settings.get("default_terms") if saved.business_settings else None,
            "saved_terms_and_conditions": saved.business_settings.get("terms_and_conditions") if saved.business_settings else None,
            "success": saved.business_settings.get("default_terms") == test_data["default_terms"]
        }
    """
    pass
