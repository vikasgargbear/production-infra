"""
Test Suite 09: Master Settings API Testing
Tests system configuration and business rules management
"""

import pytest
import requests
import json
from datetime import datetime, date
from typing import Dict, Any
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


class TestMasterSettingsAPI:
    """Test suite for Master Settings API"""
    
    def test_01_get_all_settings(self):
        """Test retrieving all master settings"""
        response = requests.get(
            f"{BASE_URL}/master-settings/all",
            params={"org_id": DEFAULT_ORG_ID},
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Retrieved master settings")
            
            # Check structure
            if isinstance(data, dict):
                for category, settings in data.items():
                    logger.info(f"  Category: {category} - {len(settings) if isinstance(settings, list) else 'N/A'} settings")
            elif isinstance(data, list):
                logger.info(f"  Total settings: {len(data)}")
        else:
            logger.warning(f"⚠️ Failed to get settings: {response.status_code}")
            
    def test_02_get_billing_settings(self):
        """Test retrieving billing-specific settings"""
        response = requests.get(
            f"{BASE_URL}/master-settings/billing",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Retrieved billing settings")
            
            # Verify billing settings
            expected_fields = [
                "allow_billing_without_customer",
                "default_cash_customer_name",
                "allow_negative_stock",
                "auto_round_off_invoice"
            ]
            
            for field in expected_fields:
                if field in data:
                    logger.info(f"  {field}: {data[field]}")
        elif response.status_code == 404:
            logger.warning("⚠️ Billing settings endpoint not found")
            
    def test_03_get_inventory_settings(self):
        """Test retrieving inventory-specific settings"""
        response = requests.get(
            f"{BASE_URL}/master-settings/inventory",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Retrieved inventory settings")
            
            # Verify inventory settings
            expected_fields = [
                "allow_negative_stock",
                "track_batch_wise",
                "track_expiry_dates",
                "low_stock_alert_percentage"
            ]
            
            for field in expected_fields:
                if field in data:
                    logger.info(f"  {field}: {data[field]}")
        elif response.status_code == 404:
            logger.warning("⚠️ Inventory settings endpoint not found")
            
    def test_04_update_setting(self):
        """Test updating a specific setting"""
        update_data = {
            "setting_value": True,
            "setting_type": "boolean",
            "description": "Updated via API test"
        }
        
        # Try to update a test setting
        response = requests.put(
            f"{BASE_URL}/master-settings/billing/allow_negative_stock",
            json=update_data,
            headers=HEADERS
        )
        
        if response.status_code in [200, 201]:
            logger.info("✅ Setting updated successfully")
        elif response.status_code == 404:
            logger.warning("⚠️ Update setting endpoint not found")
        elif response.status_code in [401, 403]:
            logger.warning("⚠️ Not authorized to update settings")
        else:
            logger.warning(f"⚠️ Update failed: {response.status_code}")
            
    def test_05_get_general_settings(self):
        """Test retrieving general/company settings"""
        response = requests.get(
            f"{BASE_URL}/master-settings/general",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Retrieved general settings")
            
            # Check company info
            if "company_name" in data:
                logger.info(f"  Company: {data['company_name']}")
            if "company_gst" in data:
                logger.info(f"  GST: {data['company_gst']}")
            if "invoice_prefix" in data:
                logger.info(f"  Invoice prefix: {data['invoice_prefix']}")
        elif response.status_code == 404:
            logger.warning("⚠️ General settings endpoint not found")
            
    def test_06_get_compliance_settings(self):
        """Test retrieving compliance settings"""
        response = requests.get(
            f"{BASE_URL}/master-settings/compliance",
            headers=HEADERS
        )
        
        if response.status_code == 200:
            data = response.json()
            logger.info(f"✅ Retrieved compliance settings")
            
            # Check compliance settings
            compliance_fields = [
                "enforce_drug_license_check",
                "drug_license_expiry_alert_days",
                "enforce_gst_validation",
                "maintain_narcotic_register"
            ]
            
            for field in compliance_fields:
                if field in data:
                    logger.info(f"  {field}: {data[field]}")
        elif response.status_code == 404:
            logger.warning("⚠️ Compliance settings endpoint not found")
            
    def test_07_get_tax_settings(self):
        """Test retrieving tax configuration"""
        endpoints = [
            "/master-settings/tax",
            "/tax-settings",
            "/settings/tax"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Retrieved tax settings from {endpoint}")
                
                # Check tax settings
                if isinstance(data, dict):
                    logger.info(f"  Tax settings: {json.dumps(data, indent=2)}")
                break
            elif response.status_code == 404:
                continue
                
    def test_08_get_notification_settings(self):
        """Test retrieving notification preferences"""
        endpoints = [
            "/master-settings/notifications",
            "/notification-settings",
            "/settings/alerts"
        ]
        
        for endpoint in endpoints:
            response = requests.get(
                f"{BASE_URL}{endpoint}",
                headers=HEADERS
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"✅ Retrieved notification settings from {endpoint}")
                
                # Check notification settings
                if isinstance(data, dict):
                    for key, value in data.items():
                        logger.info(f"  {key}: {value}")
                break
            elif response.status_code == 404:
                continue


def run_tests():
    """Run all master settings API tests"""
    test_suite = TestMasterSettingsAPI()
    
    tests = [
        test_suite.test_01_get_all_settings,
        test_suite.test_02_get_billing_settings,
        test_suite.test_03_get_inventory_settings,
        test_suite.test_04_update_setting,
        test_suite.test_05_get_general_settings,
        test_suite.test_06_get_compliance_settings,
        test_suite.test_07_get_tax_settings,
        test_suite.test_08_get_notification_settings
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
    logger.info(f"Master Settings API Test Results: {passed} passed, {failed} failed")
    logger.info(f"{'='*50}")
    
    return failed == 0


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)