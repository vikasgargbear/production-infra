"""
Script to seed sample batches with real pricing data
Run this to populate the database with test batches
"""
import psycopg2
import os
from datetime import datetime, timedelta
import random

# Database connection from environment
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:yourpassword@localhost:5432/pharma_erp')

def create_sample_batches():
    """Create sample batches for existing products"""
    
    # Sample batch data with realistic pharma pricing
    sample_batches = [
        {
            'product_name': 'AasoTops',
            'batches': [
                {'batch_number': 'AT2024001', 'mrp': 150, 'selling_price': 120, 'cost_price': 80, 'quantity': 500},
                {'batch_number': 'AT2024002', 'mrp': 150, 'selling_price': 125, 'cost_price': 82, 'quantity': 300},
                {'batch_number': 'AT2024003', 'mrp': 160, 'selling_price': 130, 'cost_price': 85, 'quantity': 750},
            ]
        },
        {
            'product_name': 'Paracetamol 500mg',
            'batches': [
                {'batch_number': 'PCM2024001', 'mrp': 30, 'selling_price': 24, 'cost_price': 15, 'quantity': 1000},
                {'batch_number': 'PCM2024002', 'mrp': 30, 'selling_price': 25, 'cost_price': 16, 'quantity': 1500},
            ]
        },
        {
            'product_name': 'Amoxicillin 500mg',
            'batches': [
                {'batch_number': 'AMX2024001', 'mrp': 120, 'selling_price': 95, 'cost_price': 60, 'quantity': 400},
                {'batch_number': 'AMX2024002', 'mrp': 125, 'selling_price': 98, 'cost_price': 62, 'quantity': 600},
            ]
        },
        {
            'product_name': 'Vitamin C 500mg',
            'batches': [
                {'batch_number': 'VTC2024001', 'mrp': 80, 'selling_price': 65, 'cost_price': 40, 'quantity': 800},
                {'batch_number': 'VTC2024002', 'mrp': 85, 'selling_price': 68, 'cost_price': 42, 'quantity': 1200},
            ]
        },
        {
            'product_name': 'Omeprazole 20mg',
            'batches': [
                {'batch_number': 'OMP2024001', 'mrp': 140, 'selling_price': 110, 'cost_price': 70, 'quantity': 350},
                {'batch_number': 'OMP2024002', 'mrp': 145, 'selling_price': 115, 'cost_price': 72, 'quantity': 450},
            ]
        }
    ]
    
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        # Default org_id
        org_id = 'ad808530-1ddb-4377-ab20-67bef145d80d'
        
        print("Creating sample batches...")
        
        for product_data in sample_batches:
            # First check if product exists, if not create it
            cur.execute("""
                SELECT product_id FROM inventory.products 
                WHERE product_name = %s AND org_id = %s
            """, (product_data['product_name'], org_id))
            
            result = cur.fetchone()
            
            if result:
                product_id = result[0]
                print(f"Found product: {product_data['product_name']} (ID: {product_id})")
            else:
                # Create product if it doesn't exist
                cur.execute("""
                    INSERT INTO inventory.products (
                        org_id, product_code, product_name, generic_name,
                        brand, manufacturer, hsn_code, gst_percentage,
                        maintain_batch, maintain_expiry, is_active
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, true, true, true
                    ) RETURNING product_id
                """, (
                    org_id,
                    f"PROD{random.randint(100000, 999999)}",
                    product_data['product_name'],
                    product_data['product_name'].split()[0],  # Generic name
                    'Generic Brand',
                    'Generic Manufacturer',
                    '3004',  # Default HSN for pharma
                    12  # GST percentage
                ))
                product_id = cur.fetchone()[0]
                print(f"Created product: {product_data['product_name']} (ID: {product_id})")
            
            # Create batches for this product
            for batch in product_data['batches']:
                # Check if batch already exists
                cur.execute("""
                    SELECT batch_id FROM inventory.batches 
                    WHERE batch_number = %s AND product_id = %s AND org_id = %s
                """, (batch['batch_number'], product_id, org_id))
                
                if cur.fetchone():
                    print(f"  Batch {batch['batch_number']} already exists, skipping...")
                    continue
                
                # Calculate expiry date (6 months to 2 years from now)
                days_to_expiry = random.randint(180, 730)
                expiry_date = datetime.now() + timedelta(days=days_to_expiry)
                manufacturing_date = datetime.now() - timedelta(days=random.randint(30, 180))
                
                cur.execute("""
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number,
                        manufacturing_date, expiry_date,
                        quantity_received, quantity_available, quantity_allocated,
                        cost_price, selling_price, mrp,
                        is_active, created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                """, (
                    org_id, product_id, batch['batch_number'],
                    manufacturing_date.date(), expiry_date.date(),
                    batch['quantity'], batch['quantity'], 0,
                    batch['cost_price'], batch['selling_price'], batch['mrp']
                ))
                
                print(f"  Created batch {batch['batch_number']} - MRP: ₹{batch['mrp']}, Selling: ₹{batch['selling_price']}, Qty: {batch['quantity']}")
        
        conn.commit()
        print("\n✅ Sample batches created successfully!")
        
        # Show summary
        cur.execute("""
            SELECT 
                p.product_name,
                COUNT(b.batch_id) as batch_count,
                SUM(b.quantity_available) as total_stock,
                MIN(b.selling_price) as min_price,
                MAX(b.selling_price) as max_price
            FROM inventory.products p
            LEFT JOIN inventory.batches b ON p.product_id = b.product_id
            WHERE p.org_id = %s AND b.is_active = true
            GROUP BY p.product_name
            ORDER BY p.product_name
        """, (org_id,))
        
        print("\n📊 Inventory Summary:")
        print("-" * 80)
        print(f"{'Product':<30} {'Batches':<10} {'Stock':<10} {'Min Price':<12} {'Max Price':<12}")
        print("-" * 80)
        
        for row in cur.fetchall():
            print(f"{row[0]:<30} {row[1]:<10} {row[2]:<10} ₹{row[3]:<11.2f} ₹{row[4]:<11.2f}")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error: {str(e)}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()

if __name__ == "__main__":
    create_sample_batches()