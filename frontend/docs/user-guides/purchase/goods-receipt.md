# 📥 Receiving Goods (GRN)

> Learn how to record incoming stock from suppliers.

---

## What is GRN?

**GRN (Goods Receipt Note)** is the process of recording products received from suppliers. This is critical because:
- Stock is added to inventory
- Supplier payable is created
- Batch and expiry are recorded

---

## When to Create GRN

Create a GRN when:
- Products arrive from supplier
- You want to add to stock
- Against a purchase order OR
- Direct purchase (without PO)

---

## Method 1: GRN from Purchase Order

### Step 1: Find the PO
1. Go to **Purchase → Purchase Orders**
2. Find the order (status: Confirmed)
3. Click **Receive Goods**

### Step 2: Enter Receipt Details
- **Receipt Date** - When goods arrived
- **Invoice Number** - Supplier's bill number
- **Invoice Date** - Supplier's invoice date

### Step 3: Verify Items
Products from PO are pre-filled:
- Verify quantities received
- Adjust if different from ordered
- Mark zero for items not received

### Step 4: Enter Batch Details
For each item, enter:
- **Batch Number** - From product packaging
- **Expiry Date** - Important for medicines
- **MRP** - Maximum retail price on pack
- **Purchase Rate** - What you paid

### Step 5: Save GRN
1. Review all entries
2. Click **Save GRN**
3. Stock is immediately updated!

---

## Method 2: Direct GRN (No PO)

For purchases without prior order:

1. Go to **Purchase → New GRN**
2. Select supplier
3. Add products manually
4. Enter batch and pricing details
5. Save

---

## Important Fields

| Field | Why Important |
|-------|---------------|
| **Batch Number** | For tracking specific stock |
| **Expiry Date** | For expiry alerts & FEFO |
| **MRP** | Maximum selling price |
| **Purchase Rate** | Your cost, for profit calculation |

---

## Partial Receiving

If only some goods arrived:

1. Enter quantities actually received
2. Save GRN
3. PO shows "Partially Received"
4. Create another GRN when rest arrives

---

## Common Questions

### Can I add items not in PO?
Yes, you can add additional products during GRN.

### What if expiry date is not on product?
For items without expiry, leave blank or use a far-future date.

### Quantities don't match PO?
Enter actual quantities received. Any difference is tracked.

### Can I edit GRN after saving?
Only draft GRNs can be edited. Confirmed GRNs need adjustments.

---

## Best Practices

✅ **Check items physically** - Count before entering  
✅ **Verify batch/expiry** - Match with product pack  
✅ **Enter supplier invoice** - For payment tracking  
✅ **Review before saving** - Stock updates immediately  

---

**Related Guides**:
- [Creating Purchase Order](./creating-purchase-order.md)
- [Supplier Payments](./supplier-payments.md)
- [Managing Stock](../inventory/managing-stock.md)
