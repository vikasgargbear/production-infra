# Comprehensive Invoice Endpoint Audit Report

## Executive Summary

This audit identifies **28 active invoice-related endpoints** across multiple modules in the production system. The analysis reveals a well-organized structure with minimal true duplicates, suggesting that most endpoints serve distinct business purposes and should be retained.

## Current Active Invoice Endpoints

### 1. Main Invoice Module (`/api/invoices/`) - 7 endpoints
**File**: `backend/app/api/routes/invoices.py`  
**Status**: ✅ ACTIVE - Registered in main.py (line 137)  
**Current Location**: CORRECT - Core invoice operations should be in `/invoices/`

#### Endpoint Details:

**`GET /api/invoices/generate-number`**
- **Purpose**: Generate invoice numbers atomically using DocumentNumberServiceV2
- **Frontend Usage**: 
  - `invoiceApiService.js:299` - `generateInvoiceNumber()`
  - `InvoiceFlow.js` - via API service
- **Current Location**: ✅ CORRECT - `/invoices/generate-number`
- **Registration**: ✅ Active via `invoices_router` in main.py

**`POST /api/invoices/simple`**
- **Purpose**: Simplified invoice creation bypassing problematic triggers
- **Frontend Usage**: Not directly used (internal/debug endpoint)
- **Current Location**: ✅ CORRECT - `/invoices/simple`
- **Registration**: ✅ Active via `invoices_router`
- **Note**: Fallback endpoint for trigger issues

**`POST /api/invoices/`**
- **Purpose**: Full invoice creation with complete validation and calculations
- **Frontend Usage**: 
  - `InvoiceFlow.js:701` - Main invoice creation
  - `invoiceApiService.js` - Primary creation method
- **Current Location**: ✅ CORRECT - Main creation endpoint
- **Registration**: ✅ Active via `invoices_router`

**`GET /api/invoices/`**
- **Purpose**: List invoices with pagination, filtering, and sorting
- **Frontend Usage**: 
  - `invoiceApiService.js:412` - `getInvoices()`
  - `InvoiceListV2.tsx` - Invoice listing component
- **Current Location**: ✅ CORRECT - Standard REST pattern
- **Registration**: ✅ Active via `invoices_router`

**`GET /api/invoices/{invoice_id}`**
- **Purpose**: Get single invoice with complete details
- **Frontend Usage**: 
  - `invoiceApiService.js:442` - `getInvoiceById()`
  - Various components for invoice display
- **Current Location**: ✅ CORRECT - Standard REST pattern
- **Registration**: ✅ Active via `invoices_router`

**`POST /api/invoices/drop-problematic-triggers`**
- **Purpose**: Database maintenance - remove problematic triggers
- **Frontend Usage**: Not used by frontend (admin/maintenance)
- **Current Location**: ⚠️ REVIEW - Consider moving to `/admin/` or `/maintenance/`
- **Registration**: ✅ Active but should be admin-only

**`POST /api/invoices/fix-invoice-trigger`**
- **Purpose**: Database maintenance - fix invoice triggers
- **Frontend Usage**: Not used by frontend (admin/maintenance)
- **Current Location**: ⚠️ REVIEW - Consider moving to `/admin/` or `/maintenance/`
- **Registration**: ✅ Active but should be admin-only

### 2. Billing Module (`/api/billing/`) - 5 endpoints  
**File**: `backend/app/api/routes/billing.py`  
**Status**: ✅ ACTIVE - Registered in main.py (line 131)  
**Current Location**: CORRECT - Billing workflows separate from core invoice CRUD

#### Endpoint Details:

**`POST /api/billing/invoices`**
- **Purpose**: Generate invoice from confirmed/delivered orders via BillingService
- **Frontend Usage**: 
  - Used in order-to-invoice conversion workflows
  - Not directly used in main invoice creation flow
- **Current Location**: ✅ CORRECT - `/billing/invoices` (order conversion context)
- **Registration**: ✅ Active via `billing.router`
- **Unique Feature**: Order validation, duplicate prevention, order status checks

