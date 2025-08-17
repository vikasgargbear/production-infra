#!/usr/bin/env python3
"""
Script to add comprehensive pharmaceutical categories and product types
"""
import requests
import json
import time

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api/products/master"

# Comprehensive pharmaceutical categories
CATEGORIES = [
    "Granules", "Cream", "Gel", "Lotion", "Spray", "Inhaler", 
    "Suppository", "Patch", "Elixir", "Suspension", "Emulsion", 
    "Solution", "Tincture", "Liniment", "Pessary", "Sachets", 
    "Strips", "Vials", "Ampoules", "Prefilled Syringe", 
    "Nasal Spray", "Eye Drops", "Ear Drops", "Mouth Wash",
    "Dental Gel", "Antiseptic", "Disinfectant", "Bandages",
    "Gauze", "Cotton", "Surgical Tape", "Syringe", "Needle",
    "IV Fluid", "Blood Bag", "Diagnostic Kit", "Test Strip",
    "Thermometer", "Mask", "Gloves", "PPE Kit", "Sanitizer"
]

# Comprehensive product types
PRODUCT_TYPES = [
    {"type_name": "Generic Medicine", "default_base_uom": "Unit"},
    {"type_name": "Brand Medicine", "default_base_uom": "Unit"},
    {"type_name": "Vaccine", "default_base_uom": "Vial"},
    {"type_name": "Blood Product", "default_base_uom": "Unit"},
    {"type_name": "Surgical Instrument", "default_base_uom": "Piece"},
    {"type_name": "Medical Device", "default_base_uom": "Unit"},
    {"type_name": "Diagnostic Equipment", "default_base_uom": "Unit"},
    {"type_name": "Consumable", "default_base_uom": "Piece"},
    {"type_name": "Emergency Medicine", "default_base_uom": "Unit"},
    {"type_name": "Pediatric Medicine", "default_base_uom": "Unit"},
    {"type_name": "Geriatric Medicine", "default_base_uom": "Unit"},
    {"type_name": "Oncology Drug", "default_base_uom": "Unit"},
    {"type_name": "Radiopharmaceutical", "default_base_uom": "Unit"},
    {"type_name": "Biologic", "default_base_uom": "Unit"},
    {"type_name": "Nutritional Supplement", "default_base_uom": "Unit"},
    {"type_name": "Herbal Medicine", "default_base_uom": "Unit"},
    {"type_name": "Cosmeceutical", "default_base_uom": "Unit"}
]

def add_categories():
    """Add pharmaceutical categories"""
    print("Adding pharmaceutical categories...")
    success_count = 0
    
    for category in CATEGORIES:
        try:
            response = requests.post(
                f"{BASE_URL}/categories",
                headers={"Content-Type": "application/json"},
                json={"category_name": category}
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    print(f"✅ Added category: {category}")
                    success_count += 1
                else:
                    print(f"❌ Failed to add category: {category} - {result}")
            else:
                print(f"❌ HTTP Error {response.status_code} for category: {category}")
                if "already exists" in response.text:
                    print(f"   (Category already exists)")
                    success_count += 1
                    
        except Exception as e:
            print(f"❌ Exception adding category {category}: {e}")
        
        time.sleep(0.5)  # Rate limiting
    
    print(f"\nCategories: {success_count}/{len(CATEGORIES)} added successfully")

def add_product_types():
    """Add product types"""
    print("\nAdding product types...")
    success_count = 0
    
    for product_type in PRODUCT_TYPES:
        try:
            response = requests.post(
                f"{BASE_URL}/types",
                headers={"Content-Type": "application/json"},
                json=product_type
            )
            
            if response.status_code == 200:
                result = response.json()
                if result.get("success"):
                    print(f"✅ Added type: {product_type['type_name']}")
                    success_count += 1
                else:
                    print(f"❌ Failed to add type: {product_type['type_name']} - {result}")
            else:
                print(f"❌ HTTP Error {response.status_code} for type: {product_type['type_name']}")
                if "already exists" in response.text:
                    print(f"   (Type already exists)")
                    success_count += 1
                    
        except Exception as e:
            print(f"❌ Exception adding type {product_type['type_name']}: {e}")
        
        time.sleep(0.5)  # Rate limiting
    
    print(f"\nProduct Types: {success_count}/{len(PRODUCT_TYPES)} added successfully")

def verify_master_data():
    """Verify the added master data"""
    print("\nVerifying master data...")
    
    try:
        # Check categories
        response = requests.get(f"{BASE_URL}/categories")
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ Total categories now: {len(data.get('data', []))}")
        
        # Check types  
        response = requests.get(f"{BASE_URL}/types")
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"✅ Total product types now: {len(data.get('data', []))}")
                
    except Exception as e:
        print(f"❌ Error verifying data: {e}")

if __name__ == "__main__":
    print("🚀 Starting comprehensive master data expansion...")
    add_categories()
    add_product_types()
    verify_master_data()
    print("\n✅ Master data expansion complete!")