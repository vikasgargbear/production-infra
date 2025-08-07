# Sales Module Documentation

## Overview
The Sales module is a comprehensive solution for managing all sales-related operations in the pharma ERP system. It provides functionality for creating invoices, managing sales orders, handling delivery challans, and tracking sales performance.

## Module Structure

### Component Hierarchy
```
sales/
├── SalesHub.tsx              # Main hub component with navigation
├── InvoiceFlow.js            # Invoice creation workflow
├── SalesOrderFlow.js         # Sales order management
├── InvoiceManagement.js      # Invoice listing and management
├── SalesOrderManagement.js   # Sales order listing
└── components/               # Reusable components
    ├── InvoiceSummaryTop.tsx
    ├── SalesOrderSummaryTop.tsx
    ├── ChallanSummaryTop.tsx
    ├── SalesHeader.tsx
    ├── BillSummary.tsx
    ├── TransportDetails.tsx
    ├── PaymentDetails.tsx
    ├── PaymentRecordingModal.tsx
    ├── SalesCustomerSelection.tsx
    ├── SalesTypeSelector.tsx
    ├── ConvertToInvoiceButton.tsx
    └── ImportDocumentModal.tsx
```

## Key Features

### 1. Invoice Management
- **Create Invoice**: Step-by-step invoice creation with customer selection, product addition, and pricing
- **Invoice Preview**: Real-time preview before saving
- **Print/Share**: Generate PDF and share via various channels
- **GST Calculation**: Automatic GST calculation based on product HSN codes
- **Discount Management**: Item-level and invoice-level discounts

### 2. Sales Order Management
- **Create Sales Order**: Create orders for future delivery
- **Convert to Invoice**: One-click conversion from order to invoice
- **Order Tracking**: Track order status and fulfillment
- **Approval Workflow**: Multi-level approval for high-value orders

### 3. Delivery Challan
- **Challan Creation**: Create delivery challans for goods dispatch
- **Link to Invoice**: Convert challans to invoices after delivery
- **Transport Details**: Capture vehicle, LR number, and transport company

### 4. Customer Management Integration
- **Customer Search**: Real-time customer search with autocomplete
- **Credit Check**: Automatic credit limit validation
- **Outstanding Display**: Show customer outstanding while creating invoice
- **New Customer**: Quick customer creation from invoice flow

### 5. Product Management Integration
- **Product Search**: Smart product search with batch selection
- **Batch Tracking**: Select specific batches with expiry dates
- **Stock Validation**: Real-time stock availability check
- **Pricing**: Automatic pricing based on customer category

## Global Components Used

The Sales module uses the following global components for consistency:

1. **ItemsTable**: For managing invoice line items
2. **CustomerSearch**: For customer selection
3. **ProductSearchSimple**: For product search and selection
4. **SummaryCard**: For displaying invoice totals
5. **StatusBadge**: For showing invoice/order status
6. **DataTable**: For listing invoices and orders
7. **DatePicker**: For date selections
8. **Select**: For dropdown selections
9. **NumberInput/CurrencyInput**: For numeric inputs

## API Integration

### Endpoints Used
```javascript
// Invoice APIs
POST   /api/invoices           - Create invoice
GET    /api/invoices/:id        - Get invoice details
PUT    /api/invoices/:id        - Update invoice
GET    /api/invoices            - List invoices
POST   /api/invoices/calculate  - Calculate totals

// Sales Order APIs
POST   /api/sales-orders        - Create sales order
GET    /api/sales-orders/:id    - Get order details
PUT    /api/sales-orders/:id    - Update order
POST   /api/sales-orders/:id/convert - Convert to invoice

// Customer APIs
GET    /api/customers/search    - Search customers
GET    /api/customers/:id/credit - Check credit limit

// Product APIs
GET    /api/products/search     - Search products
GET    /api/products/:id/stock  - Check stock
```

## State Management

### Invoice State Structure
```javascript
{
  invoice_no: string,
  invoice_date: string,
  customer_id: number,
  customer_details: object,
  items: [{
    product_id: number,
    product_name: string,
    quantity: number,
    rate: number,
    tax_rate: number,
    discount: number,
    amount: number
  }],
  gross_amount: number,
  discount_amount: number,
  tax_amount: number,
  net_amount: number,
  payment_mode: string,
  payment_status: string
}
```

## Business Logic

### GST Calculation
```javascript
// CGST/SGST for intra-state
if (customer.state_code === company.state_code) {
  cgst = (taxable_amount * gst_rate) / 200;
  sgst = (taxable_amount * gst_rate) / 200;
} else {
  // IGST for inter-state
  igst = (taxable_amount * gst_rate) / 100;
}
```

### Discount Calculation
- Item-level discount applied before tax
- Invoice-level discount applied after subtotal
- Additional charges added after tax

### Credit Validation
- Check customer credit limit before saving
- Warn if outstanding + current invoice exceeds limit
- Option to override with manager approval

## Keyboard Shortcuts

- `Ctrl+S`: Save invoice
- `Ctrl+P`: Print invoice
- `Ctrl+N`: New invoice
- `Ctrl+F`: Focus search
- `Ctrl+Enter`: Add product to invoice
- `Delete`: Remove selected item

## Performance Optimizations

1. **Debounced Search**: Product and customer search with 300ms debounce
2. **Lazy Loading**: Components loaded on demand
3. **Memoization**: Heavy calculations cached
4. **Virtual Scrolling**: For large invoice lists
5. **Optimistic Updates**: UI updates before API confirmation

## Error Handling

- Network errors with retry mechanism
- Validation errors with field-level messages
- Stock unavailability warnings
- Credit limit exceeded alerts
- Duplicate invoice number prevention

## Testing Checklist

### Unit Tests
- [ ] GST calculation accuracy
- [ ] Discount calculation logic
- [ ] Invoice number generation
- [ ] Date validation
- [ ] Credit check logic

### Integration Tests
- [ ] Customer search and selection
- [ ] Product search and addition
- [ ] Invoice save flow
- [ ] Print functionality
- [ ] Payment recording

### E2E Tests
- [ ] Complete invoice creation flow
- [ ] Sales order to invoice conversion
- [ ] Challan to invoice conversion
- [ ] Invoice editing and cancellation
- [ ] Report generation

## Common Issues and Solutions

### Issue 1: Slow Product Search
**Solution**: Implement caching and use indexed search

### Issue 2: GST Calculation Mismatch
**Solution**: Ensure HSN codes are correctly mapped

### Issue 3: Print Layout Issues
**Solution**: Use CSS print media queries

### Issue 4: Credit Limit Not Working
**Solution**: Verify customer credit limit is set in master

## Future Enhancements

1. **Bulk Invoice Creation**: Create multiple invoices at once
2. **Recurring Invoices**: Auto-generate for subscriptions
3. **Invoice Templates**: Custom templates per customer
4. **Mobile App**: Sales on the go
5. **AI Predictions**: Predict customer orders
6. **WhatsApp Integration**: Send invoices via WhatsApp
7. **Barcode Scanning**: Quick product addition
8. **Voice Commands**: Hands-free invoice creation

## Module Compliance Score: 95%

The Sales module demonstrates excellent adoption of global components and follows all UI/UX guidelines. Minor improvements can be made in error handling and test coverage.

## Support and Maintenance

For issues or feature requests, contact the development team or raise a ticket in the issue tracker.

---
*Last Updated: January 2025*
*Version: 2.0.0*