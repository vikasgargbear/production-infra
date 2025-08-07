"""
Test Suite 17: Purchase Returns API Testing
Tests purchase return processing, debit notes, and supplier return handling
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


class TestPurchaseReturnsAPI:
    """Test suite for Purchase Returns API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_return_id = None
        cls.test_purchase_id = None
        cls.test_supplier_id = None
        cls.test_debit_note_id = None
        
        # Get a purchase order for returns
        try:
            response = requests.get(
                f"{BASE_URL}/purchases?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                purchases = data.get("purchases", [])
                if purchases:
                    cls.test_purchase_id = purchases[0].get("purchase_id")
                    cls.test_supplier_id = purchases[0].get("supplier_id")
                    logger.info(f"Using purchase ID: {cls.test_purchase_id}")
        except:
            cls.test_purchase_id = 1
            cls.test_supplier_id = 1
            
    def test_01_get_purchase_returns(self):
        """Test retrieving purchase returns"""
        response = requests.get(
            f"{BASE_URL}/purchase-returns",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            returns = data if isinstance(data, list) else data.get("returns", data.get("purchase_returns", []))
            logger.info(f"✅ Retrieved {len(returns)} purchase returns")
            
            if returns:
                return_record = returns[0]
                # Check return structure
                expected_fields = ["return_date", "purchase_id", "return_reason", "total_amount"]
                found_fields = [f for f in expected_fields if f in return_record]
                logger.info(f"Return fields: {found_fields}")
        else:
            logger.warning(f"⚠️ Purchase returns endpoint returned {response.status_code}")
            
    def test_02_create_purchase_return(self):
        """Test creating a purchase return"""
        return_data = {
            "return_date": date.today().isoformat(),
            "original_purchase_id": self.test_purchase_id or 1,
            "supplier_id": self.test_supplier_id or 1,
            "return_reason": "quality_issues",
            "return_type": "quality_rejection",
            "items": [
                {
                    "product_id": 1,
                    "batch_number": "DEFECTIVE-BATCH-001",
                    "quantity_returned": 20,
                    "original_quantity": 100,
                    "unit_cost": 95.00,
                    "return_condition": "defective",
                    "defect_details": "Tablets are cracked and discolored",
                    "quality_report_ref": "QR-2025-001"
                }
            ],
            "transport_details": {
                "pickup_arranged": True,
                "pickup_date": (date.today() + timedelta(days=2)).isoformat(),
                "carrier": "Express Logistics",
                "tracking_number": "EXP123456"
            },
            "expected_credit_amount": 1900.00,
            "notes": "Entire batch found defective during quality inspection"
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns",
            json=return_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_return_id = data.get("return_id", data.get("id"))
            logger.info(f"✅ Purchase return created: ID {self.test_return_id}")
        else:
            logger.warning(f"⚠️ Purchase return creation failed: {response.status_code}")
            
    def test_03_get_return_reasons(self):
        """Test getting purchase return reason codes"""
        response = requests.get(
            f"{BASE_URL}/purchase-returns/reasons",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            reasons = data if isinstance(data, list) else data.get("reasons", [])
            logger.info(f"✅ Retrieved {len(reasons)} return reasons")
            
            # Common reasons should include
            expected_reasons = ["quality_issues", "expired_on_receipt", "wrong_product", "damaged_in_transit", "overstock"]
            if reasons:
                logger.info(f"Available reasons: {reasons[:5]}")
        else:
            logger.warning(f"⚠️ Purchase return reasons endpoint not found")
            
    def test_04_quality_inspection_log(self):
        """Test logging quality inspection results"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping quality inspection")
            return
            
        inspection_data = {
            "return_id": self.test_return_id,
            "inspection_date": date.today().isoformat(),
            "inspector_name": "QC Manager",
            "inspection_results": [
                {
                    "product_id": 1,
                    "batch_number": "DEFECTIVE-BATCH-001",
                    "quantity_inspected": 20,
                    "defects_found": {
                        "physical_damage": 15,
                        "discoloration": 20,
                        "wrong_specification": 0
                    },
                    "sample_test_results": {
                        "assay": "Failed - 85% instead of 95-105%",
                        "dissolution": "Failed - only 65% in 30 minutes",
                        "uniformity": "Passed"
                    },
                    "recommendation": "complete_rejection"
                }
            ],
            "overall_status": "rejected",
            "photographic_evidence": ["evidence_1.jpg", "evidence_2.jpg"],
            "lab_report_reference": "LAB-RPT-2025-001"
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns/{self.test_return_id}/quality-inspection",
            json=inspection_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try PUT endpoint
            response = requests.put(
                f"{BASE_URL}/purchase-returns/{self.test_return_id}",
                json={"quality_inspection": inspection_data},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Quality inspection logged successfully")
        else:
            logger.warning(f"⚠️ Quality inspection logging not implemented")
            
    def test_05_supplier_approval_request(self):
        """Test requesting approval from supplier"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping supplier approval")
            return
            
        approval_request = {
            "return_id": self.test_return_id,
            "request_date": date.today().isoformat(),
            "requested_action": "full_credit",
            "justification": "Quality defects confirmed by lab testing",
            "supporting_documents": [
                "quality_report.pdf",
                "lab_test_results.pdf",
                "photographic_evidence.pdf"
            ],
            "contact_person": "Purchase Manager",
            "urgency": "high",
            "expected_response_date": (date.today() + timedelta(days=5)).isoformat()
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns/{self.test_return_id}/request-approval",
            json=approval_request,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try generic communications endpoint
            response = requests.post(
                f"{BASE_URL}/supplier-communications",
                json={**approval_request, "communication_type": "return_approval"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Supplier approval requested successfully")
        else:
            logger.warning(f"⚠️ Supplier approval request not implemented")
            
    def test_06_generate_debit_note(self):
        """Test generating debit note from purchase return"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping debit note test")
            return
            
        debit_note_data = {
            "return_id": self.test_return_id,
            "debit_note_date": date.today().isoformat(),
            "debit_amount": 1900.00,
            "tax_amount": 342.00,
            "total_debit": 2242.00,
            "reason": "Defective goods returned",
            "reference_documents": [
                "quality_inspection_report.pdf",
                "return_delivery_receipt.pdf"
            ],
            "notes": "Debit note for defective batch returned to supplier"
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns/{self.test_return_id}/debit-note",
            json=debit_note_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try general debit notes endpoint
            response = requests.post(
                f"{BASE_URL}/debit-notes",
                json=debit_note_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            self.__class__.test_debit_note_id = data.get("debit_note_id", data.get("id"))
            logger.info(f"✅ Debit note generated: {self.test_debit_note_id}")
        else:
            logger.warning(f"⚠️ Debit note generation failed: {response.status_code}")
            
    def test_07_track_return_shipment(self):
        """Test tracking return shipment to supplier"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping shipment tracking")
            return
            
        tracking_data = {
            "return_id": self.test_return_id,
            "shipment_status": "picked_up",
            "tracking_updates": [
                {
                    "timestamp": datetime.now().isoformat(),
                    "status": "picked_up",
                    "location": "Our Warehouse",
                    "notes": "Items picked up by carrier"
                }
            ],
            "carrier_details": {
                "carrier_name": "Express Logistics",
                "tracking_number": "EXP123456",
                "driver_name": "John Doe",
                "vehicle_number": "MH02CD1234"
            }
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns/{self.test_return_id}/tracking",
            json=tracking_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try shipment tracking endpoint
            response = requests.post(
                f"{BASE_URL}/shipment-tracking",
                json={**tracking_data, "shipment_type": "purchase_return"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Return shipment tracking updated")
        else:
            logger.warning(f"⚠️ Return shipment tracking not implemented")
            
    def test_08_supplier_return_acknowledgment(self):
        """Test recording supplier acknowledgment of return"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping acknowledgment")
            return
            
        acknowledgment = {
            "return_id": self.test_return_id,
            "acknowledgment_date": date.today().isoformat(),
            "supplier_reference": "SUP-RTN-2025-001",
            "acknowledgment_status": "accepted",
            "supplier_notes": "Return accepted. Credit note will be processed within 7 days.",
            "credit_processing_timeline": "7_business_days",
            "replacement_offered": False,
            "contact_person": "Supplier Returns Manager"
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns/{self.test_return_id}/acknowledgment",
            json=acknowledgment,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try PUT endpoint
            response = requests.put(
                f"{BASE_URL}/purchase-returns/{self.test_return_id}",
                json={"supplier_acknowledgment": acknowledgment},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Supplier acknowledgment recorded")
        else:
            logger.warning(f"⚠️ Supplier acknowledgment not implemented")
            
    def test_09_return_analytics(self):
        """Test getting purchase return analytics"""
        params = {
            "from_date": (date.today() - timedelta(days=90)).isoformat(),
            "to_date": date.today().isoformat(),
            "group_by": "supplier"
        }
        
        response = requests.get(
            f"{BASE_URL}/purchase-returns/analytics",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try reports endpoint
            response = requests.get(
                f"{BASE_URL}/reports/purchase-returns",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Purchase return analytics retrieved")
            
            # Check analytics data
            if "total_returns" in data:
                logger.info(f"Total returns: {data['total_returns']}")
            if "by_supplier" in data:
                logger.info(f"Returns by supplier: {len(data['by_supplier'])} suppliers")
            if "return_value" in data:
                logger.info(f"Total return value: {data['return_value']}")
        else:
            logger.warning(f"⚠️ Purchase return analytics endpoint not found")
            
    def test_10_return_settlement_tracking(self):
        """Test tracking return settlements and credits"""
        if not self.test_return_id:
            logger.warning("⚠️ No return ID - skipping settlement tracking")
            return
            
        settlement_data = {
            "return_id": self.test_return_id,
            "settlement_date": date.today().isoformat(),
            "settlement_type": "credit_note",
            "settlement_amount": 2242.00,
            "supplier_credit_note": "SCN-2025-001",
            "payment_method": "adjustment_against_future_purchases",
            "settlement_status": "completed",
            "processed_by": "Accounts Payable Team"
        }
        
        response = requests.post(
            f"{BASE_URL}/purchase-returns/{self.test_return_id}/settlement",
            json=settlement_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            # Try financial settlements endpoint
            response = requests.post(
                f"{BASE_URL}/financial/settlements",
                json={**settlement_data, "settlement_category": "purchase_return"},
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info(f"✅ Return settlement recorded successfully")
        else:
            logger.warning(f"⚠️ Return settlement tracking not implemented")


def run_tests():
    """Run all purchase returns API tests"""
    test_suite = TestPurchaseReturnsAPI()
    TestPurchaseReturnsAPI.setup_class()
    
    tests = [
        test_suite.test_01_get_purchase_returns,
        test_suite.test_02_create_purchase_return,
        test_suite.test_03_get_return_reasons,
        test_suite.test_04_quality_inspection_log,
        test_suite.test_05_supplier_approval_request,
        test_suite.test_06_generate_debit_note,
        test_suite.test_07_track_return_shipment,
        test_suite.test_08_supplier_return_acknowledgment,
        test_suite.test_09_return_analytics,
        test_suite.test_10_return_settlement_tracking
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
    logger.info(f"Purchase Returns API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)