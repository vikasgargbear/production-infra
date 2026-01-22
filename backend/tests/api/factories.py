"""
Enterprise Test Data Factories
Generate realistic test data for all ERP entities.

Each factory creates complete, valid payloads matching frontend forms.
"""
import random
import string
from datetime import date, timedelta
from typing import Dict, Any, List, Optional
from decimal import Decimal


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def random_digits(n: int) -> str:
    """Generate n random digits"""
    return ''.join(random.choices(string.digits, k=n))


def random_upper(n: int) -> str:
    """Generate n random uppercase letters"""
    return ''.join(random.choices(string.ascii_uppercase, k=n))


def random_alnum(n: int) -> str:
    """Generate n random alphanumeric characters"""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))


# =============================================================================
# CUSTOMER FACTORY
# =============================================================================

class CustomerFactory:
    """Factory for creating test customer payloads"""
    
    CITIES = [
        ("Mumbai", "Maharashtra", "400001"),
        ("Delhi", "Delhi", "110001"),
        ("Bangalore", "Karnataka", "560001"),
        ("Chennai", "Tamil Nadu", "600001"),
        ("Kolkata", "West Bengal", "700001"),
        ("Ahmedabad", "Gujarat", "380001"),
        ("Pune", "Maharashtra", "411001"),
        ("Hyderabad", "Telangana", "500001"),
    ]
    
    BUSINESS_TYPES = ["pharmacy", "hospital", "clinic", "distributor", "retailer"]
    CUSTOMER_TYPES = ["retail", "wholesale", "institutional"]
    
    @classmethod
    def phone(cls) -> str:
        """Generate valid Indian phone number"""
        return f"9{random_digits(9)}"
    
    @classmethod
    def gstin(cls, state_code: str = "27") -> str:
        """Generate valid-format GSTIN"""
        pan = random_upper(5) + random_digits(4) + random.choice(string.ascii_uppercase)
        entity = "1"
        checksum = random.choice(string.ascii_uppercase + string.digits)
        return f"{state_code}{pan}{entity}Z{checksum}"
    
    @classmethod
    def pan(cls) -> str:
        """Generate valid-format PAN"""
        return random_upper(5) + random_digits(4) + random.choice(string.ascii_uppercase)
    
    @classmethod
    def drug_license(cls) -> str:
        """Generate drug license number"""
        return f"DL-{random_digits(8)}"
    
    @classmethod
    def create(cls, **overrides) -> Dict[str, Any]:
        """Create complete customer payload"""
        phone = cls.phone()
        city, state, pincode = random.choice(cls.CITIES)
        
        # State code for GSTIN
        state_codes = {
            "Maharashtra": "27", "Delhi": "07", "Karnataka": "29",
            "Tamil Nadu": "33", "West Bengal": "19", "Gujarat": "24",
            "Telangana": "36"
        }
        state_code = state_codes.get(state, "27")
        
        data = {
            # Required fields
            "customer_name": f"Test Customer {random_alnum(4)}",
            "primary_phone": phone,
            "customer_type": random.choice(cls.CUSTOMER_TYPES),
            
            # Business details
            "business_type": random.choice(cls.BUSINESS_TYPES),
            "gst_number": cls.gstin(state_code),
            "pan_number": cls.pan(),
            
            # Drug license
            "drug_license_number": cls.drug_license(),
            "drug_license_validity": str(date.today() + timedelta(days=365)),
            
            # Contact info
            "primary_email": f"customer{random_digits(4)}@test.com",
            "secondary_phone": cls.phone(),
            "whatsapp_number": phone,
            
            # Contact person
            "contact_person_name": f"Contact {random_upper(4)}",
            "contact_person_phone": cls.phone(),
            "contact_person_email": f"contact{random_digits(4)}@test.com",
            
            # Credit terms
            "credit_limit": random.choice([10000, 25000, 50000, 100000]),
            "credit_days": random.choice([15, 30, 45, 60]),
            "credit_rating": random.choice(["EXCELLENT", "GOOD", "FAIR"]),
            "payment_terms": "Net 30",
            
            # Address
            "address_line1": f"Building {random.randint(1, 999)}, Street {random.randint(1, 50)}",
            "address_line2": f"Near {random.choice(['Hospital', 'Mall', 'Station', 'Park'])}",
            "city": city,
            "state": state,
            "pincode": pincode,
            
            # Notes
            "internal_notes": "Auto-generated test customer",
            "is_active": True
        }
        
        data.update(overrides)
        return data
    
    @classmethod
    def create_minimal(cls, **overrides) -> Dict[str, Any]:
        """Create customer with only required fields"""
        data = {
            "customer_name": f"Minimal Customer {random_alnum(4)}",
            "primary_phone": cls.phone(),
            "customer_type": "retail"
        }
        data.update(overrides)
        return data