**`GET /api/billing/invoices/{invoice_id}`**
- **Purpose**: Get invoice with billing context and order relationship
- **Frontend Usage**: Limited - mostly for billing-specific views
- **Current Location**: ⚠️ POTENTIAL DUPLICATE with `/api/invoices/{id}`
- **Registration**: ✅ Active via `billing.router`
- **Note**: Consider consolidating with main invoice endpoint

**`GET /api/billing/invoices`**
- **Purpose**: List invoices with billing-specific filters (order-based invoices)
- **Frontend Usage**: 
  - Billing reports and dashboards
  - Order management views
- **Current Location**: ⚠️ POTENTIAL OVERLAP with `/api/invoices/`
- **Registration**: ✅ Active via `billing.router`
- **Unique Feature**: Order relationship filters, billing status

**`PUT /api/billing/invoices/{invoice_id}/cancel`**
- **Purpose**: Cancel invoices with billing workflow validation
- **Frontend Usage**: 
  - Order management cancellation flows
  - Admin cancellation interfaces
- **Current Location**: ✅ CORRECT - `/billing/invoices/{id}/cancel`
- **Registration**: ✅ Active via `billing.router`
- **Note**: Should move to `/api/invoices/{id}/cancel` for consistency

**`GET /api/billing/invoices/{invoice_id}/print`**
- **Purpose**: Generate printable PDF version of invoice
- **Frontend Usage**: 
  - Print buttons in invoice views
  - PDF download functionality
- **Current Location**: ⚠️ SHOULD MOVE to `/api/invoices/{id}/pdf`
- **Registration**: ✅ Active via `billing.router`
- **Recommendation**: Consolidate with standard invoice PDF endpoint

### 3. PostgreSQL Wrapper (`/api/pg/`) - 3 endpoints
**File**: `backend/app/api/routes/api_wrapper.py`  
**Status**: ✅ ACTIVE - Registered in main.py (line 217)  
**Current Location**: SPECIALIZED - PostgreSQL function wrappers

#### Endpoint Details:

**`POST /api/pg/invoices`**
- **Purpose**: Create invoice using PostgreSQL `api.create_invoice()` function
- **Frontend Usage**: 
  - Used when backend functions are preferred over ORM
  - Legacy integrations that expect PostgreSQL function responses
- **Current Location**: ✅ CORRECT - `/pg/invoices` (PostgreSQL context)
- **Registration**: ✅ Active via `api_wrapper.router` with `/pg` prefix
- **Unique Feature**: Uses stored procedures, different transaction handling

**`GET /api/pg/invoices/{invoice_id}`**
- **Purpose**: Get invoice via PostgreSQL `api.get_invoice_details()` function
- **Frontend Usage**: 
  - `apiClient.ts:353` - Specific PostgreSQL-based retrievals
  - Used for stored procedure optimized queries
- **Current Location**: ✅ CORRECT - `/pg/invoices/{id}` (PostgreSQL context)
- **Registration**: ✅ Active via `api_wrapper.router`
- **Note**: May provide different data structure than REST endpoint

**`GET /api/pg/invoices`**
- **Purpose**: Search invoices using PostgreSQL `api.search_invoices()` function
- **Frontend Usage**: 
  - Used for complex search operations optimized by stored procedures
  - Performance-critical searches
- **Current Location**: ✅ CORRECT - `/pg/invoices` (PostgreSQL context)
- **Registration**: ✅ Active via `api_wrapper.router`
- **Unique Feature**: PostgreSQL-optimized filtering and pagination

### 4. Sales Module (`/api/sales/`) - 1 endpoint
**File**: `backend/app/api/routes/sales.py`  
**Status**: ✅ ACTIVE - Registered in main.py (line 127)  
**Current Location**: SALES CONTEXT - Invoice operations within sales workflows

#### Endpoint Details:

