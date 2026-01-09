# 📅 Batch & Expiry Tracking

> Manage product batches and monitor expiry dates.

---

## What is Batch Tracking?

**Batch tracking** lets you track products by their manufacturing batch. Each batch has:
- Unique batch number
- Expiry date
- MRP
- Purchase rate

This is essential for medicines and perishables.

---

## Why Track Batches?

| Reason | Benefit |
|--------|---------|
| **Expiry Management** | Get alerts before products expire |
| **FEFO Compliance** | First Expiry First Out selling |
| **Recall Support** | Find specific batch if needed |
| **Price Tracking** | Different rates per batch |

---

## Enabling Batch Tracking

For new products:
1. Go to **Inventory → Add Product**
2. Enable **Track Batches** toggle
3. Save product

For existing products:
1. Go to **Inventory → Products**
2. Edit the product
3. Enable **Track Batches**
4. Save

---

## Adding Batches

Batches are created during **GRN (Goods Receipt)**:

1. Receive goods from supplier
2. For each item, enter:
   - **Batch Number** - From packaging
   - **Expiry Date** - From packaging
   - **MRP** - Printed MRP
   - **Quantity** - Received amount
3. Save GRN

---

## Viewing Batches

To see all batches for a product:

1. Go to **Inventory → Current Stock**
2. Click on a product
3. View **Batches** tab
4. See all batches with:
   - Batch number
   - Expiry date
   - Available quantity
   - MRP

---

## Expiry Alerts

Get notified before products expire:

### Setting Alert Period
1. Go to **Settings → Inventory Settings**
2. Set **Expiry Alert Days** (e.g., 60 days)
3. Products expiring within this period are flagged

### Viewing Expiring Items
1. Go to **Inventory → Expiring Soon**
2. See all items with upcoming expiry
3. Filter by date range

---

## Selling with FEFO

**FEFO = First Expiry First Out**

When selling batch-tracked items:
1. System suggests oldest expiry batch
2. You can accept or choose different batch
3. Ensures oldest stock sells first

---

## Handling Expired Items

When items expire:

1. View expired items in **Inventory → Expired Stock**
2. For each item:
   - Create **Stock Adjustment** (reduce stock)
   - Select reason: "Expired"
3. Document for records

---

## Common Questions

### Can I sell expired items?
System warns you, but doesn't hard-block. For medicines, you shouldn't sell expired items.

### What if I don't know the batch?
For non-batch items, you don't need to enter. But for medicines, it's required.

### How do I change expiry date?
Edit the batch in **Inventory → Batches**. Should only fix entry errors.

### Multiple expiry dates in one sale?
Yes, system tracks each batch quantity sold.

---

## Best Practices

✅ **Enter accurately** - Check packaging carefully  
✅ **Review weekly** - Check expiring items  
✅ **Sell FEFO** - Avoid expiry losses  
✅ **Remove promptly** - Don't keep expired on shelf  

---

**Related Guides**:
- [Adding Products](./adding-products.md)
- [Managing Stock](./managing-stock.md)
- [Receiving Goods](../purchase/goods-receipt.md)
