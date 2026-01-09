# 📋 GST Reports

> Generate GST-compliant reports for tax filing.

---

## Available GST Reports

| Report | Purpose |
|--------|---------|
| **GSTR-1** | Outward supplies (sales) |
| **GSTR-2A/2B** | Inward supplies (purchases) |
| **GSTR-3B** | Monthly summary return |
| **HSN Summary** | HSN-wise breakup |
| **GST Ledger** | Tax account summary |

---

## GSTR-1 Report

For filing your outward supplies:

### What it Shows
- B2B invoices (to registered parties)
- B2C invoices (to unregistered)
- Credit notes
- Debit notes
- Export invoices

### How to Generate
1. Go to **Reports → GST → GSTR-1**
2. Select month/quarter
3. Click **Generate**
4. Review data
5. Export for filing

### Export Format
- **Excel** for review
- **JSON** for direct upload to GST portal

---

## HSN Summary

Break up by HSN code:

### What it Shows
- HSN code
- Description
- UQC (Unit)
- Quantity
- Taxable value
- IGST, CGST, SGST amounts

### How to Use
Required section in GSTR-1. Generate and include in filing.

---

## GSTR-3B Summary

Monthly summary figures:

### What it Shows
- Outward taxable supplies
- Inward supplies
- Tax liability
- Input tax credit
- Net tax payable

### How to Use
1. Generate report
2. Use figures for GSTR-3B filing
3. Cross-verify with portal data

---

## Generating Reports

1. Go to **Reports → GST**
2. Select report type
3. Choose period (month/quarter)
4. Click **Generate**
5. Review data
6. Export in required format

---

## Verifying GST Data

Before filing:

### Check Sales Data
- All invoices are confirmed
- Customer GSTINs are correct
- Invoice numbers are sequential
- Dates are within period

### Check Purchase Data
- All GRNs have supplier invoices
- Supplier GSTINs are correct
- Invoice amounts match

---

## Common Issues

### GSTIN Invalid Error
- Check customer/supplier GST number
- Verify on GST portal
- Correct in party master

### Mismatch with Portal
- Ensure all invoices are entered
- Check for cancelled invoices
- Verify credit notes are recorded

---

## Filing Tips

✅ **Generate early** - Not at last moment  
✅ **Verify GSTINs** - Check for errors  
✅ **Reconcile** - Match with portal data  
✅ **Keep records** - Save exported files  

---

## Common Questions

### Why is my GSTR-1 not matching portal?
Could be: missing invoices, cancelled invoices, wrong dates, or amendments.

### Where do I enter purchase invoices?
In GRN (Goods Receipt). Supplier invoice details go there.

### How do I handle credit notes?
They're recorded as Sales Returns in the system.

---

**Related Guides**:
- [Tax Configuration](../settings/tax-configuration.md)
- [Creating an Invoice](../sales/creating-invoice.md)