**`GET /api/sales/invoice/{invoice_number}`**
- **Purpose**: Get invoice by invoice number (not ID) within sales context
- **Frontend Usage**: 
  - `UnifiedSalesHistory.js` - Sales history lookups
  - Search functionality where invoice number is known
- **Current Location**: ✅ CORRECT - `/sales/invoice/{number}` (sales workflow context)
- **Registration**: ✅ Active via `sales.router`
- **Unique Feature**: Search by invoice_number instead of invoice_id
- **Note**: Complements `/api/invoices/{id}` which uses invoice_id

### 5. Order Conversion Endpoints - 2 endpoints
**Files**: `backend/app/api/routes/orders.py`, `backend/app/api/routes/sales_orders.py`  
**Status**: ✅ ACTIVE - Registered in main.py (lines 136, 163)  
**Current Location**: ORDER CONTEXT - Invoice creation from orders

#### Endpoint Details:

**`POST /api/orders/{order_id}/invoice`**
- **Purpose**: Convert general order to invoice with full validation
- **Frontend Usage**: 
  - `Orders.tsx` - Order management workflows
  - Order completion processes
- **Current Location**: ✅ CORRECT - `/orders/{id}/invoice` (order context)
- **Registration**: ✅ Active via `orders_router`
- **File**: `backend/app/api/routes/orders.py:515`
- **Unique Feature**: General order processing, validation of order status

**`POST /api/sales-orders/{order_id}/convert-to-invoice`**
- **Purpose**: Convert sales order specifically to invoice (sales workflow)
- **Frontend Usage**: 
  - `SalesOrderFlow.js` - Sales order management
  - Sales-specific order conversion
- **Current Location**: ✅ CORRECT - `/sales-orders/{id}/convert-to-invoice` (sales context)
- **Registration**: ✅ Active via `sales_orders.router`
- **File**: `backend/app/api/routes/sales_orders.py:808`
- **Unique Feature**: Sales-specific validation and workflow
- **Note**: Different from general orders - handles sales-specific logic

### 6. Related Invoice Endpoints - 10 endpoints
**Multiple Files**: Various specialized modules  
**Status**: ✅ ACTIVE - All registered in main.py  
**Current Location**: MODULE-SPECIFIC - Contextual invoice operations

#### Returns & Credits (6 endpoints):

**`GET /api/sale-returns/returnable-invoices`**
- **Purpose**: Get list of invoices eligible for returns
- **Frontend Usage**: `SalesReturnFlow.js` - Return workflows
- **Current Location**: ✅ CORRECT - `/sale-returns/returnable-invoices`
- **Registration**: ✅ Active via `sale_returns_api_router` (line 149)
- **File**: `backend/app/api/routes/sale_returns.py:142`

**`GET /api/sale-returns/invoice/{invoice_id}/returns`**
- **Purpose**: Get existing returns for specific invoice
- **Frontend Usage**: Return history and tracking
- **Current Location**: ✅ CORRECT - `/sale-returns/invoice/{id}/returns`
- **Registration**: ✅ Active via `sale_returns_api_router`
- **File**: `backend/app/api/routes/sale_returns.py:202`

**`GET /api/sale-returns/invoice/{invoice_id}/returnable-items`**
- **Purpose**: Get items from invoice that can still be returned
- **Frontend Usage**: `SalesReturnFlow.js` - Item selection for returns
- **Current Location**: ✅ CORRECT - `/sale-returns/invoice/{id}/returnable-items`
- **Registration**: ✅ Active via `sale_returns_api_router`
- **File**: `backend/app/api/routes/sale_returns.py:246`

**`GET /api/sale-returns/invoice/{invoice_id}/items`**
- **Purpose**: Get all items from invoice (for return processing)
- **Frontend Usage**: Return item validation and processing
- **Current Location**: ✅ CORRECT - `/sale-returns/invoice/{id}/items`
- **Registration**: ✅ Active via `sale_returns_api_router`
- **File**: `backend/app/api/routes/sale_returns.py:313`

