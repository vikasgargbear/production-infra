# 📚 Pharma ERP - Comprehensive API Documentation

## 🎯 Overview
This document provides a complete API reference for the Pharma ERP system, organized by modules with schema mappings and variable validations.

---

## 📋 Table of Contents
1. [Authentication & User Management](#authentication--user-management)
2. [Sales Module](#sales-module)
3. [Inventory Management](#inventory-management)
4. [Procurement Module](#procurement-module)
5. [Financial Management](#financial-management)
6. [Master Data Management](#master-data-management)
7. [Delivery & Logistics](#delivery--logistics)
8. [Returns Management](#returns-management)
9. [Utility & System APIs](#utility--system-apis)

---

## 🔐 Authentication & User Management

### API Files:
- `auth.py` - Core authentication
- `auth_supabase.py` - Supabase authentication
- `organizations.py` - Organization management
- `users.py` - User management

### Endpoints:

#### 1. Login
**POST** `/api/auth/login`
```json
Request:
{
  "email": "string",
  "password": "string"
}

Response:
{
  "access_token": "string",
  "token_type": "bearer",
  "user": {
    "user_id": "integer",
    "email": "string",
    "full_name": "string",
    "org_id": "uuid"
  }
}
```
**Schema**: `parties.org_users`
**Key Fields**: email, password_hash, is_active

#### 2. Register Organization
**POST** `/api/organizations/register`
```json
Request:
{
  "org_name": "string",
  "org_type": "string",
  "admin_email": "string",
  "admin_password": "string",
  "admin_name": "string"
}
```
**Schema**: `master.organizations`, `parties.org_users`

#### 3. Get Current User
**GET** `/api/users/me`
**Headers**: Authorization: Bearer {token}
**Schema**: `parties.org_users`

---

## 💰 Sales Module

### API Files:
- `invoices.py` - Invoice management
- `direct_sale.py` - Direct sales transactions
- `orders.py` - Sales order management
- `quick_sale.py` - Quick sale operations
- `sales_entries.py` - Sales entries
- `sales_order_import.py` - Order import functionality

### Key Endpoints:

#### 1. Create Invoice
**POST** `/api/invoices/`
```json
Request:
{
  "customer_id": "integer",
  "payment_terms": "string", // 'cash', 'credit'
  "delivery_priority": "string", // 'normal', 'urgent'
  "items": [
    {
      "product_id": "integer",
      "quantity": "number",
      "unit_price": "number",
      "discount_percent": "number",
      "batch_id": "integer" // optional
    }
  ]
}

Response:
{
  "success": true,
  "invoice_id": "integer",
  "invoice_number": "string",
  "order_id": "integer",
  "total_amount": "number"
}
```
**Schemas**: 
- `sales.orders` - Order header
- `sales.invoices` - Invoice header
- `sales.invoice_items` - Invoice line items
- `inventory.batches` - For batch allocation

**Triggers Involved**:
- `calculate_invoice_totals` - Aggregates totals
- `calculate_gst_invoice_item` - Calculates GST
- `update_inventory_on_invoice` - Updates stock

#### 2. Get Invoices
**GET** `/api/invoices/?limit=50&offset=0&customer_id=35`
**Schema**: `sales.invoices` JOIN `parties.customers`

#### 3. Create Sales Order
**POST** `/api/orders/`
```json
Request:
{
  "customer_id": "integer",
  "order_type": "string",
  "delivery_date": "date",
  "items": [
    {
      "product_id": "integer",
      "quantity": "number",
      "unit_price": "number",
      "discount_percent": "number"
    }
  ]
}
```
**Schema**: `sales.orders`, `sales.order_items`

#### 4. Quick Sale
**POST** `/api/quick-sale/`
```json
Request:
{
  "customer_id": "integer",
  "items": [...],
  "payment_mode": "string",
  "payment_amount": "number"
}
```
**Creates**: Order → Invoice → Payment in single transaction

---

## 📦 Inventory Management

### API Files:
- `products.py` - Product management
- `products_consolidated.py` - Consolidated product operations
- `inventory.py` - Stock management

### Key Endpoints:

#### 1. Search Products
**GET** `/api/products/search?q=paracetamol&limit=10`
```json
Response:
{
  "products": [
    {
      "product_id": "integer",
      "product_name": "string",
      "hsn_code": "string",
      "gst_percentage": "number",
      "mrp": "number",
      "current_stock": "number"
    }
  ]
}
```
**Schema**: `inventory.products`
**Key Fields**: product_name, gst_percentage (not gst_percent!)

#### 2. Get Product Batches
**GET** `/api/products/{product_id}/batches`
```json
Response:
{
  "batches": [
    {
      "batch_id": "integer",
      "batch_number": "string",
      "expiry_date": "date",
      "quantity_available": "number",
      "mrp": "number"
    }
  ]
}
```
**Schema**: `inventory.batches`
**Key Fields**: quantity_available (not quantity_sold in some tables)

#### 3. Stock Movement
**POST** `/api/inventory/movement`
```json
Request:
{
  "movement_type": "string", // 'sale', 'purchase', 'adjustment'
  "product_id": "integer",
  "batch_id": "integer",
  "quantity": "number",
  "reference_type": "string",
  "reference_id": "integer"
}
```
**Schema**: `inventory.inventory_movements`

---

## 🛒 Procurement Module

### API Files:
- `purchases.py` - Purchase orders
- `purchase_enhanced.py` - Enhanced purchase features
- `purchase_returns.py` - Purchase returns
- `purchase_upload.py` - Bulk purchase upload

### Key Endpoints:

#### 1. Create Purchase Order
**POST** `/api/purchases/`
```json
Request:
{
  "supplier_id": "integer",
  "order_date": "date",
  "items": [
    {
      "product_id": "integer",
      "quantity": "number",
      "rate": "number",
      "discount_percent": "number"
    }
  ]
}
```
**Schema**: `procurement.purchase_orders`, `procurement.purchase_order_items`

---

## 💳 Financial Management

### API Files:
- `billing.py` - Billing operations
- `ledger.py` - Ledger management
- `party_ledger.py` - Customer/supplier ledger
- `payments.py` - Payment processing
- `pricing.py` - Price management

### Key Endpoints:

#### 1. Record Payment
**POST** `/api/payments/`
```json
Request:
{
  "party_type": "string", // 'customer' or 'supplier'
  "party_id": "integer",
  "payment_date": "date",
  "amount": "number",
  "payment_mode": "string",
  "reference_number": "string"
}
```
**Schema**: `financial.payments`, `financial.payment_allocations`

---

## 👥 Master Data Management

### API Files:
- `customers.py` - Customer management
- `customers_consolidated.py` - Consolidated customer operations
- `suppliers.py` - Supplier management
- `branches.py` - Branch management
- `categories.py` - Category management

### Key Endpoints:

#### 1. Search Customers
**GET** `/api/customers/search?q=medical&limit=10`
```json
Response:
{
  "customers": [
    {
      "customer_id": "integer",
      "customer_name": "string",
      "primary_phone": "string",
      "gst_number": "string",
      "credit_limit": "number",
      "current_outstanding": "number"
    }
  ]
}
```
**Schema**: `parties.customers`
**Key Fields**: 
- gst_number (not gstin in main table)
- primary_phone (not phone)

---

## 🚚 Delivery & Logistics

### API Files:
- `delivery_challan.py` - Delivery challan management
- `challan.py` - Challan operations
- `logistics.py` - Logistics management

---

## 🔄 Returns Management

### API Files:
- `sale_returns.py` - Sales returns
- `purchase_returns.py` - Purchase returns

---

## ⚙️ Utility & System APIs

### API Files:
- `dashboard.py` - Dashboard data
- `gst_mapping.py` - GST operations
- `table_inspector.py` - Database inspection
- `upload_parser.py` - File upload parsing

---

## 🔍 Common Issues & Solutions

### 1. Column Name Mismatches
- **Issue**: `gst_percent` vs `gst_percentage`
- **Solution**: Always use `gst_percentage` in products table

### 2. Missing Foreign Keys
- **Issue**: `batch_id` may be NULL
- **Solution**: Implement FIFO batch allocation in trigger

### 3. UUID vs Integer IDs
- **Issue**: `org_id` is UUID, not integer
- **Solution**: Cast properly or use from context

### 4. Transaction Rollbacks
- **Issue**: Invoice items not persisting
- **Solution**: Remove try-catch that hides errors

---

## 🧪 Testing Strategy

### Phase 1: Schema Validation
1. Verify all column names match database
2. Check data types (UUID vs Integer)
3. Validate foreign key relationships

### Phase 2: API Testing
1. Test each endpoint individually
2. Verify request/response formats
3. Check error handling

### Phase 3: Integration Testing
1. Test complete workflows
2. Verify trigger execution
3. Check data consistency

---

## 📋 Next Steps
1. Create individual test files for each module
2. Implement automated API testing
3. Add performance benchmarks
4. Create API versioning strategy

---

**Document Version**: 1.0
**Last Updated**: August 2024
**Status**: Ready for implementation testing