# =============================================================================
# SUPPLIER FACTORY
# =============================================================================

class SupplierFactory:
    """Factory for creating test supplier payloads"""
    
    SUPPLIER_TYPES = ["manufacturer", "distributor", "wholesaler", "importer"]
    
    @classmethod
    def create(cls, **overrides) -> Dict[str, Any]:
        """Create complete supplier payload"""
        phone = CustomerFactory.phone()
        
        data = {
            "supplier_name": f"Test Supplier {random_alnum(4)}",
            "supplier_type": random.choice(cls.SUPPLIER_TYPES),
            "supplier_code": f"SUP-{random_alnum(6)}",
            "primary_phone": phone,
            "primary_email": f"supplier{random_digits(4)}@test.com",
            "gst_number": CustomerFactory.gstin(),
            "pan_number": CustomerFactory.pan(),
            "drug_license_number": f"MNF-{random_digits(8)}",
            "drug_license_validity": str(date.today() + timedelta(days=365)),
            "contact_person_name": f"Supplier Contact {random_upper(4)}",
            "contact_person_phone": CustomerFactory.phone(),
            "payment_terms": random.choice(["Advance", "Net 30", "Net 45", "Net 60"]),
            "credit_days": random.choice([30, 45, 60, 90]),
            "address_line1": f"Industrial Area, Plot {random.randint(1, 500)}",
            "city": "Ahmedabad",
            "state": "Gujarat",
            "pincode": "380001",
            "is_active": True
        }
        
        data.update(overrides)
        return data


# =============================================================================
# PRODUCT FACTORY
# =============================================================================

class ProductFactory:
    """Factory for creating test product payloads"""
    
    CATEGORIES = ["tablets", "capsules", "syrups", "injections", "ointments", "drops"]
    MANUFACTURERS = ["Sun Pharma", "Cipla", "Dr. Reddy's", "Lupin", "Aurobindo"]
    
    @classmethod
    def create(cls, **overrides) -> Dict[str, Any]:
        """Create complete product payload"""
        code = random_alnum(6)
        mrp = random.randint(50, 500)
        
        data = {
            "product_code": f"PRD-{code}",
            "product_name": f"Test Medicine {code}",
            "generic_name": f"Generic {random_alnum(4)}",
            "manufacturer": random.choice(cls.MANUFACTURERS),
            "category": random.choice(cls.CATEGORIES),
            "sub_category": "general",
            "hsn_code": "30049099",
            "gst_percent": random.choice([5.0, 12.0, 18.0]),
            "unit": random.choice(["STRIP", "BOTTLE", "BOX", "TUBE"]),
            "pack_size": random.choice([10, 15, 20, 30]),
            "mrp": float(mrp),
            "sale_price": float(mrp * 0.85),
            "purchase_price": float(mrp * 0.60),
            "min_stock_level": 50,
            "max_stock_level": 1000,
            "reorder_level": 100,
            "is_active": True,
            "requires_prescription": random.choice([True, False]),
            "is_narcotic": False,
            "storage_conditions": "Store in cool, dry place"
        }
        
        data.update(overrides)
        return data


# =============================================================================
# BATCH FACTORY
# =============================================================================

