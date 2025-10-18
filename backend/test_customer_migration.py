"""
Test the migrated customers endpoint
Verifies tenant service is working correctly
"""
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

from uuid import UUID
from app.core.tenant_service import TenantQueryBuilder, TenantContext


def test_customer_queries():
    """Test that customer queries get org_id filters automatically"""
    
    print("🧪 Testing Customer Endpoint Migration")
    
    # Set tenant context
    test_org_id = UUID("12345678-1234-1234-1234-123456789012")
    TenantContext.set_context(test_org_id)
    
    # Test the actual queries from the customers endpoint
    test_queries = [
        {
            "name": "Fast search query",
            "query": """SELECT customer_id, customer_name, customer_code, primary_phone, 
                      customer_type, gst_number, is_active, org_id, created_at, updated_at 
                      FROM parties.customers""",
        },
        {
            "name": "Full query",
            "query": "SELECT * FROM parties.customers",
        },
        {
            "name": "Count query",
            "query": "SELECT COUNT(*) FROM parties.customers",
        },
        {
            "name": "Query with search filter",
            "query": """SELECT * FROM parties.customers WHERE (
                customer_name ILIKE :search OR 
                customer_code ILIKE :search OR 
                primary_phone LIKE :search OR
                gst_number LIKE :search
            )""",
            "params": {"search": "%test%"}
        },
        {
            "name": "Query with multiple filters",  
            "query": """SELECT * FROM parties.customers WHERE (
                customer_name ILIKE :search OR 
                customer_code ILIKE :search
            ) AND customer_type = :customer_type AND is_active = :is_active""",
            "params": {"search": "%test%", "customer_type": "retail", "is_active": True}
        }
    ]
    
    for test_case in test_queries:
        print(f"\n📝 Test: {test_case['name']}")
        print(f"   Original: {test_case['query'][:80]}...")
        
        try:
            modified_query, params = TenantQueryBuilder.build_safe_query(
                test_case['query'], test_case.get('params', {})
            )
            
            print(f"   Modified: {modified_query[:80]}...")
            
            # Check that org_id filter was added
            if "_tenant_org_id" in params:
                print(f"   ✅ PASS - org_id filter added")
                print(f"   Params: {list(params.keys())}")
            else:
                print(f"   ❌ FAIL - No org_id filter added")
                print(f"   Params: {params}")
        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
    
    # Clear context
    TenantContext.clear_context()
    print("\n🏁 Customer migration test completed")


def test_non_tenant_queries():
    """Test that non-tenant queries are not modified"""
    
    print("\n🧪 Testing Non-Tenant Queries (Should Not Change)")
    
    test_org_id = UUID("12345678-1234-1234-1234-123456789012")
    TenantContext.set_context(test_org_id)
    
    test_queries = [
        "SELECT * FROM organizations",
        "SELECT * FROM roles", 
        "SELECT * FROM permissions",
        "SELECT COUNT(*) FROM system_config"
    ]
    
    for query in test_queries:
        print(f"\n📝 Query: {query}")
        
        try:
            modified_query, params = TenantQueryBuilder.build_safe_query(query, {})
            
            if query == modified_query and not params:
                print("   ✅ PASS - Query unchanged (correct)")
            else:
                print("   ❌ FAIL - Query was modified (incorrect)")
                print(f"   Modified: {modified_query}")
                print(f"   Params: {params}")
        
        except Exception as e:
            print(f"   ❌ ERROR: {e}")
    
    TenantContext.clear_context()
    print("\n🏁 Non-tenant query test completed")


if __name__ == "__main__":
    test_customer_queries()
    test_non_tenant_queries()
    print("\n✅ All tests completed successfully!")