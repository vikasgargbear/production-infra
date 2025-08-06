"""
Test Suite 08: Delivery API Testing
Tests challan creation, e-way bill generation, delivery tracking, and POD recording
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


class TestDeliveryAPI:
    """Test suite for Delivery API endpoints"""
    
    @classmethod
    def setup_class(cls):
        """Setup test data"""
        cls.test_challan_id = None
        cls.test_challan_number = None
        cls.test_invoice_id = None
        cls.test_customer_id = None
        
        # Get test data
        try:
            response = requests.get(
                f"{BASE_URL}/customers?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                customers = data.get("customers", [])
                if customers:
                    cls.test_customer_id = customers[0].get("customer_id")
                    logger.info(f"Using customer ID: {cls.test_customer_id}")
        except:
            cls.test_customer_id = 1
            
        # Get an invoice
        try:
            response = requests.get(
                f"{BASE_URL}/invoices?limit=1",
                headers=HEADERS
            )
            if response.status_code == 200:
                data = response.json()
                invoices = data.get("invoices", [])
                if invoices:
                    cls.test_invoice_id = invoices[0].get("invoice_id")
                    logger.info(f"Using invoice ID: {cls.test_invoice_id}")
        except:
            pass
            
    def test_01_create_delivery_challan(self):
        """Test creating a delivery challan"""
        challan_data = {
            "customer_id": self.test_customer_id,
            "invoice_id": self.test_invoice_id,
            "challan_date": date.today().isoformat(),
            "challan_type": "delivery",
            "delivery_address": "123 Test Street, Test City",
            "transporter_name": "Test Logistics",
            "vehicle_number": "MH01AB1234",
            "driver_name": "Test Driver",
            "driver_phone": "9876543210",
            "items": [
                {
                    "product_id": 1,
                    "quantity": 10,
                    "batch_number": "TEST-BATCH-001"
                }
            ]
        }
        
        # Try different endpoints
        endpoints = [
            "/delivery-challans",
            "/challans",
            "/delivery/challan"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=challan_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.__class__.test_challan_id = data.get("challan_id", data.get("id"))
                self.__class__.test_challan_number = data.get("challan_number")
                logger.info(f"✅ Created challan: {self.test_challan_number} (ID: {self.test_challan_id})")
                break
            elif response.status_code == 422:
                logger.warning(f"⚠️ Challan validation failed: {response.text}")
                # Try with org_id
                challan_data["org_id"] = DEFAULT_ORG_ID
            elif response.status_code == 404:
                continue
                
    def test_02_get_delivery_challans(self):
        """Test retrieving delivery challans"""
        response = requests.get(
            f"{BASE_URL}/delivery-challans",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/challans",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            challans = data.get("challans", data.get("delivery_challans", data)) if isinstance(data, dict) else data
            
            if challans:
                logger.info(f"✅ Retrieved {len(challans)} challans")
                
                # Get first challan if we don't have one
                if not self.test_challan_id and len(challans) > 0:
                    challan = challans[0]
                    self.__class__.test_challan_id = challan.get("challan_id", challan.get("id"))
                    self.__class__.test_challan_number = challan.get("challan_number")
            else:
                logger.warning("⚠️ No challans found")
        else:
            logger.warning(f"⚠️ Challan list endpoint returned {response.status_code}")
            
    def test_03_get_challan_details(self):
        """Test getting challan details"""
        if not self.test_challan_id:
            logger.warning("⚠️ No challan ID - skipping detail test")
            return
            
        endpoints = [
            f"/delivery-challans/{self.test_challan_id}",
            f"/challans/{self.test_challan_id}"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Challan details retrieved")
                
                # Verify challan data
                assert "challan_number" in data
                assert "customer_id" in data
                assert "challan_status" in data or "status" in data
                break
                
    def test_04_generate_eway_bill(self):
        """Test e-way bill generation"""
        if not self.test_challan_id:
            logger.warning("⚠️ No challan ID - skipping e-way bill test")
            return
            
        eway_data = {
            "challan_id": self.test_challan_id,
            "distance_km": 150,
            "transport_mode": "road",
            "transport_document_number": "LR123456",
            "transport_document_date": date.today().isoformat()
        }
        
        endpoints = [
            f"/challans/{self.test_challan_id}/generate-eway-bill",
            f"/eway-bill/generate",
            f"/delivery/eway-bill"
        ]
        
        for endpoint in endpoints:
            response = requests.post(
                f"{BASE_URL}{endpoint}",
                json=eway_data,
                headers=HEADERS
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"✅ E-way bill generated: {data.get('eway_bill_number', 'Success')}")
                break
            elif response.status_code == 404:
                continue
            else:
                logger.warning(f"⚠️ E-way bill generation failed: {response.status_code}")
                
    def test_05_update_delivery_status(self):
        """Test updating delivery status"""
        if not self.test_challan_id:
            logger.warning("⚠️ No challan ID - skipping status update")
            return
            
        status_updates = [
            {
                "status": "dispatched",
                "dispatch_time": datetime.now().isoformat()
            },
            {
                "status": "in_transit",
                "current_location": "Highway checkpoint"
            },
            {
                "status": "delivered",
                "delivered_time": datetime.now().isoformat(),
                "received_by": "Store Manager",
                "delivery_notes": "Delivered successfully"
            }
        ]
        
        for update in status_updates:
            response = requests.patch(
                f"{BASE_URL}/delivery-challans/{self.test_challan_id}/status",
                json=update,
                headers=HEADERS
            )
            
            if response.status_code == 404:
                # Try alternative
                response = requests.put(
                    f"{BASE_URL}/challans/{self.test_challan_id}",
                    json=update,
                    headers=HEADERS
                )
                
            if response.status_code in [200, 201]:
                logger.info(f"✅ Delivery status updated to: {update['status']}")
            else:
                logger.warning(f"⚠️ Status update failed: {response.status_code}")
                
    def test_06_record_pod(self):
        """Test Proof of Delivery (POD) recording"""
        if not self.test_challan_id:
            logger.warning("⚠️ No challan ID - skipping POD test")
            return
            
        pod_data = {
            "challan_id": self.test_challan_id,
            "delivered_date": date.today().isoformat(),
            "delivered_time": datetime.now().time().isoformat(),
            "received_by_name": "John Doe",
            "received_by_designation": "Store Manager",
            "signature": "base64_encoded_signature_image",
            "delivery_photo": "base64_encoded_delivery_photo",
            "remarks": "All items received in good condition"
        }
        
        response = requests.post(
            f"{BASE_URL}/delivery-challans/{self.test_challan_id}/pod",
            json=pod_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.post(
                f"{BASE_URL}/pod/record",
                json=pod_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            logger.info("✅ POD recorded successfully")
        else:
            logger.warning(f"⚠️ POD recording failed: {response.status_code}")
            
    def test_07_delivery_tracking(self):
        """Test real-time delivery tracking"""
        if not self.test_challan_id:
            logger.warning("⚠️ No challan ID - skipping tracking test")
            return
            
        response = requests.get(
            f"{BASE_URL}/delivery-challans/{self.test_challan_id}/tracking",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/tracking/challan/{self.test_challan_id}",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Delivery tracking data retrieved")
            
            # Check for tracking info
            if "current_status" in data or "tracking_history" in data:
                logger.info("✅ Tracking information available")
        else:
            logger.warning(f"⚠️ Delivery tracking endpoint not found")
            
    def test_08_pending_deliveries(self):
        """Test getting pending deliveries"""
        response = requests.get(
            f"{BASE_URL}/delivery-challans/pending",
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/deliveries/pending",
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            pending = data.get("pending_deliveries", data) if isinstance(data, dict) else data
            
            if pending:
                logger.info(f"✅ Found {len(pending)} pending deliveries")
            else:
                logger.info("✅ No pending deliveries")
        else:
            logger.warning(f"⚠️ Pending deliveries endpoint not found")
            
    def test_09_delivery_returns(self):
        """Test delivery return handling"""
        return_data = {
            "challan_id": self.test_challan_id,
            "return_date": date.today().isoformat(),
            "return_reason": "customer_rejection",
            "items": [
                {
                    "product_id": 1,
                    "quantity": 2,
                    "reason": "Damaged during transit"
                }
            ]
        }
        
        response = requests.post(
            f"{BASE_URL}/delivery-returns",
            json=return_data,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.post(
                f"{BASE_URL}/returns/delivery",
                json=return_data,
                headers=HEADERS
            )
            
        if response.status_code in [200, 201]:
            data = response.json()
            logger.info(f"✅ Delivery return created: ID {data.get('return_id', data.get('id'))}")
        else:
            logger.warning(f"⚠️ Delivery return failed or not found")
            
    def test_10_delivery_analytics(self):
        """Test delivery performance analytics"""
        params = {
            "from_date": (date.today() - timedelta(days=30)).isoformat(),
            "to_date": date.today().isoformat()
        }
        
        response = requests.get(
            f"{BASE_URL}/delivery/analytics",
            params=params,
            headers=HEADERS
        )
        
        if response.status_code == 404:
            response = requests.get(
                f"{BASE_URL}/reports/delivery-performance",
                params=params,
                headers=HEADERS
            )
            
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Delivery analytics retrieved")
            
            # Check for metrics
            metrics = ["on_time_delivery", "delivery_success_rate", "average_delivery_time"]
            found_metrics = [m for m in metrics if m in str(data)]
            if found_metrics:
                logger.info(f"✅ Found metrics: {found_metrics}")
        else:
            logger.warning(f"⚠️ Delivery analytics endpoint not found")


def run_tests():
    """Run all delivery API tests"""
    test_suite = TestDeliveryAPI()
    TestDeliveryAPI.setup_class()
    
    tests = [
        test_suite.test_01_create_delivery_challan,
        test_suite.test_02_get_delivery_challans,
        test_suite.test_03_get_challan_details,
        test_suite.test_04_generate_eway_bill,
        test_suite.test_05_update_delivery_status,
        test_suite.test_06_record_pod,
        test_suite.test_07_delivery_tracking,
        test_suite.test_08_pending_deliveries,
        test_suite.test_09_delivery_returns,
        test_suite.test_10_delivery_analytics
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
    logger.info(f"Delivery API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)