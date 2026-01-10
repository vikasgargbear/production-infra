"""
JSON Schema Definitions for API Response Validation

Defines schemas for all critical API responses to ensure data integrity.
"""
from typing import Dict, Any

# Invoice Schema
INVOICE_SCHEMA = {
    "type": "object",
    "required": [
        "invoice_id", "invoice_number", "invoice_date", "customer_id",
        "final_amount", "payment_status", "invoice_status"
    ],
    "properties": {
        "invoice_id": {"type": "integer"},
        "invoice_number": {"type": "string"},
        "invoice_date": {"type": "string", "format": "date"},
        "customer_id": {"type": "integer"},
        "final_amount": {"type": "number"},
        "paid_amount": {"type": "number"},
        "credit_amount": {"type": "number"},
        "payment_status": {"type": "string", "enum": ["unpaid", "partial", "paid"]},
        "invoice_status": {"type": "string", "enum": ["draft", "posted", "cancelled"]},
        "items": {
            "type": "array",
            "items": {"$ref": "#/definitions/invoice_item"}
        }
    },
    "definitions": {
        "invoice_item": {
            "type": "object",
            "required": [
                "invoice_item_id", "product_id", "quantity", "unit_price",
                "discount_amount", "taxable_amount", "line_total"
            ],
            "properties": {
                "invoice_item_id": {"type": "integer"},
                "product_id": {"type": "integer"},
                "quantity": {"type": "number", "minimum": 0},
                "unit_price": {"type": "number", "minimum": 0},
                "discount_percent": {"type": "number", "minimum": 0, "maximum": 100},
                "discount_amount": {"type": "number", "minimum": 0},
                "taxable_amount": {"type": "number", "minimum": 0},
                "cgst_amount": {"type": "number", "minimum": 0},
                "sgst_amount": {"type": "number", "minimum": 0},
                "igst_amount": {"type": "number", "minimum": 0},
                "line_total": {
                    "type": "number",
                    "minimum": 0,
                    "not": {"const": 0}  # CRITICAL: line_total must not be zero
                }
            }
        }
    }
}

# Payment Schema
PAYMENT_SCHEMA = {
    "type": "object",
    "required": ["payment_id", "amount", "payment_method", "payment_status"],
    "properties": {
        "payment_id": {"type": "integer"},
        "amount": {"type": "number", "minimum": 0, "exclusiveMinimum": 0},
        "payment_method": {"type": "string"},
        "payment_status": {"type": "string"},
        "payment_date": {"type": "string", "format": "date"}
    }
}

# Batch Schema
BATCH_SCHEMA = {
    "type": "object",
    "required": ["batch_id", "product_id", "batch_number", "quantity_available", "updated_at"],
    "properties": {
        "batch_id": {"type": "integer"},
        "product_id": {"type": "integer"},
        "batch_number": {"type": "string"},
        "quantity_available": {"type": "number", "minimum": 0},
        "mrp": {"type": "number", "minimum": 0},
        "updated_at": {
            "type": "string",
            "format": "date-time"
            # CRITICAL: Must be present for delta sync
        }
    }
}

# Return/Credit Note Schema
RETURN_SCHEMA = {
    "type": "object",
    "required": ["return_id", "return_number", "return_date", "total_amount"],
    "properties": {
        "return_id": {"type": "integer"},
        "return_number": {"type": "string"},
        "return_date": {"type": "string", "format": "date"},
        "invoice_id": {"type": "integer"},
        "total_amount": {"type": "number", "minimum": 0},
        "credit_note_number": {"type": "string"},
        "items": {
            "type": "array",
            "items": {"$ref": "#/definitions/return_item"}
        }
    },
    "definitions": {
        "return_item": {
            "type": "object",
            "required": ["product_id", "quantity"],
            "properties": {
                "product_id": {"type": "integer"},
                "batch_id": {"type": "integer"},
                "quantity": {"type": "number", "minimum": 0, "exclusiveMinimum": 0}
            }
        }
    }
}

# Schema Registry
SCHEMA_REGISTRY: Dict[str, Dict[str, Any]] = {
    "invoice": INVOICE_SCHEMA,
    "invoice_item": INVOICE_SCHEMA["definitions"]["invoice_item"],
    "payment": PAYMENT_SCHEMA,
    "batch": BATCH_SCHEMA,
    "return": RETURN_SCHEMA,
    "return_item": RETURN_SCHEMA["definitions"]["return_item"]
}


def get_schema(name: str) -> Dict[str, Any]:
    """Get schema by name"""
    return SCHEMA_REGISTRY.get(name, {})
