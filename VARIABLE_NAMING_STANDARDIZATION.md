# 🎯 Variable Naming Standardization Guide

**Problem**: Multiple names used for the same data causing confusion and errors  
**Solution**: Clear naming conventions based on database schema  
**Date**: December 3, 2024

---

## 🚨 THE PROBLEM

### **Example: "Price" has 4 different names!**

```javascript
// In EnterpriseCalculator (Line 59):
const rate = parseFloat(
  item.sale_price ||        // Name 1
  item.rate ||              // Name 2
  item.selling_price ||     // Name 3
  item.unit_price           // Name 4
) || 0;
```

**This causes:**
- ❌ Confusion (which one to use?)
- ❌ Bugs (wrong field used)
- ❌ Maintenance nightmares

---

## ✅ THE SOLUTION: Canonical Field Names

### **Rule**: Follow the **Database Schema** as source of truth

---

## 📊 CANONICAL NAMING STANDARD

### **1. PRICE Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Product Master** | `sale_price` | `products.sale_price` | The default selling price of a product |
| **Invoice/Order Item** | `unit_price` | `invoice_items.unit_price`, `order_items.unit_price` | The actual price charged in this transaction |
| **Convenience Alias** | `rate` | (alias for `unit_price`) | Legacy/convenience, maps to `unit_price` |

**Flow:**
```
Product Table (sale_price)
    ↓
    When added to invoice/order
    ↓
Invoice/Order Items (unit_price)
```

**Rules:**
- ✅ **USE `sale_price`** when referring to product's default price
- ✅ **USE `unit_price`** when referring to price in an invoice/order line item
- ✅ **USE `rate` as display alias only** (UI labels, for user familiarity)
- ❌ **NEVER use `selling_price`** (deprecated, remove it)

---

### **2. QUANTITY Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Billed Quantity** | `quantity` | `invoice_items.quantity` | Quantity being sold/charged |
| **Free Quantity** | `free_quantity` | `invoice_items.free_quantity` | Free goods given (not charged) |
| **Base Quantity** | `base_quantity` | `invoice_items.base_quantity` | Quantity in base UOM (for stock calculation) |
| **Total Quantity** | `total_quantity` | (calculated) | `quantity + free_quantity` |

**Rules:**
- ✅ **USE `quantity`** for billable/chargeable quantity
- ✅ **USE `free_quantity`** for free items
- ✅ **USE `base_quantity`** for inventory calculations
- ❌ **NEVER use `qty` or `qty_sold`** (use full word `quantity`)

---

### **3. GST/TAX Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Tax Rate** | `gst_percent` | `invoice_items.igst_rate`, `cgst_rate`, `sgst_rate` | GST percentage |
| **Tax Amount** | `gst_amount` | (calculated) | Total GST amount |
| **CGST Amount** | `cgst_amount` | `invoice_items.cgst_amount` | CGST amount |
| **SGST Amount** | `sgst_amount` | `invoice_items.sgst_amount` | SGST amount |
| **IGST Amount** | `igst_amount` | `invoice_items.igst_amount` | IGST amount |

**Rules:**
- ✅ **USE `gst_percent`** for tax rate (not `tax_rate` or `gst_rate`)
- ✅ **USE `gst_amount`** for total tax (not `tax_amount`)
- ✅ **USE specific names** for CGST/SGST/IGST
- ❌ **NEVER use `tax`** alone (ambiguous)

---

### **4. DISCOUNT Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Discount %** | `discount_percent` | `invoice_items.discount_percent` | Discount percentage |
| **Discount Amount** | `discount_amount` | `invoice_items.discount_amount` | Calculated discount value |

**Rules:**
- ✅ **USE `discount_percent`** (not `discount` or `discount_rate`)
- ✅ **USE `discount_amount`** for calculated value
- ❌ **NEVER use just `discount`** (ambiguous - percent or amount?)

---

### **5. AMOUNT Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Subtotal** | `subtotal` | (calculated) | `quantity × unit_price` |
| **Taxable Amount** | `taxable_amount` | `invoice_items.taxable_amount` | Amount after discount, before tax |
| **Line Total** | `line_total` | `invoice_items.line_total` | Total for this line item |
| **Total Amount** | `total_amount` | (calculated) | Same as `line_total` |
| **Final Amount** | `final_amount` | `invoices.final_amount` | Invoice grand total |

