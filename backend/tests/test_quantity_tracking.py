"""
Test the quantity tracking feature after migration
"""

import requests
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {"Content-Type": "application/json"}

def test_invoice_with_free_quantity():
    """Test creating invoice with free quantity"""
    
    invoice_data = {
        "customer_id": 36,  # Known existing customer
        "payment_terms": "cash",
        "delivery_priority": "normal",
        "items": [
            {
                "product_id": 47,  # Known existing product
                "quantity": 10,  # Total quantity (base + free)
                "base_quantity": 9,  # Billable quantity
                "free_quantity": 1,  # Free quantity
                "unit_price": 100.00,
                "line_total": 900.00,  # Should be base_quantity * unit_price
                "discount_percent": 0,
                "gst_percent": 12
            }
        ]
    }
    
    logger.info("Testing invoice with free quantity...")
    logger.info(f"Payload: {json.dumps(invoice_data, indent=2)}")
    
    response = requests.post(
        f"{BASE_URL}/invoices/",
        headers=HEADERS,
        json=invoice_data
    )
    
    logger.info(f"Response Status: {response.status_code}")
    logger.info(f"Response: {response.text}")
    
    if response.status_code == 200:
        data = response.json()
        logger.info("✅ Invoice created successfully with free quantity tracking!")
        logger.info(f"  Invoice ID: {data.get('invoice_id')}")
        logger.info(f"  Invoice Number: {data.get('invoice_number')}")
        return data
    else:
        logger.error("❌ Failed to create invoice with free quantity")
        return None

def test_inventory_deduction():
    """Verify that inventory is deducted by total quantity"""
    
    # This would require checking the inventory levels
    # Can be implemented once we have inventory query endpoints
    logger.info("Inventory deduction test - requires inventory query endpoint")
    pass

def test_revenue_calculation():
    """Verify that revenue is calculated on base quantity only"""
    
    invoice_data = {
        "customer_id": 36,
        "payment_terms": "cash",
        "delivery_priority": "normal",
        "items": [
            {
                "product_id": 47,
                "quantity": 10,  # Total
                "base_quantity": 8,  # Billable
                "free_quantity": 2,  # Free
                "unit_price": 100.00,
                "line_total": 800.00,  # Should be 8 * 100, not 10 * 100
                "discount_percent": 10,
                "gst_percent": 12
            }
        ]
    }
    
    logger.info("Testing revenue calculation with free items...")
    
    response = requests.post(
        f"{BASE_URL}/invoices/",
        headers=HEADERS,
        json=invoice_data
    )
    
    if response.status_code == 200:
        data = response.json()
        # Total should be calculated on base quantity only
        # Base: 8 * 100 = 800
        # Discount: 800 * 10% = 80
        # Taxable: 800 - 80 = 720
        # Tax: 720 * 12% = 86.4
        # Total: 720 + 86.4 = 806.4
        expected_total = 806.4
        actual_total = data.get('total_amount', 0)
        
        if abs(actual_total - expected_total) < 0.01:
            logger.info(f"✅ Revenue calculated correctly on base quantity: {actual_total}")
        else:
            logger.error(f"❌ Revenue calculation error. Expected: {expected_total}, Got: {actual_total}")
    else:
        logger.error(f"❌ Failed to test revenue calculation: {response.text}")

def test_reporting_queries():
    """Test that we can query free items given"""
    
    # This would require reporting endpoints
    # Placeholder for future implementation
    
    sample_queries = """
    -- Total free items by product
    SELECT 
        product_name,
        SUM(free_quantity) as total_free,
        SUM(free_quantity * unit_price) as free_value
    FROM sales.invoice_items
    WHERE free_quantity > 0
    GROUP BY product_name;
    
    -- Customer-wise free analysis
    SELECT 
        c.customer_name,
        SUM(ii.free_quantity) as total_free_qty,
        SUM(ii.free_quantity * ii.unit_price) as total_free_value
    FROM sales.invoices i
    JOIN sales.invoice_items ii ON i.invoice_id = ii.invoice_id
    JOIN sales.customers c ON i.customer_id = c.customer_id
    WHERE ii.free_quantity > 0
    GROUP BY c.customer_name;
    """
    
    logger.info("Sample reporting queries for free quantity analysis:")
    logger.info(sample_queries)

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("TESTING QUANTITY TRACKING FEATURE")
    logger.info("=" * 60)
    
    # Test 1: Create invoice with free quantity
    invoice = test_invoice_with_free_quantity()
    
    # Test 2: Verify revenue calculation
    test_revenue_calculation()
    
    # Test 3: Show reporting queries
    test_reporting_queries()
    
    logger.info("=" * 60)
    logger.info("Testing complete!")
    logger.info("Note: Backend needs to run the migration first")
    logger.info("Run: python migrations/002_add_quantity_tracking.py")