# 💹 Tax Configuration

> Set up GST and tax settings.

---

## Accessing Tax Settings

1. Go to **Settings → Tax Configuration**
2. View and edit tax rates

---

## Business Tax Details

| Setting | Description |
|---------|-------------|
| **GST Number** | Your GSTIN |
| **State** | Registered state |
| **Registration Type** | Regular/Composition |

---

## Tax Rates

Configure available tax rates:

### Standard Rates
| Rate | Typical Products |
|------|------------------|
| **0%** | Essential items, exempted |
| **5%** | Essential foods, medicines |
| **12%** | Standard goods |
| **18%** | Most products, services |
| **28%** | Luxury items |

### Managing Rates
- View all configured rates
- Set which ones are active
- Set default for new products

---

## HSN Codes

HSN (Harmonized System of Nomenclature) codes classify products:

1. Required for GST filing
2. Assigned to each product
3. Determines applicable tax rate

### Managing HSN
1. Go to **Settings → HSN Codes**
2. Add frequently used codes
3. Codes appear in product dropdown

---

## Tax Calculation

How taxes are calculated:

### Intra-State (Within State)
- CGST: Half of GST rate
- SGST: Half of GST rate
- Example: 18% GST = 9% CGST + 9% SGST

### Inter-State (Different State)
- IGST: Full GST rate
- Example: 18% IGST

System determines automatically based on customer state.

---

## Tax-Inclusive Pricing

Two options:

### Exclusive (Default)
- Price + Tax = Final amount
- Example: ₹100 + 18% = ₹118

### Inclusive
- Tax included in price
- Example: ₹118 includes 18% tax
- Tax is back-calculated

---

## Common Questions

### How do I change a product's GST rate?
Edit the product and update GST rate field.

### Why is IGST showing instead of CGST/SGST?
Customer is in different state than your registered state.

### Are reverse charge items handled?
Yes, mark items as reverse charge in product settings.

---

**Related Guides**:
- [GST Reports](../reports/gst-reports.md)
- [Invoice Settings](./invoice-settings.md)