class BatchFactory:
    """Factory for creating test batch payloads"""
    
    @classmethod
    def batch_number(cls) -> str:
        """Generate batch number"""
        return f"B{random_alnum(8)}"
    
    @classmethod
    def create(cls, product_id: int, **overrides) -> Dict[str, Any]:
        """Create complete batch payload"""
        mrp = random.randint(50, 500)
        
        data = {
            "product_id": product_id,
            "batch_number": cls.batch_number(),
            "manufacturing_date": str(date.today() - timedelta(days=random.randint(30, 180))),
            "expiry_date": str(date.today() + timedelta(days=random.randint(180, 730))),
            "mrp": float(mrp),
            "ptr": float(mrp * 0.85),
            "purchase_price": float(mrp * 0.60),
            "quantity": random.randint(100, 1000),
            "quantity_available": random.randint(50, 500),
            "location_code": f"SHELF-{random.choice(['A', 'B', 'C'])}{random.randint(1, 10)}"
        }
        
        data.update(overrides)
        return data


# =============================================================================
# SALES RETURN FACTORY
# =============================================================================

class SalesReturnFactory:
    """Factory for creating test sales return payloads"""
    
    RETURN_REASONS = [
        "EXPIRED", "DAMAGED", "WRONG_PRODUCT", "QUALITY_ISSUE",
        "NOT_REQUIRED", "EXCESS_STOCK", "RATE_DIFFERENCE"
    ]
    
    RETURN_METHODS = ["credit_note", "replacement", "refund"]
    
    DISPOSITIONS = ["RESTOCK", "QUARANTINE", "DESTROY"]
    
    @classmethod
    def create_item(cls, product_id: int, **overrides) -> Dict[str, Any]:
        """Create return item"""
        data = {
            "product_id": product_id,
            "product_name": f"Product {product_id}",
            "batch_id": None,
            "batch_number": BatchFactory.batch_number(),
            "return_quantity": random.randint(1, 10),
            "unit_price": float(random.randint(50, 200)),
            "discount_percent": 0,
            "tax_percent": 12.0,
            "return_reason": random.choice(cls.RETURN_REASONS),
            "disposition": random.choice(cls.DISPOSITIONS),
            "restock": True,
            "selected": True
        }
        
        data.update(overrides)
        return data
    
    @classmethod
    def create(cls, customer_id: int, items: List[Dict], **overrides) -> Dict[str, Any]:
        """Create complete sales return payload"""
        data = {
            "customer_id": customer_id,
            "invoice_id": None,
            "return_date": str(date.today()),
            "return_reason": random.choice(cls.RETURN_REASONS),
            "return_method": random.choice(cls.RETURN_METHODS),
            "items": items,
            "notes": "Auto-generated test return",
            "include_gst": True
        }
        
        data.update(overrides)
        return data
    
    @classmethod
    def create_from_invoice(cls, customer_id: int, invoice_id: int, 
                            items: List[Dict], **overrides) -> Dict[str, Any]:
        """Create sales return from invoice"""
        data = cls.create(customer_id, items, **overrides)
        data["invoice_id"] = invoice_id
        return data


# =============================================================================
# PURCHASE RETURN FACTORY
# =============================================================================

class PurchaseReturnFactory:
    """Factory for creating test purchase return payloads"""
    
    RETURN_CATEGORIES = ["QUALITY", "EXPIRED", "DAMAGED", "WRONG_PRODUCT", "EXCESS"]
    
    @classmethod
    def create_item(cls, product_id: int, **overrides) -> Dict[str, Any]:
        """Create purchase return item"""
        data = {
            "product_id": product_id,
            "product_name": f"Product {product_id}",
            "batch_id": None,
            "batch_number": BatchFactory.batch_number(),
            "return_quantity": random.randint(1, 20),
            "unit_price": float(random.randint(30, 150)),
            "discount_percent": 0,
            "tax_percent": 12.0,
            "return_reason": "QUALITY_ISSUE",
            "selected": True
        }
        
        data.update(overrides)
        return data
    
    @classmethod
    def create(cls, supplier_id: int, items: List[Dict], **overrides) -> Dict[str, Any]:
        """Create complete purchase return payload"""
        data = {
            "supplier_id": supplier_id,
            "supplier_invoice_id": None,
            "grn_id": None,
            "return_date": str(date.today()),
            "return_reason": "Quality Issue",
            "return_category": random.choice(cls.RETURN_CATEGORIES),
            "items": items,
            "notes": "Auto-generated test purchase return",
            "transport_details": {
                "transport_mode": "road",
                "vehicle_no": f"GJ01{random_upper(2)}{random_digits(4)}",
                "transporter_name": "Test Transport Co",
                "lr_no": f"LR{random_digits(6)}"
            }
        }
        
        data.update(overrides)
        return data


