# Invoice Calculation Rules - DO NOT VIOLATE

## CRITICAL: Simple Math Rules

### The Golden Rule
**Net Amount = Taxable Amount + Tax + Round Off + Delivery Charges**

### Step-by-Step Calculation
1. **Subtotal** = Sum of all (quantity × rate) for all items
2. **Discount Amount** = Item-level discounts + Invoice-level discount
3. **Taxable Amount** = Subtotal - Discount Amount
4. **Tax Amount** = Taxable Amount × Tax Rate
5. **Pre-Round Total** = Taxable Amount + Tax Amount + Delivery Charges
6. **Round Off** = Math.round(Pre-Round Total) - Pre-Round Total
7. **Net Amount (Final)** = Pre-Round Total + Round Off

### NEVER DO THIS
❌ **NEVER** subtract discount twice
❌ **NEVER** use invoice.net_amount from state - always calculate it
❌ **NEVER** subtract invoice_discount from Net Amount if it's already in Taxable Amount
❌ **NEVER** overcomplicate simple addition

### Example
```
Subtotal: ₹40.00
Discount: -₹8.00
Taxable: ₹32.00 (40 - 8)
Tax (12%): ₹3.84 (32 × 0.12)
Round Off: ₹0.16
Net Amount: ₹36.00 (32 + 3.84 + 0.16)
```

### Component Rules
1. **InvoicePreviewEnterprise**: Calculate Net Amount as taxable + tax + roundoff + delivery
2. **InvoicePreview**: Same formula - don't use stored values
3. **DocumentFooter**: grandTotal = taxable + tax + roundoff
4. **EnterpriseCalculator**: Single source of truth for calculations

### Testing Checklist
- [ ] Verify: Subtotal - Discount = Taxable Amount
- [ ] Verify: Taxable × Tax% = Tax Amount  
- [ ] Verify: Taxable + Tax + RoundOff + Delivery = Net Amount
- [ ] Verify: Discount is NOT subtracted twice
- [ ] Verify: All components show same totals

## Remember: It's just addition and subtraction!