"""
Simple test of tenant service - PROOF OF CONCEPT
This tests the core functionality without modifying existing APIs
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from uuid import UUID
from app.core.tenant_service import TenantQueryBuilder, TenantContext


def test_basic_query_injection():
    """Test that org_id filters are automatically injected"""
    
    print("🧪 Testing Tenant Service Query Injection")
    
    # Set tenant context
    test_org_id = UUID("12345678-1234-1234-1234-123456789012")
    TenantContext.set_context(test_org_id)
    
    # Test cases
    test_cases = [
        {
            "name": "Simple SELECT",
            "input": "SELECT * FROM customers",
            "expected_contains": "WHERE org_id = :_tenant_org_id"
        },
        {
            "name": "SELECT with existing WHERE",
            "input": "SELECT * FROM customers WHERE is_active = true",
            "expected_contains": "WHERE org_id = :_tenant_org_id AND is_active = true"
        },
        {
            "name": "SELECT with ORDER BY",
            "input": "SELECT * FROM customers ORDER BY customer_name",
            "expected_contains": "WHERE org_id = :_tenant_org_id ORDER BY"
        },
        {
            "name": "Already has org_id filter",
            "input": "SELECT * FROM customers WHERE org_id = :my_org_id",
            "expected_contains": "WHERE org_id = :my_org_id"  # Should not be modified
        },
        {
            "name": "Non-tenant table",
            "input": "SELECT * FROM organizations",
            "expected_contains": "SELECT * FROM organizations"  # Should not be modified
        }
    ]
    
    for test_case in test_cases:
        print(f"\n📝 Test: {test_case['name']}")
        print(f"   Input:  {test_case['input']}")
        
        try:
            modified_query, params = TenantQueryBuilder.build_safe_query(
                test_case['input'], {}
            )
            
            print(f"   Output: {modified_query}")
            print(f"   Params: {params}")
            
            if test_case['expected_contains'] in modified_query:
                print("   ✅ PASS")
            else:
                print(f"   ❌ FAIL - Expected to contain: {test_case['expected_contains']}")
        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
    
    # Clear context
    TenantContext.clear_context()
    print("\n🏁 Test completed")


if __name__ == "__main__":
    test_basic_query_injection()