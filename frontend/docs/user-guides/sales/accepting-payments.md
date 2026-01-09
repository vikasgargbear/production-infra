# 💳 Accepting Payments

> Learn how to accept different types of payments from customers.

---

## Payment Methods

We support multiple payment methods to give your customers flexibility:

| Method | Description |
|--------|-------------|
| **Cash** | Physical currency |
| **Card** | Debit or Credit card |
| **UPI** | Google Pay, PhonePe, Paytm, etc. |
| **Bank Transfer** | NEFT/RTGS/IMPS |
| **Credit** | Customer pays later |
| **Cheque** | Bank cheque |
| **Split** | Combination of methods |

---

## Accepting Payment During Invoice

### Cash Payment

1. Select **Cash** as payment method
2. Enter the amount received
3. System shows change to return (if overpaid)
4. Save invoice

### Card Payment

1. Select **Card** as payment method
2. Process payment on your card machine
3. Optionally enter last 4 digits for reference
4. Save invoice

### UPI Payment

1. Select **UPI** as payment method
2. Customer scans your QR or sends to your UPI ID
3. Verify payment is received
4. Optionally enter UPI transaction ID
5. Save invoice

### Credit Sale (Pay Later)

1. Select **Credit** as payment method
2. The full amount becomes "outstanding"
3. Save invoice
4. Customer can pay anytime later

---

## Split Payment

When customer pays using multiple methods:

1. Select **Split Payment**
2. Enter **Cash Amount** received
3. Select second payment method (Card/UPI)
4. Remaining amount is assigned to second method
5. Save invoice

**Example**:
- Total: ₹1,000
- Cash: ₹600
- UPI: ₹400 (automatically calculated)

---

## Collecting Outstanding Payments

When a customer comes to pay their due amount:

### Option 1: From Dashboard
1. Go to **Quick Actions → Record Payment**
2. Search for customer
3. Enter payment amount
4. Select payment method
5. Payment is recorded

### Option 2: From Outstanding
1. Go to **Sales → Outstanding**
2. Find the customer
3. Click **Receive Payment**
4. Enter amount and method
5. Payment is allocated to invoices

### Option 3: While Creating New Invoice
1. While making a new sale
2. At payment, you'll see outstanding balance
3. Collect both new sale + outstanding together

---

## Payment Allocation

When a customer has multiple unpaid invoices:

1. Payment is auto-allocated to oldest invoices first
2. Or you can manually choose which invoices to settle
3. Partial payments are supported

**Example**:
- Customer has 3 invoices: ₹500, ₹300, ₹200
- Pays ₹600
- Auto-allocation: ₹500 (Invoice 1) + ₹100 (partial Invoice 2)

---

## Viewing Payment History

To see all payments:

1. Go to **Finance → Payments** or **Sales → Collections**
2. Filter by date, customer, or method
3. Click any payment to see details

---

## Refunds

To refund a payment:

1. Create a **Sales Return** for the items
2. Choose **Refund** as credit note type
3. Issue refund via same payment method

See: [Sales Returns Guide](./sales-returns.md)

---

## Common Questions

### What if card payment fails?
- Cancel the transaction on card machine
- Select a different payment method on the invoice
- Try card again if needed

### Can I change payment method after saving?
- For draft invoices, yes
- For confirmed invoices, record as adjustment in payments

### How do I track UPI payments?
- Enter the UPI transaction ID when recording
- View in payment history with UPI reference

### What about post-dated cheques?
- Select Cheque as payment method
- Enter cheque number and date
- Mark as cleared when it's deposited

---

**Related Guides**:
- [Creating an Invoice](./creating-invoice.md)
- [Managing Outstanding](./outstanding-payments.md)
- [Sales Returns](./sales-returns.md)
