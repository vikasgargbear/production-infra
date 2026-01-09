# 📊 Managing Stock

> View, track, and adjust your inventory stock levels.

---

## Viewing Current Stock

1. Go to **Inventory → Current Stock**
2. You'll see all products with their stock levels

### What You'll See

| Column | Description |
|--------|-------------|
| **Product Name** | Item description |
| **Product Code** | SKU/article number |
| **Category** | Product category |
| **Available Qty** | Stock free for sale |
| **Reserved Qty** | Stock reserved for orders |
| **Reorder Level** | Minimum desired stock |
| **Value** | Total stock value |

---

## Filtering Stock

Use filters to find what you need:

| Filter | Use For |
|--------|---------|
| **Search** | Find specific product |
| **Category** | View by category |
| **Low Stock** | Items below reorder level |
| **Expiring Soon** | Items expiring within 30 days |
| **Out of Stock** | Zero stock items |

---

## Stock Card View

Click on any product to see its stock card:

- **Current balance** across all batches
- **Movement history** (in/out)
- **Batch details** with expiry dates
- **Recent transactions**

---

## Stock Adjustments

When you need to correct stock levels:

### When to Adjust
- Physical stock differs from system
- Damaged goods discovered
- Expired stock removed
- Stock audit corrections

### How to Adjust

1. Go to **Inventory → Stock Adjustments**
2. Click **New Adjustment**
3. Select the product
4. Enter adjustment details:
   - **Adjustment Type**: Add or Reduce
   - **Quantity**: Amount to adjust
   - **Reason**: Why adjusting (Damage, Loss, Audit, etc.)
   - **Notes**: Additional details
5. Click **Save Adjustment**

> ⚠️ **Important**: All adjustments are recorded for audit purposes.

---

## Physical Stock Count

For periodic stock verification:

### Process
1. Print stock list: **Inventory → Current Stock → Print**
2. Physically count all items
3. Compare with system count
4. Make adjustments for differences

### Tips
- Count section by section
- Have two people for accuracy
- Do it during closed hours if possible
- Focus on high-value items

---

## Stock Valuation

View the value of your inventory:

1. Go to **Inventory → Current Stock**
2. Total value shows at the bottom
3. Or go to **Reports → Stock Valuation Report**

### Valuation Methods
Stock is typically valued at purchase cost (average cost method).

---

## Common Stock Scenarios

### "I received damaged goods"
1. Don't add to sellable stock
2. Create adjustment to remove
3. Select reason: "Damaged"
4. Follow up with supplier if needed

### "Physical count doesn't match"
1. Recount to confirm
2. Check recent transactions
3. Make stock adjustment
4. Document the reason

### "Stock shows negative"
This indicates a data issue:
1. Check if purchase/GRN was missed
2. Add missing purchase entry
3. Or create opening stock adjustment

---

## Common Questions

### Why is my stock different from physical count?
Common reasons:
- Sales not recorded
- Purchases not received in system
- Items damaged but not adjusted
- Theft or pilferage

### Can I see stock history?
Yes! Click on product → Stock Card to see all movements.

### How do I track stock by location?
Enable locations in Settings, then assign stock to locations.

### What does "Reserved" stock mean?
Stock allocated to confirmed orders not yet delivered.

---

## Best Practices

✅ **Do physical counts regularly** - Monthly for fast movers  
✅ **Investigate variances** - Don't just adjust blindly  
✅ **Document reasons** - Helps identify patterns  
✅ **Secure adjustments** - Limit who can make adjustments  
✅ **Review reports** - Check adjustment reports monthly  

---

**Related Guides**:
- [Adding Products](./adding-products.md)
- [Batch & Expiry Tracking](./batch-expiry.md)
- [Low Stock Alerts](./low-stock-alerts.md)