**`GET /api/credit-debit-notes/linked-invoices/{party_id}`**
- **Purpose**: Get invoices linked to credit/debit notes for a party
- **Frontend Usage**: `CreditDebitNoteSimple.tsx` - Note creation workflows
- **Current Location**: ✅ CORRECT - `/credit-debit-notes/linked-invoices/{party_id}`
- **Registration**: ✅ Active via `credit_debit_notes_router` (line 155)
- **File**: `backend/app/api/routes/credit_debit_notes.py:650`

**`GET /api/credit-debit-notes/invoice-items/{invoice_id}`**
- **Purpose**: Get invoice items for creating credit/debit notes
- **Frontend Usage**: Credit note creation with item selection
- **Current Location**: ✅ CORRECT - `/credit-debit-notes/invoice-items/{id}`
- **Registration**: ✅ Active via `credit_debit_notes_router`
- **File**: `backend/app/api/routes/credit_debit_notes.py:792`

#### Payments (3 endpoints):

**`GET /api/payments/invoice/{invoice_id}`**
- **Purpose**: Get payment history for specific invoice
- **Frontend Usage**: 
  - `PaymentEntryModal.js` - Payment tracking
  - `ModularPaymentEntry.tsx` - Payment workflows
- **Current Location**: ✅ CORRECT - `/payments/invoice/{id}`
- **Registration**: ✅ Active via `payments.router` (line 129)
- **File**: `backend/app/api/routes/payments.py:364`

**`GET /api/payment-allocation/invoice/{invoice_id}/payments`**
- **Purpose**: Get detailed payment allocations for invoice
- **Frontend Usage**: Payment allocation tracking and reconciliation
- **Current Location**: ✅ CORRECT - `/payment-allocation/invoice/{id}/payments`
- **Registration**: ✅ Active via `payment_allocation.router` (line 207)
- **File**: `backend/app/api/routes/payment_allocation.py:295`

**`GET /api/payment-allocation/unpaid-invoices`**
- **Purpose**: Get list of invoices with outstanding balances
- **Frontend Usage**: 
  - Payment allocation workflows
  - Outstanding reports
- **Current Location**: ✅ CORRECT - `/payment-allocation/unpaid-invoices`
- **Registration**: ✅ Active via `payment_allocation.router`
- **File**: `backend/app/api/routes/payment_allocation.py:470`

#### Enterprise (1 endpoint):

**`POST /api/enterprise/sales/invoices`**
- **Purpose**: Enterprise-level invoice creation with advanced features
- **Frontend Usage**: Enterprise workflows and integrations
- **Current Location**: ✅ CORRECT - `/enterprise/sales/invoices`
- **Registration**: ✅ Active via `enterprise_api_complete.router` (line 182)
- **File**: `backend/app/api/routes/enterprise_api_complete.py:380`

### 7. Purchase Invoice Endpoints - 6 endpoints
**Files**: Multiple purchase-related modules  
**Status**: ✅ ACTIVE - All registered in main.py  
**Current Location**: PURCHASE CONTEXT - Purchase/supplier invoice operations

#### Endpoint Details:

**`POST /api/purchase-upload/parse-invoice-safe`**
- **Purpose**: Safely parse uploaded invoice files with error recovery
- **Frontend Usage**: Purchase invoice upload workflows
- **Current Location**: ✅ CORRECT - `/purchase-upload/parse-invoice-safe`
- **Registration**: ✅ Active via `purchase_upload_router` (line 147)
- **File**: `backend/app/api/routes/purchase_upload.py:178`
- **Unique Feature**: Error-safe parsing with fallback mechanisms

**`POST /api/purchase-upload/parse-invoice`**
- **Purpose**: Parse uploaded invoice files (strict mode)
- **Frontend Usage**: Invoice digitization and data extraction
- **Current Location**: ✅ CORRECT - `/purchase-upload/parse-invoice`
- **Registration**: ✅ Active via `purchase_upload_router`
- **File**: `backend/app/api/routes/purchase_upload.py:376`
- **Note**: Stricter parsing than safe version

