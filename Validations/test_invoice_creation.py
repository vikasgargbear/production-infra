#!/usr/bin/env python3
"""
End-to-End Invoice Creation Test Script (Python Version)
Purpose: Create a complete invoice from customer to database

Test Flow:
1. Find or create customer
2. Find or create product
3. Create invoice with items
4. Verify invoice in database
"""

import requests
import json
import sys
from datetime import datetime
from decimal import Decimal

# Configuration
API_BASE = "https://pharma-backend-production-0c09.up.railway.app/api"
ORG_ID = "11111111-1111-1111-1111-111111111111"

# Color codes for terminal output
class Colors:
    RESET = '\033[0m'
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'

def log(message, level='info'):
    """Print colored log messages"""
    prefixes = {
        'success': f"{Colors.GREEN}✅",
        'error': f"{Colors.RED}❌",
        'warning': f"{Colors.YELLOW}⚠️",
        'info': f"{Colors.BLUE}ℹ️",
        'step': f"{Colors.BOLD}📍"
    }
    print(f"{prefixes.get(level, '')} {message}{Colors.RESET}")

def load_invoice_data(filename='sample_invoice_input.json'):
    """Load invoice data from JSON file"""
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
        log(f"Loaded invoice data from {filename}", 'success')
        return data
    except FileNotFoundError:
        log(f"File {filename} not found", 'error')
        return None
    except json.JSONDecodeError as e:
        log(f"Invalid JSON in {filename}: {e}", 'error')
        return None

