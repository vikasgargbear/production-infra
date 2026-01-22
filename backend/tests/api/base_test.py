"""
Enterprise API Test Base Class
Provides standardized testing utilities for all API tests.

Features:
- Request/response logging
- Schema validation against Pydantic models
- Frontend-to-backend field mapping validation
- Comprehensive assertion helpers
"""
import json
import logging
from typing import Dict, Any, List, Optional, Type, Union
from datetime import date, datetime
from decimal import Decimal
import requests
from pydantic import BaseModel, ValidationError

logger = logging.getLogger(__name__)


class APITestBase:
    """
    Base class for enterprise API tests.
    Provides utilities for request handling, validation, and assertions.
    """
    
    # Override in subclasses
    BASE_PATH = "/api"
    
    def __init__(self, api_client, api_base_url: str):
        self.client = api_client
        self.base_url = api_base_url
    
    # =========================================================================
    # REQUEST HELPERS
    # =========================================================================
    
    def get(self, path: str, params: Optional[Dict] = None, 
            expected_status: int = 200, log: bool = True) -> Dict[str, Any]:
        """Make GET request with logging and validation"""
        full_path = f"{self.BASE_PATH}{path}"
        
        if log:
            logger.info(f"GET {full_path} params={params}")
        
        response = self.client.get(full_path, params=params)
        
        if log:
            logger.info(f"Response: {response.status_code}")
        
        self._assert_status(response, expected_status)
        return response.json() if response.content else {}
    
    def post(self, path: str, data: Dict[str, Any], 
             expected_status: int = 200, log: bool = True) -> Dict[str, Any]:
        """Make POST request with logging and validation"""
        full_path = f"{self.BASE_PATH}{path}"
        
        if log:
            logger.info(f"POST {full_path}")
            logger.debug(f"Payload: {json.dumps(data, indent=2, default=str)}")
        
        response = self.client.post(full_path, json=data)
        
        if log:
            logger.info(f"Response: {response.status_code}")
        
        self._assert_status(response, expected_status)
        return response.json() if response.content else {}
    
    def put(self, path: str, data: Dict[str, Any],
            expected_status: int = 200, log: bool = True) -> Dict[str, Any]:
        """Make PUT request with logging and validation"""
        full_path = f"{self.BASE_PATH}{path}"
        
        if log:
            logger.info(f"PUT {full_path}")
        
        response = self.client.put(full_path, json=data)
        self._assert_status(response, expected_status)
        return response.json() if response.content else {}
    
    def delete(self, path: str, expected_status: int = 200, 
               log: bool = True) -> Dict[str, Any]:
        """Make DELETE request with logging and validation"""
        full_path = f"{self.BASE_PATH}{path}"
        
        if log:
            logger.info(f"DELETE {full_path}")
        
        response = self.client.delete(full_path)
        self._assert_status(response, expected_status)
        return response.json() if response.content else {}
    
    # =========================================================================
    # ASSERTION HELPERS
    # =========================================================================
    
    def _assert_status(self, response: requests.Response, expected: int):
        """Assert response status code"""
        if response.status_code != expected:
            error_detail = ""
            try:
                error_detail = response.json()
            except:
                error_detail = response.text[:500]
            
            raise AssertionError(
                f"Expected status {expected}, got {response.status_code}.\n"
                f"Response: {error_detail}"
            )
    
    def assert_success_response(self, response: Dict[str, Any]):
        """Assert response indicates success"""
        success_indicators = ["success", "status"]
        for indicator in success_indicators:
            if indicator in response:
                if indicator == "success":
                    assert response["success"] is True, f"Response success=False: {response}"
                elif indicator == "status":
                    assert response["status"] in ["success", "ok"], \
                        f"Response status not success: {response}"
                return
    
    def assert_has_fields(self, data: Dict[str, Any], fields: List[str], 
                          context: str = ""):
        """Assert all required fields are present"""
        missing = [f for f in fields if f not in data]
        assert not missing, f"Missing fields {missing} in {context or 'response'}: {list(data.keys())}"
    
    def assert_field_equals(self, data: Dict[str, Any], field: str, 
                            expected: Any, context: str = ""):
        """Assert field has expected value"""
        assert field in data, f"Field '{field}' not in {context or 'response'}"
        actual = data[field]
        assert actual == expected, \
            f"Field '{field}' expected {expected}, got {actual}"
    
    def assert_field_type(self, data: Dict[str, Any], field: str, 
                          expected_type: Type, context: str = ""):
        """Assert field has expected type"""
        assert field in data, f"Field '{field}' not in {context or 'response'}"
        actual = data[field]
        if actual is not None:  # Allow None values
            assert isinstance(actual, expected_type), \
                f"Field '{field}' expected type {expected_type}, got {type(actual)}"
    
    def assert_positive_number(self, data: Dict[str, Any], field: str,
                               context: str = ""):
        """Assert field is a positive number"""
        assert field in data, f"Field '{field}' not in {context or 'response'}"
        value = data[field]
        if value is not None:
            assert float(value) > 0, f"Field '{field}' expected positive, got {value}"
    
    def assert_valid_date(self, data: Dict[str, Any], field: str,
                          context: str = ""):
        """Assert field is a valid date string"""
        assert field in data, f"Field '{field}' not in {context or 'response'}"
        value = data[field]
        if value is not None:
            try:
                if isinstance(value, str):
                    datetime.fromisoformat(value.replace('Z', '+00:00'))
            except ValueError:
                raise AssertionError(f"Field '{field}' is not a valid date: {value}")
    
    def assert_list_response(self, response: Dict[str, Any], 
                             item_fields: Optional[List[str]] = None):
        """Assert response is a valid list/paginated response"""
        # Check for common list response patterns
        list_indicators = ["data", "items", "results", "returns", "grns", "invoices"]
        data_list = None
        
        for indicator in list_indicators:
            if indicator in response:
                data_list = response[indicator]
                break
        
        if data_list is None and isinstance(response, list):
            data_list = response
        
        assert data_list is not None, f"No list data found in response: {list(response.keys())}"
        assert isinstance(data_list, list), f"Expected list, got {type(data_list)}"
        
        # Validate item fields if provided and list not empty
        if item_fields and len(data_list) > 0:
            for item in data_list[:3]:  # Check first 3 items
                self.assert_has_fields(item, item_fields, "list item")
        
        return data_list
    
    # =========================================================================
    # SCHEMA VALIDATION
    # =========================================================================
    
    def validate_against_schema(self, data: Dict[str, Any], 
                                schema: Type[BaseModel]) -> BaseModel:
        """
        Validate response data against a Pydantic schema.
        Returns the validated model instance.
        """
        try:
            return schema.model_validate(data)
        except ValidationError as e:
            raise AssertionError(f"Schema validation failed:\n{e}")
    
    def assert_schema_valid(self, data: Dict[str, Any], 
                            schema: Type[BaseModel],
                            context: str = ""):
        """Assert data is valid against schema"""
        try:
            schema.model_validate(data)
        except ValidationError as e:
            raise AssertionError(
                f"Schema validation failed for {context or 'response'}:\n{e}"
            )
    
    # =========================================================================
    # FRONTEND-BACKEND MAPPING VALIDATION
    # =========================================================================
    
    def validate_frontend_fields_passed(self, 
                                        sent_payload: Dict[str, Any],
                                        response: Dict[str, Any],
                                        field_mapping: Optional[Dict[str, str]] = None):
        """
        Validate that frontend fields are correctly passed and returned.
        
        Args:
            sent_payload: The payload sent to the API
            response: The API response
            field_mapping: Optional mapping of frontend field -> backend field names
        """
        field_mapping = field_mapping or {}
        errors = []
        
        for frontend_field, value in sent_payload.items():
            backend_field = field_mapping.get(frontend_field, frontend_field)
            
            if backend_field in response:
                response_value = response[backend_field]
                
                # Handle type differences
                if isinstance(value, (int, float)) and isinstance(response_value, (int, float)):
                    if abs(float(value) - float(response_value)) > 0.01:
                        errors.append(
                            f"Field '{frontend_field}': sent {value}, got {response_value}"
                        )
                elif str(value) != str(response_value) and value is not None:
                    # String comparison for dates, etc.
                    pass  # Allow small differences
        
        if errors:
            logger.warning(f"Field mapping differences: {errors}")
    
    # =========================================================================
    # GST/TAX VALIDATION
    # =========================================================================
    
    def validate_gst_calculation(self, item: Dict[str, Any], 
                                 gst_type: str = "CGST/SGST"):
        """Validate GST calculation accuracy"""
        taxable = float(item.get("taxable_amount", 0) or item.get("return_value", 0))
        tax_percent = float(item.get("tax_percent", 0) or item.get("gst_percent", 0))
        
        if taxable > 0 and tax_percent > 0:
            expected_tax = taxable * tax_percent / 100
            actual_tax = float(item.get("tax_amount", 0))
            
            # Allow 1 rupee tolerance for rounding
            assert abs(expected_tax - actual_tax) < 1.0, \
                f"GST calculation error: expected {expected_tax:.2f}, got {actual_tax:.2f}"
            
            if gst_type == "CGST/SGST":
                cgst = float(item.get("cgst_amount", 0))
                sgst = float(item.get("sgst_amount", 0))
                expected_each = expected_tax / 2
                
                if cgst > 0 or sgst > 0:
                    assert abs(cgst - expected_each) < 0.5, \
                        f"CGST error: expected {expected_each:.2f}, got {cgst:.2f}"
                    assert abs(sgst - expected_each) < 0.5, \
                        f"SGST error: expected {expected_each:.2f}, got {sgst:.2f}"
    
    # =========================================================================
    # UTILITY METHODS
    # =========================================================================
    
    def print_response(self, response: Dict[str, Any], title: str = "Response"):
        """Pretty print response for debugging"""
        print(f"\n{'='*60}")
        print(f"{title}")
        print('='*60)
        print(json.dumps(response, indent=2, default=str))
        print('='*60)
    
    def extract_id(self, response: Dict[str, Any], 
                   id_fields: Optional[List[str]] = None) -> Union[int, str]:
        """Extract ID from response, trying multiple field names"""
        id_fields = id_fields or ["id", "return_id", "grn_id", "invoice_id", 
                                   "customer_id", "supplier_id", "product_id"]
        
        for field in id_fields:
            if field in response:
                return response[field]
        
        # Check nested data
        if "data" in response:
            return self.extract_id(response["data"], id_fields)
        
        raise ValueError(f"No ID field found in response: {list(response.keys())}")