**Rules:**
- ✅ **USE `subtotal`** for price × quantity
- ✅ **USE `taxable_amount`** for amount after discount (before tax)
- ✅ **USE `line_total`** for final line item amount
- ✅ **USE `final_amount`** for invoice grand total

---

### **6. BATCH Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Batch Number** | `batch_number` | `invoice_items.batch_number` | Batch identifier |
| **Batch ID** | `batch_id` | `invoice_items.batch_id` | Foreign key to batches table |
| **Expiry Date** | `expiry_date` | `invoice_items.batch_expiry` | Batch expiry date |
| **Manufacturing Date** | `manufacturing_date` | `batches.manufacturing_date` | Batch manufacturing date |

**Rules:**
- ✅ **USE `batch_number`** (not `batch_no` or `batchNo`)
- ✅ **USE `batch_id`** for foreign key
- ✅ **USE `expiry_date`** (not `expiryDate` or `expiry`)

---

### **7. CUSTOMER/SUPPLIER Fields**

| Context | **Canonical Name** | Database Column | Purpose |
|---------|-------------------|-----------------|---------|
| **Customer ID** | `customer_id` | `customers.customer_id` | Customer identifier |
| **Customer Name** | `customer_name` | `customers.customer_name` | Customer display name |
| **Phone** | `primary_phone` | `customers.primary_phone` | Primary contact |
| **GST Number** | `gst_number` | `customers.gst_number` | GST registration |

**Rules:**
- ✅ **USE `customer_id`** (not `customerId` or `cust_id`)
- ✅ **USE `customer_name`** (not `name` alone)
- ✅ **USE `primary_phone`** (not `phone` or `mobile`)

---

## 🔧 HOW TO IMPLEMENT

### **Phase 1: Update EnterpriseCalculator (High Priority)**

**Current (Confusing):**
```javascript
// Line 59 - TOO MANY OPTIONS!
const rate = parseFloat(
  item.sale_price || 
  item.rate || 
  item.selling_price || 
  item.unit_price
) || 0;
```

**Standardized (Clear):**
```javascript
// Use unit_price as canonical name in calculations
const unitPrice = parseFloat(item.unit_price || item.sale_price || 0);
const quantity = parseFloat(item.quantity) || 0;
const discountPercent = parseFloat(item.discount_percent) || 0;
const gstPercent = parseFloat(item.gst_percent) || 0;

// Calculate
const subtotal = unitPrice * quantity;
const discountAmount = (subtotal * discountPercent) / 100;
const taxableAmount = subtotal - discountAmount;
const gstAmount = (taxableAmount * gstPercent) / 100;
const lineTotal = taxableAmount + gstAmount;

// Return with CANONICAL names
return {
  ...item,
  unit_price: this.round(unitPrice),    // ✅ Canonical
  quantity: quantity,                   // ✅ Canonical
  subtotal: this.round(subtotal),       // ✅ Canonical
  discount_percent: discountPercent,    // ✅ Canonical
  discount_amount: this.round(discountAmount),  // ✅ Canonical
  taxable_amount: this.round(taxableAmount),    // ✅ Canonical
  gst_percent: gstPercent,              // ✅ Canonical
  gst_amount: this.round(gstAmount),    // ✅ Canonical
  line_total: this.round(lineTotal),    // ✅ Canonical
  
  // Optional: Add aliases for backward compatibility (temporary)
  rate: this.round(unitPrice),          // Alias for UI
  total_amount: this.round(lineTotal)   // Alias
};
```

---

### **Phase 2: Update DataTransformer**

**Current (Line 21):**
```javascript
sale_price: parseFloat(
  product.sale_price || 
  product.selling_price || 
  product.rate || 
  product.mrp
) || 0,
```

**Standardized:**
```javascript
// Product context - use sale_price
sale_price: parseFloat(product.sale_price) || parseFloat(product.mrp) || 0,

// Invoice context - transform to unit_price
static transformProductForInvoice(product) {
  return {
    product_id: product.product_id,
    product_name: product.product_name,
    hsn_code: product.hsn_code || '3004',
    unit_price: parseFloat(product.sale_price || product.mrp || 0), // ✅
    quantity: 1,
    discount_percent: 0,
    gst_percent: parseFloat(product.gst_percent || 0),
    batch_number: product.batch_number || null,
    batch_id: product.batch_id || null,
    expiry_date: product.expiry_date || null
  };
}
```

---

### **Phase 3: Update Components**

