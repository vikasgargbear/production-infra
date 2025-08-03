# Invoice Creation Validation Suite

This folder contains validation tests for the end-to-end invoice creation workflow.

## 📁 Files

- **`test_invoice_creation.js`** - Main test script for invoice creation
- **`sample_invoice_input.json`** - Sample JSON input with Basim invoice data
- **Additional test cases can be added as JSON files**

## 🚀 Usage

### Run with default sample data (Basim invoice):
```bash
node test_invoice_creation.js
```

### Run with custom JSON input:
```bash
node test_invoice_creation.js custom_invoice.json
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

## 📊 Sample Invoice Details

The default `sample_invoice_input.json` contains:
- **Customer**: Basim (Phone: 7738228969)
- **Product**: Atlas Tablet x 12 units
- **Pricing**: ₹100 per unit
- **Discount**: 10% (₹120)
- **GST**: 18% (₹194.40)
- **Transportation**: ₹20
- **Total**: ₹1,294.40
- **Payment**: Cash (Paid in full)

## 🛠️ Configuration

The script uses these defaults:
- **API Base URL**: `https://pharma-backend-production-0c09.up.railway.app/api`
- **Organization ID**: `11111111-1111-1111-1111-111111111111`

To use different endpoints, modify the constants in `test_invoice_creation.js`.

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

- Database Schema: `/database/schema-docs/04_sales_schema.md`
- API Routes: `/backend/app/api/routes/invoices.py`
- Frontend Flow: `/frontend/src/components/sales/InvoiceFlow.js`