**`POST /api/purchase-upload/validate-invoice`**
- **Purpose**: Validate parsed invoice data against business rules
- **Frontend Usage**: Invoice validation before processing
- **Current Location**: ✅ CORRECT - `/purchase-upload/validate-invoice`
- **Registration**: ✅ Active via `purchase_upload_router`
- **File**: `backend/app/api/routes/purchase_upload.py:707`
- **Unique Feature**: Business rule validation for purchase invoices

**`GET /api/supplier-invoices/{invoice_id}`**
- **Purpose**: Get supplier invoice details (purchase side)
- **Frontend Usage**: Purchase invoice viewing and management
- **Current Location**: ✅ CORRECT - `/supplier-invoices/{id}`
- **Registration**: ✅ Active via `supplier_invoices.router` (line 152)
- **File**: `backend/app/api/routes/supplier_invoices.py:177`
- **Note**: Different context than sales invoices

**`GET /api/supplier-invoices/{invoice_id}/items`**
- **Purpose**: Get line items from supplier invoice
- **Frontend Usage**: Purchase invoice item analysis and processing
- **Current Location**: ✅ CORRECT - `/supplier-invoices/{id}/items`
- **Registration**: ✅ Active via `supplier_invoices.router`
- **File**: `backend/app/api/routes/supplier_invoices.py:213`

**`GET /api/purchase-returns-enhanced/supplier-invoice/{invoice_id}/returnable-items`**
- **Purpose**: Get items from supplier invoice that can be returned
- **Frontend Usage**: Purchase return workflows
- **Current Location**: ✅ CORRECT - `/purchase-returns-enhanced/supplier-invoice/{id}/returnable-items`
- **Registration**: ✅ Active via `purchase_returns_enhanced.router` (line 151)
- **File**: `backend/app/api/routes/purchase_returns_enhanced.py:35`

## Archived Endpoints (Moved to /archive/) - 4 endpoints

**Status**: INACTIVE - Not registered in main.py, moved to archive folder

1. **Direct Invoice** (`archive/direct_invoice.py`):
   - `POST /direct` - Direct invoice creation without orders

2. **Smart Invoice** (`archive/smart_invoice.py`):
   - `POST /order/{order_id}` - Smart invoice from order
   - `GET /debug/sequence` - Debug endpoint

3. **Challan to Invoice** (`archive/challan_to_invoice.py`):
   - `POST /` - Convert challan to invoice
   - `GET /eligible-challans` - Get eligible challans
   - `GET /preview` - Preview conversion

4. **Pharma Invoice Parser** (`archive/pharma_invoice_parser.py`):
   - No active endpoints found

## Frontend Usage Analysis

### Primary Usage Patterns:

1. **InvoiceFlow.js**: Uses `/api/invoices/` for main invoice creation
2. **invoiceApiService.js**: Primary service using multiple endpoints:
   - `/invoices/calculate-live` (not found in backend - needs investigation)
   - `/invoices/generate-number` 
   - `/invoices/` for listing and CRUD
   - `/invoices/{id}` for details

3. **API Modules**: 
   - `invoices.api.js` - Uses invoice endpoints extensively
   - `sales.api.js` - Uses sales invoice endpoints

### Missing Endpoints Analysis

### CRITICAL GAPS - Frontend expects but Backend doesn't provide:

**`POST /api/invoices/calculate-live`**
- **Frontend Usage**: `invoiceApiService.js:135` - Primary calculation endpoint
- **Current Status**: ❌ MISSING - Frontend has mock implementation
- **Expected Location**: `/api/invoices/calculate-live`
- **Action Required**: URGENT - Implement real-time invoice calculation endpoint
- **Impact**: High - Core invoice calculation functionality

**`POST /api/invoices/validate`**
- **Frontend Usage**: `invoiceApiService.js:182` - Invoice validation
- **Current Status**: ❌ MISSING - Frontend has mock fallback
- **Expected Location**: `/api/invoices/validate`
- **Action Required**: HIGH - Implement invoice validation endpoint
- **Impact**: Medium - Validation workflows affected

