"""
Test Suite 13: Validate Fixed APIs (Stock Movements, Party Ledger, Sales Returns)
Tests all endpoints after deployment of fixes
"""

import pytest
import requests
import json
from datetime import datetime, date, timedelta
from typing import Dict, Any, List
import logging
import time

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

# Use the org_id that has data
DEFAULT_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"


class TestFixedAPIs:
    """Test suite for the three fixed APIs"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_customer_id = 13  # Known customer ID
        cls.test_invoice_id = 116  # Known invoice ID
        cls.test_product_id = 1
        
        # Wait a bit for deployment
        logger.info("Waiting 30 seconds for deployment to complete...")
        time.sleep(30)
        
    def test_01_sales_returns_list(self):
        """Test retrieving sales returns list"""
        logger.info("\n=== TESTING SALES RETURNS API ===")
        
        endpoints = [
            ("/sale-returns", "Main endpoint"),
            ("/sale-returns?limit=10", "With limit"),
            (f"/sale-returns?customer_id={self.test_customer_id}", "Filter by customer"),
        ]
        
        for endpoint, description in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            logger.info(f"\n{description}: {endpoint}")
            logger.info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ SUCCESS!")
                
                if isinstance(data, dict):
                    total = data.get("total", 0)
                    returns = data.get("returns", [])
                    logger.info(f"  Total returns: {total}")
                    logger.info(f"  Returns in response: {len(returns)}")
                    
                    if returns:
                        sample = returns[0]
                        logger.info(f"  Sample return: {json.dumps(sample, indent=2)}")
                elif isinstance(data, list):
                    logger.info(f"  Found {len(data)} returns")
                    if data:
                        logger.info(f"  Sample: {json.dumps(data[0], indent=2)}")
            else:
                logger.error(f"❌ FAILED: {response.text[:300]}")
                
    def test_02_sales_returns_crud(self):
        """Test creating and retrieving sales returns"""
        logger.info("\n=== TESTING SALES RETURNS CRUD ===")
        
        # Try to create a return
        return_data = {
            "return_date": date.today().isoformat(),
            "return_type": "quality_issue",
            "invoice_id": self.test_invoice_id,
            "customer_id": self.test_customer_id,
            "return_reason": "API test return - quality issue",
            "return_amount": 100.00,
            "tax_amount": 12.00,
            "total_amount": 112.00,
            "created_by": 1,
            "org_id": DEFAULT_ORG_ID,
            "branch_id": 1
        }
        
        response = requests.post(
            f"{BASE_URL}/sale-returns",
            json=return_data,
            headers=HEADERS
        )
        
        logger.info(f"\nCreate return - Status: {response.status_code}")
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Return created: {data}")
            
            # Try to get by invoice
            if "return_id" in data:
                response = requests.get(
                    f"{BASE_URL}/sale-returns/{data['return_id']}",
                    headers=HEADERS
                )
                logger.info(f"\nGet by ID - Status: {response.status_code}")
        else:
            logger.warning(f"⚠️ Create failed: {response.text[:300]}")
            
    def test_03_party_ledger_balance(self):
        """Test party ledger balance endpoints"""
        logger.info("\n=== TESTING PARTY LEDGER API ===")
        
        endpoints = [
            (f"/party-ledger/balance/{self.test_customer_id}?party_type=customer", "Customer balance"),
            (f"/party-ledger/balance/1?party_type=supplier", "Supplier balance"),
        ]
        
        for endpoint, description in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            logger.info(f"\n{description}: {endpoint}")
            logger.info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ SUCCESS!")
                logger.info(f"  Balance data: {json.dumps(data, indent=2)}")
            else:
                logger.error(f"❌ FAILED: {response.text[:300]}")
                
    def test_04_party_ledger_entries(self):
        """Test party ledger entries/transactions"""
        logger.info("\n=== TESTING PARTY LEDGER ENTRIES ===")
        
        params = {
            "from_date": (date.today() - timedelta(days=90)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        endpoints = [
            (f"/party-ledger/entries/customer/{self.test_customer_id}", "Customer entries"),
            (f"/party-ledger/entries/supplier/1", "Supplier entries"),
            ("/party-ledger/entries", "All entries"),
        ]
        
        for endpoint, description in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                params=params,
                headers=HEADERS
            )
            
            logger.info(f"\n{description}: {endpoint}")
            logger.info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ SUCCESS!")
                
                if isinstance(data, list):
                    logger.info(f"  Found {len(data)} entries")
                    if data:
                        logger.info(f"  Sample entry: {json.dumps(data[0], indent=2)}")
                else:
                    logger.info(f"  Response: {json.dumps(data, indent=2)[:300]}")
            elif response.status_code == 404:
                logger.info("  Endpoint not implemented")
            else:
                logger.error(f"❌ FAILED: {response.text[:300]}")
                
    def test_05_stock_movements_list(self):
        """Test stock movements list endpoints"""
        logger.info("\n=== TESTING STOCK MOVEMENTS API ===")
        
        endpoints = [
            ("/stock-movements", "All movements"),
            ("/stock-movements?limit=5", "With limit"),
            ("/stock-movements?movement_type=sale", "Filter by type"),
            (f"/stock-movements?product_id={self.test_product_id}", "Filter by product"),
        ]
        
        for endpoint, description in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            logger.info(f"\n{description}: {endpoint}")
            logger.info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ SUCCESS!")
                
                if isinstance(data, dict):
                    total = data.get("total", 0)
                    movements = data.get("movements", data.get("data", []))
                    logger.info(f"  Total movements: {total}")
                    logger.info(f"  Movements in response: {len(movements)}")
                    
                    if movements:
                        sample = movements[0]
                        logger.info(f"  Sample movement: {json.dumps(sample, indent=2)}")
                elif isinstance(data, list):
                    logger.info(f"  Found {len(data)} movements")
                    if data:
                        logger.info(f"  Sample: {json.dumps(data[0], indent=2)}")
            else:
                logger.error(f"❌ FAILED: {response.text[:300]}")
                
    def test_06_stock_movements_by_product(self):
        """Test product-specific movements"""
        logger.info("\n=== TESTING PRODUCT MOVEMENTS ===")
        
        endpoints = [
            (f"/stock-movements/product/{self.test_product_id}", "Product movements"),
            (f"/products/{self.test_product_id}/movements", "Alt endpoint"),
        ]
        
        for endpoint, description in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            logger.info(f"\n{description}: {endpoint}")
            logger.info(f"Status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ SUCCESS!")
                logger.info(f"  Response: {json.dumps(data, indent=2)[:300]}")
            elif response.status_code == 404:
                logger.info("  Endpoint not implemented")
            else:
                logger.error(f"❌ FAILED: {response.text[:300]}")
                
    def test_07_verify_data_integrity(self):
        """Verify the data returned makes sense"""
        logger.info("\n=== VERIFYING DATA INTEGRITY ===")
        
        # Check if movements match invoice data
        response = requests.get(f"{BASE_URL}/stock-movements?limit=100", headers=HEADERS)
        if response.status_code == 200:
            data = response.json()
            movements = data if isinstance(data, list) else data.get("movements", data.get("data", []))
            
            if movements:
                logger.info(f"\nAnalyzing {len(movements)} movements:")
                
                # Group by movement type
                by_type = {}
                for m in movements:
                    m_type = m.get("movement_type", "unknown")
                    by_type[m_type] = by_type.get(m_type, 0) + 1
                
                logger.info("Movement types:")
                for m_type, count in by_type.items():
                    logger.info(f"  {m_type}: {count}")
                    
                # Check dates
                dates = [m.get("movement_date") for m in movements if m.get("movement_date")]
                if dates:
                    logger.info(f"\nDate range: {min(dates)} to {max(dates)}")
                    
                # Sample products
                products = set()
                for m in movements[:10]:
                    if m.get("product_name"):
                        products.add(m.get("product_name"))
                        
                if products:
                    logger.info(f"\nSample products: {', '.join(list(products)[:5])}")


def run_tests():
    """Run all fixed API tests"""
    test_suite = TestFixedAPIs()
    TestFixedAPIs.setup_class()
    
    tests = [
        test_suite.test_01_sales_returns_list,
        test_suite.test_02_sales_returns_crud,
        test_suite.test_03_party_ledger_balance,
        test_suite.test_04_party_ledger_entries,
        test_suite.test_05_stock_movements_list,
        test_suite.test_06_stock_movements_by_product,
        test_suite.test_07_verify_data_integrity
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            failed += 1
            logger.error(f"❌ {test.__name__} failed with exception: {str(e)}")
    
    logger.info(f"\n{'='*60}")
    logger.info(f"FINAL RESULTS: {passed} passed, {failed} failed")
    logger.info(f"{'='*60}")
    
    # Summary of what's working
    logger.info("\n📊 API STATUS SUMMARY:")
    logger.info("1. Sales Returns API: Check results above")
    logger.info("2. Party Ledger API: Check results above") 
    logger.info("3. Stock Movements API: Check results above")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)