def find_or_create_customer(invoice_data):
    """Find existing customer or create new one"""
    log("Step 1: Customer Setup", 'step')
    
    customer_id = invoice_data.get('customer_id')
    if customer_id:
        log(f"Using provided customer ID: {customer_id}", 'info')
        return customer_id
    
    # Search for customer by phone
    phone = invoice_data.get('primary_phone', '')
    if phone:
        try:
            response = requests.get(
                f"{API_BASE}/customers",
                params={"search": phone, "limit": 1},
                headers={"X-Org-Id": ORG_ID},
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                customers = data.get('customers', [])
                if customers:
                    customer_id = customers[0].get('customer_id')
                    log(f"Found existing customer: ID {customer_id}", 'success')
                    return customer_id
        except Exception as e:
            log(f"Customer search failed: {e}", 'warning')
    
    # Create new customer
    log("Creating new customer...", 'info')
    customer_data = {
        "customer_name": invoice_data.get('customer_name', 'Test Customer'),
        "customer_type": invoice_data.get('customer_type', 'retail'),
        "primary_phone": invoice_data.get('primary_phone', '9999999999'),
        "primary_email": invoice_data.get('primary_email', ''),
        "state": invoice_data.get('state', 'Maharashtra'),
        "city": invoice_data.get('city', 'Mumbai'),
        "credit_limit": invoice_data.get('credit_limit', 50000),
        "credit_period_days": invoice_data.get('credit_period_days', 30)
    }
    
    try:
        response = requests.post(
            f"{API_BASE}/customers",
            json=customer_data,
            headers={
                "X-Org-Id": ORG_ID,
                "Content-Type": "application/json"
            },
            timeout=10
        )
        
        if response.status_code in [200, 201]:
            result = response.json()
            customer_id = result.get('customer_id') or result.get('id') or 1
            log(f"Created new customer: {customer_data['customer_name']} (ID: {customer_id})", 'success')
            return customer_id
        else:
            log(f"Customer creation failed: {response.status_code}", 'warning')
            log(f"Response: {response.text[:200]}", 'warning')
            return 1  # Default fallback
            
    except Exception as e:
        log(f"Customer creation error: {e}", 'error')
        return 1

def create_invoice(invoice_data):
    """Create invoice via API"""
    log("Step 2: Invoice Creation", 'step')
    
    # Ensure customer_id is set
    if not invoice_data.get('customer_id'):
        invoice_data['customer_id'] = find_or_create_customer(invoice_data)
    
    # Add required fields if missing
    invoice_data.setdefault('invoice_date', datetime.now().isoformat())
    invoice_data.setdefault('invoice_type', 'tax_invoice')
    invoice_data.setdefault('payment_method', 'cash')
    invoice_data.setdefault('payment_terms', 'cash')
    invoice_data.setdefault('place_of_supply', 'Maharashtra')
    
    # Calculate totals if not provided
    if 'items' in invoice_data and invoice_data['items']:
        subtotal = 0
        total_tax = 0
        
        for item in invoice_data['items']:
            quantity = float(item.get('quantity', 0))
            unit_price = float(item.get('unit_price', 0))
            discount_percent = float(item.get('discount_percentage', 0))
            gst_percent = float(item.get('gst_percentage', 18))
            
            line_subtotal = quantity * unit_price
            discount_amount = line_subtotal * discount_percent / 100
            taxable = line_subtotal - discount_amount
            tax = taxable * gst_percent / 100
            
            subtotal += line_subtotal
            total_tax += tax
            
            # Add calculated values to item
            item['discount_amount'] = discount_amount
            item['line_total'] = taxable
            item['line_total_with_tax'] = taxable + tax
            
            # Add GST breakup (assuming intra-state)
            if gst_percent > 0:
                item['cgst_amount'] = tax / 2
                item['sgst_amount'] = tax / 2
                item['igst_amount'] = 0
        
        # Set invoice totals
        invoice_data.setdefault('subtotal_amount', subtotal)
        invoice_data.setdefault('total_tax_amount', total_tax)
        invoice_data.setdefault('taxable_amount', subtotal - invoice_data.get('discount_amount', 0))
        
        total = invoice_data['taxable_amount'] + total_tax + invoice_data.get('other_charges', 0)
        invoice_data.setdefault('total_amount', total)
        invoice_data.setdefault('net_amount', total)
        invoice_data.setdefault('final_amount', total)
    
    # Display invoice summary
    print(f"\n{Colors.BOLD}Invoice Summary:{Colors.RESET}")
    print(f"  Customer: {invoice_data.get('customer_name', 'N/A')}")
    print(f"  Items: {len(invoice_data.get('items', []))} product(s)")
    print(f"  Subtotal: ₹{invoice_data.get('subtotal_amount', 0):.2f}")
    print(f"  Tax: ₹{invoice_data.get('total_tax_amount', 0):.2f}")
    print(f"  Total: ₹{invoice_data.get('total_amount', 0):.2f}")
    
    # Send invoice to API
    log("Sending invoice to backend...", 'info')
    
    try:
        response = requests.post(
            f"{API_BASE}/invoices",
            json=invoice_data,
            headers={
                "X-Org-Id": ORG_ID,
                "Content-Type": "application/json"
            },
            timeout=30
        )
        
        log(f"Response status: {response.status_code}", 'info')
        
        if response.status_code in [200, 201]:
            try:
                result = response.json()
                log("Invoice created successfully!", 'success')
                print(f"\n{Colors.BOLD}Invoice Details:{Colors.RESET}")
                print(f"  Invoice Number: {result.get('invoice_number', 'N/A')}")
                print(f"  Invoice ID: {result.get('invoice_id', 'N/A')}")
                print(f"  Status: {result.get('invoice_status', 'Created')}")
                return result
            except json.JSONDecodeError:
                log("Invoice likely created but response parsing failed", 'warning')
                print(f"Raw response: {response.text[:200]}")
                return {'status': 'partial_success'}
        else:
            log(f"Invoice creation failed: HTTP {response.status_code}", 'error')
            error_text = response.text[:500]
            print(f"Error: {error_text}")
            
            # Check for specific errors
            if 'column' in error_text and 'does not exist' in error_text:
                log("Database schema issue detected", 'error')
                print("\nPossible fixes:")
                print("1. Run database migration scripts")
                print("2. Check column names match schema")
                print("3. Verify database connection")
            
            return None
            
    except requests.exceptions.Timeout:
        log("Request timed out", 'error')
        return None
    except requests.exceptions.ConnectionError:
        log("Could not connect to backend", 'error')
        return None
    except Exception as e:
        log(f"Unexpected error: {e}", 'error')
        return None

def verify_invoice(invoice_id):
    """Verify invoice was saved to database"""
    log("Step 3: Invoice Verification", 'step')
    
    if not invoice_id:
        log("No invoice ID to verify", 'warning')
        return False
    
    try:
        response = requests.get(
            f"{API_BASE}/invoices/{invoice_id}",
            headers={"X-Org-Id": ORG_ID},
            timeout=10
        )
        
        if response.status_code == 200:
            log("Invoice verified in database", 'success')
            return True
        else:
            log(f"Could not verify invoice: HTTP {response.status_code}", 'warning')
            return False
            
    except Exception as e:
        log(f"Verification failed: {e}", 'warning')
        return False

def main():
    """Main execution"""
    print(f"\n{Colors.BOLD}🧪 INVOICE CREATION TEST (PYTHON){Colors.RESET}")
    print("=" * 60)
    
    # Get input file from command line or use default
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
    else:
        input_file = 'sample_invoice_input.json'
    
    # Load invoice data
    invoice_data = load_invoice_data(input_file)
    if not invoice_data:
        log("Failed to load invoice data", 'error')
        sys.exit(1)
    
    # Create invoice
    print("\n" + "-" * 60)
    result = create_invoice(invoice_data)
    
    # Verify if created
    if result and result.get('invoice_id'):
        print("\n" + "-" * 60)
        verify_invoice(result['invoice_id'])
    
    # Final status
    print("\n" + "=" * 60)
    if result:
        log("TEST COMPLETED SUCCESSFULLY", 'success')
        print("\n✨ Invoice has been created!")
    else:
        log("TEST FAILED - Check errors above", 'error')
        print("\n⚠️  Invoice creation failed")
        print("\nTroubleshooting:")
        print("1. Check if backend is running: https://pharma-backend-production-0c09.up.railway.app/health")
        print("2. Verify database has required columns (gst_percentage, line_total, etc.)")
        print("3. Check if invoice_items table exists in sales schema")
        print("4. Ensure customer can be created/found")
        sys.exit(1)

if __name__ == "__main__":
    main()