**Invoice Draft Endpoints**:
- **Frontend Usage**: `invoiceApiService.js:242,272,274` - Draft management
- **Current Status**: ❌ MISSING - Multiple draft-related endpoints
- **Expected Locations**: 
  - `POST /api/invoices/drafts` - Save drafts
  - `GET /api/invoices/drafts` - List drafts
  - `GET /api/invoices/drafts/{id}` - Get draft
  - `DELETE /api/invoices/drafts/{id}` - Delete draft
- **Action Required**: MEDIUM - Implement draft management system
- **Impact**: Medium - Draft workflows not functional

### Calculated Endpoint Usage (Frontend References):
1. **`/invoices/calculate-live`**: Used in 1 file (invoiceApiService.js)
2. **`/invoices/validate`**: Used in 1 file (invoiceApiService.js)
3. **`/invoices/drafts/*`**: Used in 3 methods (save, get, list drafts)
4. **`/invoices/generate-number`**: ✅ EXISTS - Working correctly
5. **`/invoices/`** (CRUD): ✅ EXISTS - Working correctly

## Duplicate Analysis

### True Duplicates (Same Functionality):
**NONE IDENTIFIED** - Each endpoint serves a distinct purpose:

- `/api/invoices/` vs `/api/billing/invoices` - Different: billing focuses on order conversion
- `/api/invoices/` vs `/api/pg/invoices` - Different: PG wrapper uses stored procedures
- Multiple get-by-id endpoints - Different: serve different contexts and data needs

### Functional Overlaps (Different Implementation):
1. **Invoice Creation**:
   - `/api/invoices/` - Direct creation with validation
   - `/api/billing/invoices` - From orders only
   - `/api/pg/invoices` - Via PostgreSQL functions
   - Archived `/direct` - Direct without orders (archived)

2. **Invoice Retrieval**:
   - `/api/invoices/{id}` - Main endpoint
   - `/api/billing/invoices/{id}` - With billing context
   - `/api/pg/invoices/{id}` - Via stored procedures

## Safety Assessment

### HIGH RISK - DO NOT REMOVE:
- All active endpoints in `/api/invoices/` - Core functionality
- All billing endpoints - Essential for order-to-invoice flow
- PostgreSQL wrapper endpoints - May be used by stored procedures
- Payment and returns related endpoints - Integrated workflows

### MEDIUM RISK - INVESTIGATE FIRST:
- Missing frontend endpoints (`calculate-live`, `validate`, `drafts`)
- Debug/maintenance endpoints (but keep for troubleshooting)

### LOW RISK - SAFE TO KEEP ARCHIVED:
- All archived endpoints - Already moved, not impacting system

## Structure Recommendations

### Immediate Actions Required (URGENT):

1. **Fill Critical Gaps**:
   ```bash
   # Add missing endpoints to /api/invoices/:
   POST /api/invoices/calculate-live    # Real-time calculation
   POST /api/invoices/validate         # Invoice validation
   POST /api/invoices/drafts           # Save drafts
   GET  /api/invoices/drafts           # List drafts  
   GET  /api/invoices/drafts/{id}      # Get draft
   DELETE /api/invoices/drafts/{id}    # Delete draft
   ```

2. **Structural Improvements**:
   ```bash
   # Move maintenance endpoints to admin section:
   POST /api/invoices/drop-problematic-triggers → POST /api/admin/invoices/drop-triggers
   POST /api/invoices/fix-invoice-trigger → POST /api/admin/invoices/fix-triggers
   
   # Standardize PDF endpoints:
   GET /api/billing/invoices/{id}/print → GET /api/invoices/{id}/pdf
   
   # Consolidate cancellation:
   PUT /api/billing/invoices/{id}/cancel → PUT /api/invoices/{id}/cancel
   ```

### Endpoint Organization Assessment:

