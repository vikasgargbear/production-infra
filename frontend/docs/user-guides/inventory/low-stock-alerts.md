# 🔔 Low Stock Alerts

> Set up alerts to never run out of important products.

---

## What are Low Stock Alerts?

Low stock alerts notify you when product quantity falls below a minimum level (reorder level). This helps you:
- Reorder before running out
- Avoid lost sales
- Maintain optimal inventory

---

## Setting Reorder Levels

### For New Products
1. Go to **Inventory → Add Product**
2. Find **Reorder Level** field
3. Enter minimum quantity
4. Save product

### For Existing Products
1. Go to **Inventory → Products**
2. Click on product to edit
3. Update **Reorder Level**
4. Save

---

## How to Set the Right Level

Consider:
- **Daily sales** - How much you sell per day
- **Lead time** - Days to get stock from supplier
- **Safety stock** - Buffer for unexpected demand

**Formula**: 
> Reorder Level = (Daily Sales × Lead Time) + Safety Stock

**Example**:
- Sell 10 units/day
- Takes 3 days to restock
- Safety buffer: 10 units
- Reorder Level = (10 × 3) + 10 = **40 units**

---

## Viewing Low Stock Items

### From Dashboard
- Check the **Low Stock** card on dashboard
- Click to see all low stock items

### From Inventory
1. Go to **Inventory → Current Stock**
2. Click **Low Stock** filter
3. See all items below reorder level

---

## Low Stock Notifications

Get alerted automatically:

### On Dashboard
- Red badge shows count of low stock items
- List of items needing reorder

### Email Alerts (if enabled)
1. Go to **Settings → Notifications**
2. Enable **Low Stock Email**
3. Set frequency (daily/weekly)

---

## Taking Action

When stock is low:

1. Review the low stock list
2. Check supplier prices
3. Create **Purchase Order**
4. Track until goods arrive

---

## Bulk Setting Reorder Levels

For many products at once:

1. Go to **Inventory → Products**
2. Click **Export**
3. Update reorder levels in Excel
4. **Import** the file back

---

## Common Questions

### What's a good reorder level?
Depends on product. Fast movers need higher levels. Calculate based on your sales and lead time.

### Can I turn off alerts for some products?
Set reorder level to 0 for items you don't want alerts on.

### What if I'm always showing low stock?
Your reorder levels might be too high. Analyze actual sales and adjust.

---

## Best Practices

✅ **Review monthly** - Adjust levels based on sales trends  
✅ **Prioritize fast movers** - Focus on high-selling items  
✅ **Check seasonality** - Higher levels during peak seasons  
✅ **Act promptly** - Order when alerted, don't delay  

---

**Related Guides**:
- [Managing Stock](./managing-stock.md)
- [Creating Purchase Order](../purchase/creating-purchase-order.md)