# =============================================================================
# GRN FACTORY
# =============================================================================

class GRNFactory:
    """Factory for creating test GRN payloads"""
    
    @classmethod
    def create_item(cls, product_id: int, **overrides) -> Dict[str, Any]:
        """Create GRN item"""
        mrp = random.randint(50, 500)
        
        data = {
            "product_id": product_id,
            "po_item_id": None,
            "batch_number": BatchFactory.batch_number(),
            "manufacturing_date": str(date.today() - timedelta(days=60)),
            "expiry_date": str(date.today() + timedelta(days=365)),
            "ordered_quantity": 100,
            "received_quantity": random.randint(90, 100),
            "accepted_quantity": 0,
            "rejected_quantity": 0,
            "free_quantity": random.randint(0, 5),
            "unit_price": float(mrp * 0.60),
            "mrp": float(mrp),
            "ptr": float(mrp * 0.85),
            "discount_percent": random.choice([0, 5, 10, 15]),
            "discount_amount": 0,
            "gst_percent": 12.0,
            "cgst_amount": 0,
            "sgst_amount": 0,
            "igst_amount": 0,
            "qc_status": "pending",
            "location_code": f"SHELF-A{random.randint(1, 10)}"
        }
        
        data.update(overrides)
        return data
    
    @classmethod
    def create(cls, supplier_id: int, items: List[Dict], **overrides) -> Dict[str, Any]:
        """Create complete GRN payload"""
        data = {
            "supplier_id": supplier_id,
            "po_id": None,
            "grn_date": str(date.today()),
            "supplier_invoice_number": f"INV-{random_alnum(8)}",
            "supplier_invoice_date": str(date.today() - timedelta(days=2)),
            "vehicle_number": f"GJ01{random_upper(2)}{random_digits(4)}",
            "driver_name": f"Driver {random_upper(4)}",
            "lr_number": f"LR{random_digits(6)}",
            "transporter_name": "Test Transport Co",
            "gst_type": "CGST/SGST",
            "items": items,
            "notes": "Auto-generated test GRN"
        }
        
        data.update(overrides)
        return data


# =============================================================================
# INVOICE FACTORY
# =============================================================================

class InvoiceFactory:
    """Factory for creating test invoice payloads"""
    
    @classmethod
    def create_item(cls, product_id: int, batch_id: Optional[int] = None, 
                    **overrides) -> Dict[str, Any]:
        """Create invoice item"""
        mrp = random.randint(50, 300)
        qty = random.randint(5, 20)
        
        data = {
            "product_id": product_id,
            "batch_id": batch_id,
            "batch_number": BatchFactory.batch_number(),
            "quantity": qty,
            "free_quantity": 0,
            "unit_price": float(mrp * 0.85),
            "mrp": float(mrp),
            "discount_percent": random.choice([0, 5, 10]),
            "gst_percent": 12.0,
            "hsn_code": "30049099"
        }
        
        data.update(overrides)
        return data
    
    @classmethod
    def create(cls, customer_id: int, items: List[Dict], **overrides) -> Dict[str, Any]:
        """Create complete invoice payload"""
        data = {
            "customer_id": customer_id,
            "invoice_date": str(date.today()),
            "due_date": str(date.today() + timedelta(days=30)),
            "items": items,
            "payment_terms": "Net 30",
            "notes": "Auto-generated test invoice"
        }
        
        data.update(overrides)
        return data


# =============================================================================
# STOCK ADJUSTMENT FACTORY
# =============================================================================

class StockAdjustmentFactory:
    """Factory for creating stock adjustment payloads"""
    
    ADJUSTMENT_TYPES = ["damage", "expiry", "count", "other"]
    
    @classmethod
    def create(cls, product_id: int, batch_id: int, **overrides) -> Dict[str, Any]:
        """Create stock adjustment payload"""
        data = {
            "product_id": product_id,
            "batch_id": batch_id,
            "adjustment_type": random.choice(cls.ADJUSTMENT_TYPES),
            "quantity": random.randint(1, 20),
            "adjustment_direction": "decrease",
            "reason": "Test adjustment",
            "notes": "Auto-generated test adjustment"
        }
        
        data.update(overrides)
        return data
