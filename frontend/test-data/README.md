# Test Data for Returns Management

This directory contains comprehensive test data for testing the Returns Management functionality in the AASO Pharmaceutical ERP system.

## 📁 Files Included

### Master Data
- **`customers.json`** - 3 sample customers (medical stores/pharmacies)
- **`suppliers.json`** - 3 sample suppliers (pharmaceutical distributors)  
- **`products.json`** - 5 pharmaceutical products with inventory details

### Transaction Data  
- **`sale-invoices.json`** - 3 sample sale invoices with line items
- **`purchase-bills.json`** - 3 sample purchase bills with line items

### Import Script
- **`import-data.sh`** - Automated script to import all test data into backend

## 🚀 Quick Start

### 1. Start Backend Server
Ensure your backend server is running on `http://localhost:8000`

### 2. Import Test Data
```bash
cd test-data
./import-data.sh
```

### 3. Test Returns Functionality
After import, you can test:

**Sale Returns:**
- Invoice: INV-2025-001 (ABC Medical Store) - ₹1,400
- Invoice: INV-2025-002 (XYZ Pharmacy) - ₹1,030
- Invoice: INV-2025-003 (HealthCare Plus) - ₹2,072

**Purchase Returns:**
- Bill: PB-2025-001 (MedSupply India) - ₹2,688
- Bill: PB-2025-002 (PharmaDistributors) - ₹2,016  
- Bill: PB-2025-003 (Generic Medicines) - ₹3,584

## 📊 Test Data Details

### Products Available for Returns
1. **Paracetamol 500mg** - Analgesic, 12% GST
2. **Amoxicillin 250mg** - Antibiotic, 12% GST
3. **Crocin Advanced 650mg** - Analgesic, 12% GST
4. **Vitamin D3 60000 IU** - Vitamin, 18% GST
5. **Azithromycin 500mg** - Antibiotic, 12% GST

### Return Scenarios to Test

**Sale Return Scenarios:**
- Customer change of mind
- Defective product  
- Wrong item delivered
- Expired product
- Damaged in transit

**Purchase Return Scenarios:**
- Damaged goods received
- Quality issues
- Wrong product delivered
- Excess quantity
- Pricing disputes

## 🧪 Testing Checklist

### Basic Functionality
- [ ] Switch between Sale/Purchase return types
- [ ] Search and select original invoices/bills
- [ ] Add/remove items for return
- [ ] Calculate return amounts with taxes
- [ ] Process returns and generate credit/debit notes

### Validation Testing
- [ ] Required field validation
- [ ] Return quantity limits (cannot exceed original)
- [ ] Custom reason for "Other" category
- [ ] Date validation (cannot be future date)

### UI/UX Testing  
- [ ] Compact interface works on different screen sizes
- [ ] Dropdown selections are user-friendly
- [ ] Search functionality is responsive
- [ ] Error messages are clear and helpful

## 🔄 Resetting Test Data

To reset and re-import test data:
1. Clear the database (or use database reset endpoint)
2. Run `./import-data.sh` again

## 📝 Notes

- All amounts include GST calculations
- Batch numbers and expiry dates are included for pharmaceutical compliance
- Customer/Supplier GST numbers follow Indian GST format
- HSN codes are accurate for pharmaceutical products
- Test data covers both B2B and B2C scenarios