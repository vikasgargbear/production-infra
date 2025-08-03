#!/usr/bin/env python3
"""
Product to Invoice Workflow Test
Tests the complete user workflow: Create Product → Verify Batch → Create Invoice → Verify Data
This simulates the actual user journey in the pharmacy ERP system
"""
import requests
import json
import time
from datetime import datetime, timedelta

API_BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"

class ProductToInvoiceWorkflowTest:
    def __init__(self):
        self.workflow_steps = []
        self.test_data = {}

    def log_step(self, step_name, passed, details="", data=None):
        """Log workflow step result"""
        status = "✅ PASS" if passed else "❌ FAIL"
        step = {
            "step": step_name,
            "passed": passed,
            "details": details,
            "data": data,
            "timestamp": datetime.now().isoformat()
        }
        self.workflow_steps.append(step)
        print(f"{status} {step_name}")
        if details:
            print(f"    {details}")
        if not passed:
            print(f"    ❌ WORKFLOW STOPPED - Cannot proceed without this step")
            return False
        return True

    def step1_create_product(self):
        """Step 1: Create a new product with MRP (should trigger batch creation)"""
        print("\n📦 STEP 1: Create Product with MRP")
        
        product_data = {
            "product_name": f"Workflow Test Medicine {datetime.now().strftime('%Y%m%d_%H%M%S')}",
            "manufacturer": "Workflow Pharma Ltd",
            "product_type": "Medicine",
            "generic_name": "Test Active Ingredient",
            "brand": "WorkflowBrand",
            "hsn_code": "3004",
            "gst_percentage": 12.0,
            "mrp": 350.0,
            "sale_price": 280.0,
            "maintain_batch": True,
            "maintain_expiry": True,
            "category": "Prescription Medicine"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/products/", json=product_data, timeout=30)
            if response.status_code == 201:
                product = response.json()
                self.test_data['product'] = product
                self.test_data['product_id'] = product['product_id']
                
                return self.log_step(
                    "Create Product",
                    True,
                    f"Product created: {product['product_code']} | ID: {product['product_id']} | Name: {product['product_name']}",
                    product
                )
            else:
                return self.log_step(
                    "Create Product",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return self.log_step("Create Product", False, f"Exception: {e}")

    def step2_verify_batch_creation(self):
        """Step 2: Verify that a real batch was automatically created for the product"""
        print("\n📋 STEP 2: Verify Batch Creation")
        
        if 'product_id' not in self.test_data:
            return self.log_step("Verify Batch Creation", False, "No product ID from previous step")
        
        product_id = self.test_data['product_id']
        
        # Wait a moment for batch creation
        time.sleep(3)
        
        try:
            response = requests.get(f"{API_BASE_URL}/inventory/batches?product_id={product_id}", timeout=30)
            if response.status_code == 200:
                batch_data = response.json()
                batches = batch_data.get('batches', [])
                
                if not batches or len(batches) == 0:
                    return self.log_step(
                        "Verify Batch Creation",
                        False,
                        f"No batches found for product {product_id}"
                    )
                
                batch = batches[0]
                batch_number = batch.get('batch_number', '')
                batch_id = batch.get('batch_id', '')
                
                # Check if it's a real batch (not fallback)
                if batch_number == 'DEFAULT' or 'default_' in str(batch_id):
                    return self.log_step(
                        "Verify Batch Creation",
                        False,
                        f"Only fallback batch found: {batch_number} (ID: {batch_id})"
                    )
                
                # Verify batch data integrity
                expected_mrp = 350.0
                actual_mrp = float(batch.get('mrp', 0))
                mrp_tolerance = 1.0
                
                if abs(actual_mrp - expected_mrp) > mrp_tolerance:
                    return self.log_step(
                        "Verify Batch Creation",
                        False,
                        f"Batch MRP mismatch: expected ₹{expected_mrp}, got ₹{actual_mrp}"
                    )
                
                self.test_data['batch'] = batch
                return self.log_step(
                    "Verify Batch Creation",
                    True,
                    f"Real batch created: {batch_number} | MRP: ₹{actual_mrp} | Qty: {batch.get('quantity_available')}",
                    batch
                )
            else:
                return self.log_step(
                    "Verify Batch Creation",
                    False,
                    f"Batch API failed: HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return self.log_step("Verify Batch Creation", False, f"Exception: {e}")

    def step3_verify_product_mrp_update(self):
        """Step 3: Verify that product's current_mrp was updated from batch"""
        print("\n💰 STEP 3: Verify Product MRP Update")
        
        if 'product_id' not in self.test_data:
            return self.log_step("Verify Product MRP Update", False, "No product ID from previous step")
        
        product_id = self.test_data['product_id']
        
        try:
            response = requests.get(f"{API_BASE_URL}/products/{product_id}", timeout=30)
            if response.status_code == 200:
                updated_product = response.json()
                current_mrp = float(updated_product.get('current_mrp', 0))
                expected_mrp = 350.0
                mrp_tolerance = 1.0
                
                if current_mrp == 0:
                    return self.log_step(
                        "Verify Product MRP Update",
                        False,
                        f"Product current_mrp is still 0 (should be ₹{expected_mrp})"
                    )
                
                if abs(current_mrp - expected_mrp) > mrp_tolerance:
                    return self.log_step(
                        "Verify Product MRP Update",
                        False,
                        f"Product MRP mismatch: expected ₹{expected_mrp}, got ₹{current_mrp}"
                    )
                
                self.test_data['updated_product'] = updated_product
                return self.log_step(
                    "Verify Product MRP Update",
                    True,
                    f"Product current_mrp correctly updated to ₹{current_mrp}",
                    {"current_mrp": current_mrp}
                )
            else:
                return self.log_step(
                    "Verify Product MRP Update",
                    False,
                    f"Product fetch failed: HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return self.log_step("Verify Product MRP Update", False, f"Exception: {e}")

    def step4_get_customer(self):
        """Step 4: Get a customer for invoice creation"""
        print("\n👥 STEP 4: Get Customer for Invoice")
        
        try:
            response = requests.get(f"{API_BASE_URL}/customers/?limit=1", timeout=30)
            if response.status_code == 200:
                customer_data = response.json()
                customers = customer_data.get('customers', [])
                if customers and len(customers) > 0:
                    customer = customers[0]
                    self.test_data['customer'] = customer
                    self.test_data['customer_id'] = customer['customer_id']
                    
                    return self.log_step(
                        "Get Customer",
                        True,
                        f"Using customer: {customer.get('customer_name')} (ID: {customer['customer_id']})",
                        customer
                    )
                else:
                    return self.log_step("Get Customer", False, "No customers found in system")
            else:
                return self.log_step(
                    "Get Customer",
                    False,
                    f"Customer fetch failed: HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return self.log_step("Get Customer", False, f"Exception: {e}")

    def step5_create_invoice(self):
        """Step 5: Create invoice with the product"""
        print("\n🧾 STEP 5: Create Invoice with Product")
        
        if 'product_id' not in self.test_data or 'customer_id' not in self.test_data:
            return self.log_step("Create Invoice", False, "Missing product_id or customer_id from previous steps")
        
        invoice_data = {
            "customer_id": self.test_data['customer_id'],
            "invoice_date": datetime.now().strftime("%Y-%m-%d"),
            "due_date": (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d"),
            "payment_terms": "Net 30",
            "items": [
                {
                    "product_id": self.test_data['product_id'],
                    "quantity": 5,
                    "unit_price": 280.0,
                    "discount_percentage": 5,
                    "gst_percentage": 12.0
                }
            ],
            "notes": f"Workflow Test Invoice - Product: {self.test_data['product']['product_code']}"
        }
        
        try:
            response = requests.post(f"{API_BASE_URL}/invoices/", json=invoice_data, timeout=30)
            if response.status_code == 201:
                invoice = response.json()
                self.test_data['invoice'] = invoice
                self.test_data['invoice_id'] = invoice.get('invoice_id') or invoice.get('id')
                
                return self.log_step(
                    "Create Invoice",
                    True,
                    f"Invoice created: {invoice.get('invoice_number')} | Total: ₹{invoice.get('total_amount')}",
                    invoice
                )
            else:
                return self.log_step(
                    "Create Invoice",
                    False,
                    f"Invoice creation failed: HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return self.log_step("Create Invoice", False, f"Exception: {e}")

    def step6_verify_invoice_data(self):
        """Step 6: Verify invoice data integrity and calculations"""
        print("\n🔍 STEP 6: Verify Invoice Data")
        
        if 'invoice_id' not in self.test_data:
            return self.log_step("Verify Invoice Data", False, "No invoice ID from previous step")
        
        invoice_id = self.test_data['invoice_id']
        
        try:
            response = requests.get(f"{API_BASE_URL}/invoices/{invoice_id}", timeout=30)
            if response.status_code == 200:
                invoice = response.json()
                
                # Verify required fields
                required_fields = ['invoice_number', 'customer_id', 'total_amount', 'invoice_date']
                missing_fields = [field for field in required_fields if field not in invoice or invoice[field] is None]
                
                if missing_fields:
                    return self.log_step(
                        "Verify Invoice Data",
                        False,
                        f"Missing required fields: {missing_fields}"
                    )
                
                # Verify calculations (rough check)
                # 5 qty * 280 price = 1400
                # 5% discount = 70, so 1330
                # 12% GST on 1330 = 159.6
                # Total should be around 1489.6
                expected_total_range = (1480, 1500)
                actual_total = float(invoice.get('total_amount', 0))
                
                if not (expected_total_range[0] <= actual_total <= expected_total_range[1]):
                    return self.log_step(
                        "Verify Invoice Data",
                        False,
                        f"Invoice total seems incorrect: ₹{actual_total} (expected range: ₹{expected_total_range[0]}-{expected_total_range[1]})"
                    )
                
                return self.log_step(
                    "Verify Invoice Data",
                    True,
                    f"Invoice data verified: Total ₹{actual_total} | Customer: {invoice.get('customer_id')}",
                    {"total_amount": actual_total, "invoice_number": invoice.get('invoice_number')}
                )
            else:
                return self.log_step(
                    "Verify Invoice Data",
                    False,
                    f"Invoice fetch failed: HTTP {response.status_code}: {response.text}"
                )
        except Exception as e:
            return self.log_step("Verify Invoice Data", False, f"Exception: {e}")

    def run_complete_workflow(self):
        """Run the complete Product to Invoice workflow"""
        print("🚀 PRODUCT TO INVOICE WORKFLOW TEST")
        print("="*80)
        print("Testing complete user journey: Create Product → Verify Batch → Create Invoice")
        print()
        
        # Execute workflow steps
        workflow_steps = [
            self.step1_create_product,
            self.step2_verify_batch_creation,
            self.step3_verify_product_mrp_update,
            self.step4_get_customer,
            self.step5_create_invoice,
            self.step6_verify_invoice_data
        ]
        
        for step_func in workflow_steps:
            if not step_func():
                print(f"\n❌ WORKFLOW FAILED - Stopped at step: {step_func.__name__}")
                return False
        
        # Workflow Summary
        print(f"\n{'='*80}")
        print("🎉 COMPLETE WORKFLOW SUCCESSFUL!")
        print(f"✅ Product Created: {self.test_data['product']['product_code']}")
        print(f"✅ Real Batch Created: {self.test_data['batch']['batch_number']}")
        print(f"✅ Product MRP Updated: ₹{self.test_data['updated_product']['current_mrp']}")
        print(f"✅ Invoice Created: {self.test_data['invoice']['invoice_number']}")
        print(f"✅ Total Amount: ₹{self.test_data['invoice']['total_amount']}")
        print()
        print("🏆 END-TO-END PRODUCT TO INVOICE WORKFLOW IS FULLY FUNCTIONAL!")
        print(f"{'='*80}")
        
        return True

if __name__ == "__main__":
    workflow_tester = ProductToInvoiceWorkflowTest()
    success = workflow_tester.run_complete_workflow()
    exit(0 if success else 1)