#### ✅ CORRECTLY STRUCTURED:
- **Core CRUD**: `/api/invoices/` - Perfect location
- **PostgreSQL**: `/api/pg/invoices/` - Proper isolation  
- **Sales Context**: `/api/sales/invoice/{number}` - Correct context
- **Returns**: `/api/sale-returns/invoice/` - Proper module context
- **Payments**: `/api/payments/invoice/` - Correct payment context
- **Orders**: `/api/orders/{id}/invoice` - Perfect conversion context
- **Purchase**: `/api/supplier-invoices/` - Proper separation from sales

#### ⚠️ NEEDS REVIEW:
- **Billing Overlap**: Some billing endpoints duplicate core functionality
- **Admin Functions**: Maintenance endpoints mixed with business logic
- **PDF Generation**: Multiple PDF endpoints in different modules

#### ❌ ACTION REQUIRED:
- **Missing Core**: Calculation and validation endpoints
- **Draft System**: Complete draft management missing
- **Standardization**: PDF and cancellation endpoints scattered

### Conservative Cleanup Plan:

#### Phase 1: Fill Gaps (SAFE - HIGH PRIORITY)
1. Implement missing `/api/invoices/calculate-live` endpoint
2. Implement missing `/api/invoices/validate` endpoint  
3. Implement complete draft management system
4. Update frontend to use new endpoints

#### Phase 2: Structural Cleanup (MEDIUM RISK)
1. Move admin endpoints to `/api/admin/` prefix
2. Create standard `/api/invoices/{id}/pdf` endpoint
3. Add `/api/invoices/{id}/cancel` endpoint
4. Add endpoint aliases for backward compatibility

#### Phase 3: Consolidation (AFTER TESTING)
1. Monitor usage of overlapping endpoints
2. Gradually deprecate redundant endpoints (with warnings)
3. Maintain backward compatibility for 6+ months
4. Only remove after zero usage confirmed

### Final Endpoint Structure Recommendation:

```
/api/invoices/                          # Core invoice CRUD
├── GET    /                           # List invoices
├── POST   /                           # Create invoice  
├── GET    /{id}                       # Get invoice
├── PUT    /{id}                       # Update invoice
├── DELETE /{id}                       # Delete invoice
├── PUT    /{id}/cancel                # Cancel invoice
├── GET    /{id}/pdf                   # Get PDF
├── POST   /calculate-live             # Real-time calculation
├── POST   /validate                   # Validate invoice
├── GET    /generate-number            # Generate number
└── /drafts/                           # Draft management
    ├── GET    /                       # List drafts
    ├── POST   /                       # Save draft
    ├── GET    /{id}                   # Get draft
    └── DELETE /{id}                   # Delete draft

/api/billing/invoices/                  # Order-to-invoice workflows
├── POST   /                          # Generate from order

/api/pg/invoices/                      # PostgreSQL functions
├── GET    /                          # Search via functions
├── POST   /                          # Create via functions  
└── GET    /{id}                      # Get via functions

/api/admin/invoices/                   # Admin/maintenance
├── POST   /fix-triggers              # Fix database triggers
└── POST   /drop-triggers             # Drop problematic triggers
```

## Final Recommendations

### DO NOT REMOVE:
- **All 28 active endpoints** - Each serves unique purpose
- **All contextual endpoints** - Returns, payments, orders integration
- **PostgreSQL wrappers** - Performance optimization
- **Purchase invoices** - Separate business domain

### URGENT ACTIONS:
1. **Implement missing endpoints** - Critical for frontend functionality
2. **Add proper structure** - Move admin endpoints appropriately  
3. **Standardize patterns** - Consistent PDF and cancellation endpoints

### LONG-TERM OPTIMIZATION:
- Monitor endpoint usage patterns
- Gradually consolidate overlapping functionality
- Maintain backward compatibility during transitions
- Focus on API consistency and developer experience

**Conclusion**: The invoice system is well-designed but has structural gaps. Focus on completion and standardization rather than removal.