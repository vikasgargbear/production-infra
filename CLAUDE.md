## Important Reminders

- Make sure no alterations to database, they are locked
- Do not use SQL tables for schema, always use '/Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/database/schema-docs'
- never assume variable name, check schema docs or ask user
- don't ask permission for curl command or sleep commands

## Database Query Execution

To run SQL queries on Railway database:
```bash
# Run single query
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "YOUR_SQL_QUERY"

# Run SQL file
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -f /path/to/file.sql

# Example: Check table structure
psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -c "\d financial.payments"
```

## COMPLETED MODULES - DO NOT MODIFY WITHOUT DOUBLE CHECKING

### Invoice System (FULLY WORKING)
- **Backend invoice routes are production-ready** - DO NOT modify without careful testing
- **Calculation Logic (Working Correctly)**:
  - Item discount applied BEFORE GST calculation
  - Subtotal → Apply Discounts → Taxable Amount → Apply GST → Add Delivery → Round Off → Final Amount
  - credit_amount = final_amount - paid_amount (auto-calculated by trigger)
- **Payment System**:
  - Valid payment methods: cash, card, upi, bank, check
  - Credit is NOT a payment method - it's the unpaid balance
  - Split payments fully functional
  - payment_status: 'paid', 'partial', 'pending'
- **Frontend Integration**:
  - SplitPayment component shows "₹X goes to credit" clearly
  - InvoiceFlow.js properly sends payments array to backend
  - Frontend calculations for display only - backend is source of truth
- **Database**:
  - Run Section 22 of MASTER_DATABASE_FIXES.sql for credit_amount column
  - Trigger auto-calculates credit_amount on insert/update