**Invoice Items Table:**
```javascript
// Column headers - use user-friendly labels
<th>Rate</th>         // Display label
<th>Qty</th>          // Display label
<th>Discount %</th>   // Display label

// But use canonical field names in data
<td>{item.unit_price}</td>     // ✅ Use unit_price
<td>{item.quantity}</td>        // ✅ Use quantity
<td>{item.discount_percent}</td> // ✅ Use discount_percent
```

**EditableCell for Rate:**
```javascript
// Component name can be "RateCell" for user familiarity
<EditableCell
  value={item.unit_price}  // ✅ Use canonical name
  onChange={(value) => onUpdateItem(index, 'unit_price', value)}  // ✅
  label="Rate"  // Display label
/>
```

---

## 📋 MIGRATION CHECKLIST

### **Files to Update:**

**High Priority (Do First):**
- [ ] `services/enterpriseCalculator.js` - Use canonical names
- [ ] `services/dataTransformer.js` - Standardize product → invoice transformation
- [ ] `components/sales/invoice/hooks/useInvoiceLogic.js` - Use canonical names

**Medium Priority:**
- [ ] `components/global/ui/display/ItemsTableKeyboard.js` - Update field references
- [ ] `components/global/ui/display/EditableCell.js` - Use canonical names
- [ ] `components/invoice/components/InvoicePreviewEnterprise.js` - Display correct fields

**Low Priority (Can do later):**
- [ ] Backend API transformers
- [ ] Report components
- [ ] Search/filter components

---

## 🎯 BENEFITS

### **Before Standardization:**
```javascript
// Confusing - which one is correct?
item.rate
item.sale_price
item.unit_price
item.selling_price

// Developer has to guess!
```

### **After Standardization:**
```javascript
// Clear - always use unit_price for invoice items
item.unit_price

// Easy to remember:
// - Products have sale_price
// - Invoice items have unit_price
// - rate is just a display alias
```

**Benefits:**
- ✅ **No confusion** - one canonical name per field
- ✅ **Fewer bugs** - consistent naming = consistent behavior
- ✅ **Easier onboarding** - new developers know what to use
- ✅ **Better maintainability** - changes in one place
- ✅ **Database alignment** - matches schema exactly

---

## 🔍 QUICK REFERENCE

### **Most Common Confusions:**

| ❌ Avoid | ✅ Use Instead | Context |
|---------|---------------|---------|
| `rate` | `unit_price` | In calculations/data |
| `selling_price` | `sale_price` or `unit_price` | Based on context |
| `discount` | `discount_percent` | For percentage |
| `tax_rate` | `gst_percent` | For GST percentage |
| `tax_amount` | `gst_amount` | For GST amount |
| `qty` | `quantity` | Always use full word |
| `total` | `line_total` or `final_amount` | Be specific |
| `batch_no` | `batch_number` | Use full word |
| `expiry` | `expiry_date` | Use full field name |

### **When to Use Each:**

**Product Master Data:**
```javascript
{
  product_id: 123,
  product_name: "Paracetamol",
  sale_price: 10.00,      // ✅ Use in products table
  mrp: 12.00,
  gst_percent: 12
}
```

**Invoice Line Item:**
```javascript
{
  product_id: 123,
  product_name: "Paracetamol",
  unit_price: 10.00,      // ✅ Use in invoice_items
  quantity: 5,
  discount_percent: 10,
  gst_percent: 12,
  line_total: 50.40
}
```

**UI Display (can use friendly labels):**
```html
<th>Rate</th>           <!-- Friendly label -->
<td>{item.unit_price}</td>  <!-- But use canonical field -->
```

---

## 💡 IMPLEMENTATION PRIORITY

### **Phase 1 (This Week): Core Calculator**
- Fix `EnterpriseCalculator.js` to use canonical names
- Update return values to use standard field names
- Test invoice calculations

### **Phase 2 (Next Week): Data Transformation**
- Update `DataTransformer.js`
- Standardize product → invoice item transformation
- Test with real data

### **Phase 3 (Future): Component Updates**
- Update UI components to use canonical names
- Keep display labels user-friendly ("Rate" label, `unit_price` data)
- Update documentation

---

## 📝 SUMMARY

### **The Rule:**
> **Follow the database schema for field names. When in doubt, check the schema docs.**

### **Key Principle:**
> **One concept = One canonical name**

### **Exception:**
> **UI can use friendly labels** (like "Rate") but **data must use canonical names** (like `unit_price`)

---

**Last Updated**: December 3, 2024  
**Status**: Ready for implementation  
**Next**: Update EnterpriseCalculator.js with canonical names

