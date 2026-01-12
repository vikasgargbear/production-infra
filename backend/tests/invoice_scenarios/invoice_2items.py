"""
Invoice 2 Items Test - Tests invoice creation with challan and verifies amounts
Run from backend directory: python -m tests.invoice_scenarios.invoice_2items
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import date, timedelta

# Import the service we're testing
from app.api.services.sales.invoice.invoice_service import InvoiceService


def run_test():
    """
    Test invoice creation with 2 items and verify challan amounts match.
    Based on actual test data:
    - Item 1: qty=1, price=30, 5% disc, 12% GST
    - Item 2: qty=1, price=23, 0% disc, 0% GST
    - Invoice discount: 10%
    - Freight: 15
    """
    
    # Get database URL from environment
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL environment variable not set!")
        print("   Set it to your PostgreSQL connection string")
        return
    
    # Create engine and session
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    db = Session()
    
    print("=" * 60)
    print("INVOICE 2 ITEMS TEST")
    print("=" * 60)
    
    try:
        # Test data matching what frontend sends
        test_items = [
            {
                "product_id": 122,
                "batch_id": 119,
                "quantity": 1,
                "free_quantity": 1,
                "unit_price": 30,
                "mrp": 45,
                "discount_percent": 5,
                "gst_percent": 12
            },
            {
                "product_id": 134,
                "batch_id": 124,
                "quantity": 1,
                "free_quantity": 0,
                "unit_price": 23,
                "mrp": 140,
                "discount_percent": 0,
                "gst_percent": 0
            }
        ]
        
        # Calculate totals using the same method as invoice creation
        print("\n--- STEP 1: Calculate Invoice Totals ---")
        totals = InvoiceService.calculate_invoice_totals(
            items=test_items,
            gst_type="CGST/SGST",
            freight_charges=15,
            insurance_charges=0,
            other_charges=0,
            discount_type="percentage",
            discount_percent=10,
            discount_amount=0
        )
        
        print("\nCALCULATED TOTALS:")
        print(f"  subtotal_amount:   {totals['subtotal_amount']}")
        print(f"  discount_amount:   {totals['discount_amount']} (item-level)")
        print(f"  scheme_discount:   {totals['scheme_discount']} (invoice-level 10%)")
        print(f"  taxable_amount:    {totals['taxable_amount']}")
        print(f"  cgst_amount:       {totals['cgst_amount']}")
        print(f"  sgst_amount:       {totals['sgst_amount']}")
        print(f"  total_tax_amount:  {totals['total_tax_amount']}")
        print(f"  freight_charges:   {totals['freight_charges']}")
        print(f"  round_off_amount:  {totals['round_off_amount']}")
        print(f"  final_amount:      {totals['final_amount']}")
        
        # Expected values based on manual calculation:
        # Item 1: 30 * 1 = 30, -5% = 28.50, +12% GST = 3.42, line_total = 31.92
        # Item 2: 23 * 1 = 23, -0% = 23, +0% GST = 0, line_total = 23
        # subtotal = 54.92
        # scheme_discount (10%) = 5.49
        # taxable_amount = 49.43
        # total_tax = 3.42
        # final = 49.43 + 15 = 64.43 -> 64 (rounded)
        
        print("\n--- STEP 2: Verify Values for Challan ---")
        _taxable = totals.get('taxable_amount', 0)
        _gst = totals.get('total_tax_amount', 0)
        _final = totals['final_amount']
        
        print(f"\nVALUES TO PASS TO CHALLAN:")
        print(f"  taxable_amount: {_taxable} (should be ~49.43)")
        print(f"  gst_amount:     {_gst} (should be ~3.42)")
        print(f"  final_amount:   {_final} (should be 64)")
        
        # Verify expected values
        print("\n--- STEP 3: Assertions ---")
        
        assert abs(totals['taxable_amount'] - 49.43) < 0.1, f"taxable_amount mismatch: {totals['taxable_amount']}"
        print("✅ taxable_amount correct: ~49.43")
        
        assert abs(totals['total_tax_amount'] - 3.42) < 0.1, f"total_tax_amount mismatch: {totals['total_tax_amount']}"
        print("✅ total_tax_amount correct: ~3.42")
        
        assert totals['final_amount'] == 64, f"final_amount mismatch: {totals['final_amount']}"
        print("✅ final_amount correct: 64")
        
        print("\n" + "=" * 60)
        print("TEST PASSED! Invoice totals are calculated correctly.")
        print("=" * 60)
        
        # Now check existing challan in database
        print("\n--- STEP 4: Check Existing Challan Data ---")
        result = db.execute(text("""
            SELECT challan_id, challan_number, invoice_id, 
                   total_amount, taxable_amount, gst_amount
            FROM sales.delivery_challans 
            WHERE invoice_id = 394
        """))
        row = result.fetchone()
        
        if row:
            print(f"\nCHALLAN FOR INVOICE 394:")
            print(f"  challan_id:      {row[0]}")
            print(f"  challan_number:  {row[1]}")
            print(f"  invoice_id:      {row[2]}")
            print(f"  total_amount:    {row[3]}")
            print(f"  taxable_amount:  {row[4]}")
            print(f"  gst_amount:      {row[5]}")
            
            print("\n--- COMPARISON ---")
            print(f"  Expected taxable: {_taxable}, Actual: {row[4]}")
            print(f"  Expected gst:     {_gst}, Actual: {row[5]}")
            
            if float(row[4] or 0) != round(_taxable, 2):
                print(f"❌ taxable_amount MISMATCH!")
            else:
                print("✅ taxable_amount matches")
                
            if float(row[5] or 0) != round(_gst, 2):
                print(f"❌ gst_amount MISMATCH!")
            else:
                print("✅ gst_amount matches")
        else:
            print("No challan found for invoice 394")
        
    except AssertionError as e:
        print(f"\n❌ ASSERTION FAILED: {e}")
        return False
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()
    
    return True


if __name__ == "__main__":
    success = run_test()
    sys.exit(0 if success else 1)
