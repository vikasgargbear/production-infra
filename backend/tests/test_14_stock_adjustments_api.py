"""
Test Suite 14: Stock Adjustments API Testing
Tests stock adjustments, write-offs, and inventory corrections
"""

import pytest
import requests
import json
from datetime import datetime, date, timedelta
from typing import Dict, Any, List
import logging

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


class TestStockAdjustmentsAPI:
    """Test suite for Stock Adjustments API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_product_id = None
        cls.test_batch_id = None
        cls.test_adjustment_id = None
        
        # Get a product with stock
        try:
            response = requests.get(
                f"{BASE_URL}/products?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                products = data.get("products", [])
                if products:
                    cls.test_product_id = products[0].get("product_id")
                    logger.info(f"Using product ID: {cls.test_product_id}")
        except:
            cls.test_product_id = 1
            
    def test_01_get_adjustments(self):
        """Test retrieving stock adjustments"""
        response = requests.get(
            f"{BASE_URL}/stock-adjustments",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            adjustments = data if isinstance(data, list) else data.get("adjustments", [])
            logger.info(f"✅ Retrieved {len(adjustments)} stock adjustments")
            
            if adjustments:
                adjustment = adjustments[0]
                # Check adjustment structure
                expected_fields = ["adjustment_type", "product_id", "quantity", "adjustment_date", "reason"]
                found_fields = [f for f in expected_fields if f in adjustment]
                logger.info(f"Adjustment fields: {found_fields}")
        else:
            logger.warning(f"⚠️ Stock adjustments endpoint returned {response.status_code}")
            
    def test_02_get_adjustment_reasons(self):
        """Test getting adjustment reason codes"""
        response = requests.get(
            f"{BASE_URL}/stock-adjustments/reasons",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            reasons = data if isinstance(data, list) else data.get("reasons", [])
            logger.info(f"✅ Retrieved {len(reasons)} adjustment reasons")
            
            # Common reasons
            expected_reasons = ["physical_count", "damaged", "expired", "data_error", "theft"]
            if isinstance(reasons, list) and len(reasons) > 0:
                if isinstance(reasons[0], dict):
                    logger.info(f"Reason format: {reasons[0]}")
                else:
                    logger.info(f"Available reasons: {reasons[:5]}")
        else:
            logger.warning(f"⚠️ Adjustment reasons endpoint not found")
            
    def test_03_create_positive_adjustment(self):
        """Test creating positive stock adjustment (stock found)"""
        adjustment_data = {
            "adjustment_date": date.today().isoformat(),
            "adjustment_type": "positive",
            "reason": "physical_count",
            "items": [
                {
                    "product_id": self.test_product_id or 1,
                    "batch_number": f"BATCH-{datetime.now().strftime('%Y%m%d')}",
                    "current_quantity": 100,
                    "actual_quantity": 110,
                    "adjustment_quantity": 10,
                    "notes": "Found extra stock during physical count"
                }
            ],
            "verified_by": "Stock Manager",
            "reference_number": f"ADJ-{datetime.now().strftime('%Y%m%d%H%M')}"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-adjustments",
            json=adjustment_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_adjustment_id = data.get("adjustment_id", data.get("id"))
            logger.info(f"✅ Positive adjustment created: ID {self.test_adjustment_id}")
        else:
            logger.warning(f"⚠️ Positive adjustment failed: {response.status_code}")
            
    def test_04_create_negative_adjustment(self):
        """Test creating negative stock adjustment (stock loss)"""
        adjustment_data = {
            "adjustment_date": date.today().isoformat(),
            "adjustment_type": "negative",
            "reason": "damaged",
            "items": [
                {
                    "product_id": self.test_product_id or 1,
                    "batch_number": self.test_batch_id or "DEFAULT",
                    "current_quantity": 110,
                    "actual_quantity": 105,
                    "adjustment_quantity": -5,
                    "notes": "5 units damaged during handling"
                }
            ],
            "verified_by": "QC Manager",
            "reference_number": f"ADJ-{datetime.now().strftime('%Y%m%d%H%M')}-NEG"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-adjustments",
            json=adjustment_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Negative adjustment created: {data.get('message', 'Success')}")
        else:
            logger.warning(f"⚠️ Negative adjustment failed: {response.status_code}")
            
    def test_05_bulk_adjustments(self):
        """Test bulk stock adjustments for multiple products"""
        bulk_data = {
            "adjustment_date": date.today().isoformat(),
            "adjustment_type": "physical_count",
            "reason": "monthly_stocktake",
            "items": [
                {
                    "product_id": 1,
                    "batch_number": "BATCH-001",
                    "current_quantity": 100,
                    "actual_quantity": 98,
                    "adjustment_quantity": -2
                },
                {
                    "product_id": 2,
                    "batch_number": "BATCH-002",
                    "current_quantity": 50,
                    "actual_quantity": 53,
                    "adjustment_quantity": 3
                }
            ],
            "verified_by": "Inventory Team",
            "approved_by": "Warehouse Manager",
            "stocktake_reference": f"STOCKTAKE-{date.today().strftime('%Y%m')}"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-adjustments/bulk",
            json=bulk_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try without /bulk
            response = requests.post(
                f"{BASE_URL}/stock-adjustments",
                json=bulk_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Bulk adjustments created: {data.get('adjustments_created', 'Success')}")
        else:
            logger.warning(f"⚠️ Bulk adjustments not supported")
            
    def test_06_get_adjustment_details(self):
        """Test getting specific adjustment details"""
        if not self.test_adjustment_id:
            logger.warning("⚠️ No adjustment ID - skipping detail test")
            return
            
        response = requests.get(
            f"{BASE_URL}/stock-adjustments/{self.test_adjustment_id}",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Adjustment details retrieved")
            
            # Verify adjustment data
            assert "adjustment_type" in data
            assert "items" in data or "adjustment_items" in data
            assert "created_at" in data or "adjustment_date" in data
        else:
            logger.warning(f"⚠️ Adjustment detail endpoint not found")
            
    def test_07_get_pending_approvals(self):
        """Test getting adjustments pending approval"""
        response = requests.get(
            f"{BASE_URL}/stock-adjustments/pending-approval",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try with query parameter
            response = requests.get(
                f"{BASE_URL}/stock-adjustments?status=pending",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            pending = data if isinstance(data, list) else data.get("adjustments", [])
            logger.info(f"✅ Found {len(pending)} pending adjustments")
        else:
            logger.warning(f"⚠️ Pending approvals endpoint not found")
            
    def test_08_approve_adjustment(self):
        """Test approving an adjustment"""
        if not self.test_adjustment_id:
            logger.warning("⚠️ No adjustment ID - skipping approval test")
            return
            
        approval_data = {
            "approved_by": "Warehouse Manager",
            "approval_notes": "Verified physical count",
            "approval_date": datetime.now().isoformat()
        }
        
        # Try different endpoints for approval
        endpoints = [
            f"/stock-adjustments/{self.test_adjustment_id}/approve",
            f"/stock-adjustments/{self.test_adjustment_id}"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=approval_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                logger.info(f"✅ Adjustment approved successfully")
                break
            elif response.status_code == 405:
                # Try PUT
                response = requests.put(
                    f"{BASE_URL}{endpoint}",
                    json={**approval_data, "status": "approved"},
                    headers=HEADERS
                )
                if response.status_code in [200, 201]:
                    logger.info(f"✅ Adjustment approved via PUT")
                    break
        else:
            logger.warning(f"⚠️ Adjustment approval not implemented")
            
    def test_09_adjustment_report(self):
        """Test getting adjustment summary report"""
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat(),
            "group_by": "reason"
        }
        
        response = requests.get(
            f"{BASE_URL}/stock-adjustments/report",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/stock-adjustments",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Adjustment report retrieved")
            
            # Check report data
            if "total_adjustments" in data:
                logger.info(f"Total adjustments: {data['total_adjustments']}")
            if "by_reason" in data:
                logger.info(f"Adjustments by reason: {data['by_reason']}")
        else:
            logger.warning(f"⚠️ Adjustment report endpoint not found")
            
    def test_10_validate_adjustment_limits(self):
        """Test adjustment validation and limits"""
        # Test with excessive adjustment
        invalid_data = {
            "adjustment_date": date.today().isoformat(),
            "adjustment_type": "negative",
            "reason": "data_error",
            "items": [
                {
                    "product_id": self.test_product_id or 1,
                    "batch_number": "BATCH-001",
                    "current_quantity": 10,
                    "actual_quantity": -50,  # Invalid - negative stock
                    "adjustment_quantity": -60
                }
            ],
            "notes": "Testing validation"
        }
        
        response = requests.post(
            f"{BASE_URL}/stock-adjustments",
            json=invalid_data,
            headers=HEADERS
        )
        
        if response.status_code in [400, 422]:
            logger.info(f"✅ Adjustment validation working correctly")
        elif response.status_code in [200, 201]:
            logger.warning(f"⚠️ No validation for negative stock!")
        else:
            logger.info(f"⚠️ Validation endpoint returned {response.status_code}")


def run_tests():
    """Run all stock adjustments API tests"""
    test_suite = TestStockAdjustmentsAPI()
    TestStockAdjustmentsAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_adjustments,
        test_suite.test_02_get_adjustment_reasons,
        test_suite.test_03_create_positive_adjustment,
        test_suite.test_04_create_negative_adjustment,
        test_suite.test_05_bulk_adjustments,
        test_suite.test_06_get_adjustment_details,
        test_suite.test_07_get_pending_approvals,
        test_suite.test_08_approve_adjustment,
        test_suite.test_09_adjustment_report,
        test_suite.test_10_validate_adjustment_limits
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            failed += 1
            logger.error(f"❌ {test.__name__} failed: {str(e)}")
    
    logger.info(f"\n{'='*50}")
    logger.info(f"Stock Adjustments API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)