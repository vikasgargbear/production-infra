# Payment and Invoice Display Issues - Fix Plan

## Problems Identified:

1. **Company Details Not Loading**
   - Shows "Your Company Name" instead of actual company
   - Missing GSTIN, Drug License info
   - CompanyContext doesn't fetch complete data

2. **Hardcoded Bank Details**
   - Invoice shows "SBI", "1234567890", "SBIN0001234"
   - Selected bank account from payment section ignored
   - No integration with actual bank accounts

3. **Missing QR Code Support**
   - No QR code field in payment settings
   - No display in invoice

4. **Payment Component Issues**
   - Poor space utilization
   - Too much information displayed
   - Bank account selection not reflected

## Solutions:

### 1. Fix Company Info Loading
```javascript
// Update CompanyContext.js to fetch complete info
const loadCompanyData = async () => {
  try {
    // Fetch company profile with bank accounts
    const response = await api.get('/company/profile');
    setCompanyInfo({
      name: response.data.company_name,
      address: response.data.address,
      phone: response.data.phone,
      email: response.data.email,
      gst: response.data.gstin,
      drugLicense: response.data.drug_license_no,
      bankAccounts: response.data.bank_accounts || [],
      paymentQR: response.data.payment_qr_code,
      logo: response.data.logo
    });
  } catch (error) {
    console.error('Failed to load company info:', error);
  }
};
```

### 2. Fix Invoice Preview Bank Details
```javascript
// InvoicePreview.js - Use selected bank account
const selectedBank = invoice.bank_account_id 
  ? companyInfo.bankAccounts?.find(acc => acc.id === invoice.bank_account_id)
  : companyInfo.bankAccounts?.[0]; // Default to first account

// Display actual bank details
<div className="bank-details">
  <h3>Bank Details</h3>
  {selectedBank ? (
    <>
      <p>{selectedBank.bank_name}</p>
      <p>A/C: {selectedBank.account_number}</p>
      <p>IFSC: {selectedBank.ifsc_code}</p>
      <p>Branch: {selectedBank.branch_name}</p>
    </>
  ) : (
    <p className="text-gray-500">No bank account selected</p>
  )}
</div>
```

### 3. Add QR Code Support
```javascript
// Add QR code to company settings
<div className="qr-code-section">
  <label>Payment QR Code</label>
  <input 
    type="file" 
    accept="image/*"
    onChange={handleQRUpload}
  />
  {companyInfo.paymentQR && (
    <img src={companyInfo.paymentQR} alt="Payment QR" />
  )}
</div>

// Display in invoice
{companyInfo.paymentQR && (
  <div className="qr-code">
    <img src={companyInfo.paymentQR} width="150" />
    <p className="text-xs">Scan to Pay</p>
  </div>
)}
```

### 4. Improve Payment Component
```javascript
// Compact payment display
const PaymentMethodCompact = ({ payments, totalAmount }) => {
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const creditAmount = totalAmount - totalPaid;
  
  return (
    <div className="payment-summary grid grid-cols-2 gap-2">
      <div>
        <span className="text-sm text-gray-600">Total:</span>
        <span className="font-bold">₹{totalAmount}</span>
      </div>
      
      {payments.map(payment => (
        <div key={payment.id} className="text-sm">
          <span>{payment.method}:</span>
          <span>₹{payment.amount}</span>
        </div>
      ))}
      
      {creditAmount > 0 && (
        <div className="text-sm text-orange-600">
          <span>Credit:</span>
          <span>₹{creditAmount}</span>
        </div>
      )}
    </div>
  );
};
```

### 5. Integration Flow
```
User selects bank account in payment → 
Store in invoice.bank_account_id → 
Pass to InvoicePreview → 
Display selected bank details
```

## Implementation Steps:

1. **Update CompanyContext** to fetch complete company profile including bank accounts
2. **Fix InvoicePreview** to use selected bank account instead of hardcoded values
3. **Add QR code field** to company settings
4. **Create compact payment component** for better space utilization
5. **Ensure bank selection** flows through to invoice preview

## Database Requirements:

```sql
-- Add to companies table
ALTER TABLE companies ADD COLUMN payment_qr_code TEXT;

-- Ensure bank_accounts table has all fields
-- bank_name, account_number, ifsc_code, branch_name, account_holder_name
```

## API Endpoints Needed:

```
GET /api/company/profile - Full company info with bank accounts
POST /api/company/qr-code - Upload payment QR
GET /api/company/bank-accounts - List all bank accounts
```