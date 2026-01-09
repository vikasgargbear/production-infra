# 📦 Adding Products

> Learn how to add new products to your inventory catalog.

---

## Overview

Adding products correctly is important for accurate invoicing, stock tracking, and reporting. This guide covers everything you need to know.

---

## Step 1: Open Add Product

1. Go to **Inventory → Products**
2. Click **+ Add Product** button

Or use the shortcut: **Ctrl + Shift + N**

---

## Step 2: Basic Information

Fill in the essential details:

| Field | Description | Required |
|-------|-------------|----------|
| **Product Name** | Full name as it appears on invoices | ✅ Yes |
| **Generic Name** | Salt/composition (for medicines) | Optional |
| **Product Code** | Your SKU or article number | Recommended |
| **Barcode** | Scan or enter barcode | Optional |
| **Category** | For organizing products | Recommended |

> 💡 **Tip**: Use clear, searchable names. "Paracetamol 500mg Tablets 10s" is better than "Para Tab".

---

## Step 3: Pricing

Set up your prices:

| Field | Description |
|-------|-------------|
| **MRP** | Maximum Retail Price (printed on pack) |
| **Purchase Price** | What you pay the supplier |
| **Sale Price** | What you charge customers |
| **GST Rate** | Applicable tax rate (5%, 12%, 18%, etc.) |
| **HSN Code** | GST classification code |

### Margin Calculation
- System shows profit margin automatically
- Sale Price should be between Purchase Price and MRP

---

## Step 4: Inventory Settings

Configure stock management:

| Field | Description |
|-------|-------------|
| **Unit** | How you sell (Tablet, Strip, Box, Kg, Ltr, etc.) |
| **Pack Size** | Units per pack (e.g., 10 tablets per strip) |
| **Reorder Level** | Minimum stock before alert |
| **Track Batches** | Enable for expiry tracking |

---

## Step 5: Drug Details (For Medicines)

If it's a medicine:

| Field | Description |
|-------|-------------|
| **Drug Schedule** | H, H1, X, or Narcotic |
| **Prescription Required** | Yes/No |
| **Manufacturer** | Pharma company name |
| **Store Cold** | Needs refrigeration? |

---

## Step 6: Save Product

1. Review all information
2. Click **Save Product**
3. Product is now in your catalog

---

## Adding Stock for New Product

After creating the product, add initial stock:

### Option 1: Via Purchase
- Create a purchase order for the product
- Receive goods (GRN)
- Stock is automatically added

### Option 2: Opening Stock
1. Go to **Inventory → Stock Adjustments**
2. Select **Opening Stock**
3. Enter product, batch, expiry, quantity
4. Save

---

## Bulk Product Upload

For adding many products at once:

1. Go to **Inventory → Products**
2. Click **Bulk Upload**
3. Download the Excel template
4. Fill in product details
5. Upload completed file
6. Review and confirm

---

## Editing Products

To update product details:

1. Go to **Inventory → Products**
2. Find the product (search or browse)
3. Click on product name or Edit icon
4. Make changes
5. Save

> ⚠️ **Note**: Changes to MRP/price don't affect existing stock batches.

---

## Common Questions

### What if I don't know the HSN code?
Search online for "HSN code for [product type]" or ask your CA/accountant.

### Can I change the product name later?
Yes, you can edit anytime. All invoices will show the updated name.

### What's the difference between Unit and Pack Size?
- **Unit**: How you bill (e.g., Strip)
- **Pack Size**: Pieces per unit (e.g., 10 tablets per strip)

### Why set a reorder level?
You'll get alerts when stock falls below this level, so you never run out.

---

## Best Practices

✅ **Use consistent naming** - Helps searching  
✅ **Enable batch tracking** - Essential for expiry dates  
✅ **Set reorder levels** - Never run out of fast-movers  
✅ **Include barcode** - Faster billing  
✅ **Verify HSN codes** - For GST compliance  

---

**Related Guides**:
- [Managing Stock](./managing-stock.md)
- [Batch & Expiry Tracking](./batch-expiry.md)
- [Low Stock Alerts](./low-stock-alerts.md)