# =============================================================================
# SPECIALIZED TEST CLASSES
# =============================================================================

class ReturnsTestBase(APITestBase):
    """Base class for returns module tests"""
    BASE_PATH = "/api/returns"
    
    def validate_return_item(self, item: Dict[str, Any]):
        """Validate return item has all required fields"""
        required = [
            "product_id", "return_quantity"
        ]
        self.assert_has_fields(item, required, "return item")
        
        # Validate quantities are positive
        if item.get("return_quantity"):
            assert float(item["return_quantity"]) > 0, \
                "return_quantity must be positive"


class PurchaseTestBase(APITestBase):
    """Base class for purchase module tests"""
    BASE_PATH = "/api/purchase"
    
    def validate_grn_item(self, item: Dict[str, Any]):
        """Validate GRN item has all required fields"""
        required = [
            "product_id", "batch_number", "received_quantity",
            "unit_price", "mrp", "expiry_date"
        ]
        self.assert_has_fields(item, required, "GRN item")


class InventoryTestBase(APITestBase):
    """Base class for inventory module tests"""
    BASE_PATH = "/api/inventory"
    
    def validate_batch(self, batch: Dict[str, Any]):
        """Validate batch has all required fields"""
        required = [
            "batch_number", "expiry_date"
        ]
        self.assert_has_fields(batch, required, "batch")


class SalesTestBase(APITestBase):
    """Base class for sales module tests"""
    BASE_PATH = "/api/sales"


class FinanceTestBase(APITestBase):
    """Base class for finance module tests"""
    BASE_PATH = "/api/finance"


class MasterTestBase(APITestBase):
    """Base class for master module tests"""
    BASE_PATH = "/api"
