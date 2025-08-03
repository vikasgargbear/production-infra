# Invoice Validation & Testing Tools

This folder contains validation and testing tools for invoice creation and database operations.

## 📁 Main Scripts

### Core Invoice Creation
- **`complete_invoice_flow.py`** - Main invoice creation class that fetches all data from backend
- **`multi_item_invoice.py`** - Handles invoices with multiple products
- **`working_invoice_test.py`** - Working test with correct column names

### Validation Tools
- **`price_validator.py`** - Validates pricing calculations
- **`validate_pricing.py`** - Price and tax validation from backend
- **`check_invoice_items.py`** - Checks if invoice items are saved

### Testing & Debugging
- **`test_backend_apis.py`** - Tests backend API endpoints
- **`debug_invoice_creation.py`** - Debug tool for invoice issues
- **`final_corrected_invoice_test.py`** - Test with corrected pricing
- **`proper_invoice_test.py`** - Gets all data from backend APIs

### Utilities
- **`find_valid_org.py`** - Finds valid org_id from database
- **`check_actual_data.py`** - Checks actual database values
- **`test_invoice_creation.py`** - Basic invoice creation test

## 🚀 Usage Example

```python
from complete_invoice_flow import InvoiceCreator

creator = InvoiceCreator()
invoice = creator.create_invoice(
    customer_name="Basim",
    product_name="Atlas",
    quantity=10,
    payment_method="cash"
)
```

## 📋 Test Coverage

The script validates:

1. **Customer Management**
   - Search for existing customer by phone
   - Create new customer if not found
   - Link customer to invoice

2. **Invoice Creation**
   - Product validation
   - Tax calculations (CGST/SGST/IGST)
   - Discount application
   - Additional charges (transportation, etc.)
   - Payment method tracking

3. **Database Persistence**
   - Invoice saved to database
   - Invoice items saved
   - Inventory deduction (if applicable)
   - Invoice retrieval verification

## 📊 Key Findings

### Correct Values to Use:
- **Organization ID**: `ad808530-1ddb-4377-ab20-67bef145d80d`
- **Atlas Product Price**: ₹11 per unit (not ₹100)
- **GST Rate**: 12% (not 18%)
- **API Endpoint**: `/api/invoices/` (with trailing slash)

### Correct Column Names:
- Use `discount_percent` NOT `discount_percentage`
- Use `cgst_rate`, `sgst_rate`, `igst_rate` NOT `gst_percentage`
- Use `line_total` NOT `line_total_with_tax`
- Include required fields: `uom`, `pack_type`, `taxable_amount`, `total_tax_amount`

## 🛠️ Configuration

The scripts use:
- **API Base URL**: `https://pharma-backend-production-0c09.up.railway.app/api`
- **Organization ID**: `ad808530-1ddb-4377-ab20-67bef145d80d` (actual from database)

## ✅ Success Criteria

The test is successful when:
1. Customer is found or created
2. Invoice is created with HTTP 200/201 response
3. Invoice number is generated
4. Invoice can be retrieved from database

## ❌ Common Issues

1. **Missing columns**: Ensure database has all required columns (gst_percentage, line_total, etc.)
2. **Schema references**: Check that all queries use correct schema prefixes (sales.invoice_items)
3. **Column names**: Verify column names match schema documentation
4. **API availability**: Ensure backend is deployed and healthy

## 📝 Creating Custom Test Cases

Create a new JSON file with this structure:

```json
{
  "customer_name": "Customer Name",
  "primary_phone": "9999999999",
  "items": [
    {
      "product_name": "Product Name",
      "quantity": 10,
      "unit_price": 100,
      "discount_percentage": 5,
      "gst_percentage": 18
    }
  ],
  "payment_method": "cash",
  "notes": "Test invoice"
}
```

The script will calculate totals automatically if not provided.

## 🔄 Workflow Sequence

```
1. Load JSON input
   ↓
2. Search/Create Customer
   ↓
3. Prepare Invoice Data
   ↓
4. POST to /api/invoices
   ↓
5. Verify Invoice Created
   ↓
6. Report Results
```

## 📈 Output

The script provides colored console output:
- ✅ Green: Success
- ❌ Red: Error
- ⚠️ Yellow: Warning
- ℹ️ Blue: Information
- 📍 Bold: Step markers

## 🧪 Test Execution

```bash
# Make script executable
chmod +x test_invoice_creation.js

# Run test
./test_invoice_creation.js

# Or use Node directly
node test_invoice_creation.js
```

## 📚 Related Documentation

- **Schema Documentation**: `/database/schema-docs/`
- **Master Schema Index**: `/database/schema-docs/MASTER_SCHEMA_INDEX.md`
- **Schema Validation**: `/database/schema-docs/validate_schemas.py`
- **API Routes**: `/backend/app/api/routes/invoices.py`