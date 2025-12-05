# 📋 Invoice Component Map - Complete Hierarchy

**Date**: December 1, 2024  
**Purpose**: Complete map of all invoice-related components, their connections, and data flow

---

## 🗺️ Component Hierarchy Tree

```
SalesHub (Entry Point)
    │
    └─► InvoiceFlow ⭐ MAIN ORCHESTRATOR
         │
         ├─► useInvoiceLogic (hook) 🧠 BRAIN
         │    │
         │    ├─► useState (invoice, selectedCustomer, etc.)
         │    ├─► EnterpriseCalculator (calculations)
         │    ├─► invoicesApi (API calls)
         │    ├─► offlineDB (offline storage)
         │    ├─► DataTransformer (data formatting)
         │    └─► Auto-save to localStorage
         │
         ├─► Step 1: InvoiceItemsStep 📦 ITEMS
         │    │
         │    ├─► CustomerSearch (select customer)
         │    ├─► ProductSearchSimple (add products)
         │    ├─► ItemsTableKeyboard (edit items)
         │    │    │
         │    │    └─► EditableCell (editable fields)
         │    │         ├─► Quantity
         │    │         ├─► Rate ⭐
         │    │         ├─► Discount
         │    │         ├─► Free Qty
         │    │         └─► GST %
         │    │
         │    └─► DocumentFooter (navigation)
         │
         ├─► Step 2: InvoiceDetailsStep 📋 DETAILS
         │    │
         │    ├─► Payment method selection
         │    ├─► Delivery charges
         │    ├─► Additional discount
         │    ├─► GST type (CGST/SGST or IGST)
         │    └─► DocumentFooter (navigation)
         │
         └─► Step 3: InvoicePreviewStep 👁️ PREVIEW
              │
              └─► InvoicePreviewEnterprise 📄 DISPLAY
                   │
                   ├─► Company Info
                   ├─► Customer Details
                   ├─► Items Table
                   ├─► Tax Breakdown
                   ├─► Payment Summary
                   └─► Save/Print Buttons
                        │
                        ├─► onSave() → useInvoiceLogic.handleSave()
                        ├─► onPrint() → Print dialog
                        └─► onThermalPrint() → Thermal printer
```

---

## 📁 File Structure & Connections

### **1. MAIN ORCHESTRATOR** ⭐

```
📄 InvoiceFlow.js (425 lines)
├─ Location: /Users/vikasgarg/Documents/AASO/Infrastructure/production-infra/frontend/src/components/sales/InvoiceFlow.js
├─ Role: Controls 3-step workflow, navigation, state
├─ Status: ✅ ACTIVE - PRODUCTION READY
├─ Imports:
│  ├─ useInvoiceLogic (custom hook)
│  ├─ InvoiceItemsStep
│  ├─ InvoiceDetailsStep
│  ├─ InvoicePreviewStep
│  ├─ InvoicePreviewEnterprise (for PDF)
│  ├─ GenericSuccessModal
│  └─ EnterpriseCalculator
│
├─ State:
│  └─ currentStep (1, 2, or 3)
│
├─ Key Methods:
│  ├─ handleContinueFromStep1() → Forces calculation → Navigate to Step 2
│  ├─ handleContinueFromStep2() → Forces calculation → Navigate to Step 3
│  ├─ handleBackToStep1() → Navigate back
│  └─ handleBackToStep2() → Navigate back
│
└─ Props Passed Down:
   ├─ invoice (state)
   ├─ setInvoice (updater)
   ├─ selectedCustomer
   ├─ onUpdateItem()
   ├─ onSave()
   └─ onClose()
```

---

### **2. BUSINESS LOGIC HOOK** 🧠

```
📄 useInvoiceLogic.js (618 lines) ⚠️ TOO BIG!
├─ Location: components/sales/invoice/hooks/useInvoiceLogic.js
├─ Role: ALL invoice state, logic, API calls
│
├─ Imports:
│  ├─ invoicesApi ⭐ (API service)
│  ├─ EnterpriseCalculator (calculations)
│  ├─ DataTransformer (data formatting)
│  ├─ offlineDB (offline storage)
│  ├─ customerAPI, productAPI
│  └─ useNetworkStatus (online/offline detection)
│
├─ State Variables (15+):
│  ├─ invoice (main invoice object)
│  ├─ selectedCustomer
│  ├─ isLoading
│  ├─ saving
│  ├─ error
│  ├─ message
│  ├─ createdInvoiceData
│  ├─ showSuccessModal
│  └─ ... more
│
├─ Key Methods:
│  ├─ handleAddProduct() → Adds product to items
│  ├─ handleUpdateItem() → Updates item field
│  ├─ handleRemoveItem() → Removes item
│  ├─ handleCalculate() → Calls EnterpriseCalculator
│  ├─ handleSave() → Creates invoice via API
│  ├─ handleCustomerSelect() → Sets customer
│  └─ Auto-save draft every 30s
│
├─ useEffect Hooks:
│  ├─ Load draft on mount (once)
│  ├─ Auto-save draft (every 30s)
│  ├─ Calculate totals (when items change, 300ms debounce)
│  └─ Initialize invoice data
│
└─ Returns:
   ├─ All state variables
   ├─ All methods
   └─ Used by InvoiceFlow
```

---

### **3. STEP COMPONENTS** 📋

#### **Step 1: Items**

```
📄 InvoiceItemsStep.js (364 lines)
├─ Location: components/sales/invoice/steps/InvoiceItemsStep.js
├─ Role: Add/edit products, select customer
│
├─ Sub-components:
│  ├─ CustomerSearch → Select customer
│  ├─ ProductSearchSimple → Search & add products
│  ├─ ItemsTableKeyboard → Edit items table
│  └─ DocumentFooter → Navigation buttons
│
├─ Props Received:
│  ├─ invoice
│  ├─ selectedCustomer
│  ├─ onCustomerSelect()
│  ├─ onAddProduct()
│  ├─ onUpdateItem()
│  ├─ onRemoveItem()
│  └─ onContinue()
│
└─ Key Features:
   ├─ Customer validation (required)
   ├─ Minimum 1 item required
   └─ Keyboard navigation (Tab/Enter)
```

#### **Step 2: Details**

```
📄 InvoiceDetailsStep.js (lines TBD)
├─ Location: components/sales/invoice/steps/InvoiceDetailsStep.js
├─ Role: Payment, delivery, discounts
│
├─ Fields:
│  ├─ Payment Method (cash/card/upi/bank)
│  ├─ Delivery Charges
│  ├─ Additional Discount
│  ├─ GST Type (CGST/SGST or IGST)
│  └─ Notes/Remarks
│
├─ Props Received:
│  ├─ invoice
│  ├─ setInvoice()
│  ├─ onContinue()
│  └─ onBack()
│
└─ Key Features:
   ├─ Split payment support
   └─ Re-calculates on field change
```

#### **Step 3: Preview**

```
📄 InvoicePreviewStep.js (331 lines)
├─ Location: components/sales/invoice/steps/InvoicePreviewStep.js
├─ Role: Wrapper for preview component
│
├─ Sub-components:
│  ├─ InvoicePreviewEnterprise → Actual preview
│  ├─ ModuleHeader → Header with title
│  └─ DocumentFooter → Save/Print buttons
│
├─ Props Received:
│  ├─ invoice ⭐ (with totals calculated!)
│  ├─ selectedCustomer
│  ├─ companyInfo
│  ├─ onSave()
│  ├─ onPrint()
│  ├─ onThermalPrint()
│  ├─ onBack()
│  └─ saving (boolean)
│
└─ Key Features:
   ├─ Print/PDF generation
   ├─ Thermal print support
   └─ Save confirmation
```

---

### **4. PREVIEW DISPLAY COMPONENT** 📄

```
📄 InvoicePreviewEnterprise.js (534 lines)
├─ Location: components/invoice/components/InvoicePreviewEnterprise.js
├─ Role: DISPLAY ONLY - Renders invoice for preview/print
│
├─ ⚠️ CRITICAL RULE: NO CALCULATIONS HERE!
│  └─ Uses ONLY invoice.totals (pre-calculated)
│
├─ Props Received:
│  ├─ invoice ⭐ (must have .totals)
│  ├─ companyInfo
│  ├─ showAddresses (bool)
│  └─ isPrintMode (bool)
│
├─ Display Sections:
│  ├─ Company Header (logo, name, address)
│  ├─ Invoice Number & Date
│  ├─ Customer Details (Bill To / Ship To)
│  ├─ Items Table
│  │   ├─ Product Name, HSN
│  │   ├─ Batch, Expiry
│  │   ├─ Qty, Rate, Discount
│  │   ├─ GST %, Amount
│  │   └─ Subtotals
│  ├─ Tax Breakdown Table
│  │   ├─ GST Rate wise summary
│  │   ├─ Taxable Amount
│  │   ├─ CGST, SGST, IGST
│  │   └─ Total per rate
│  ├─ Payment Summary
│  │   ├─ Subtotal
│  │   ├─ Discount
│  │   ├─ Taxable Amount
│  │   ├─ Total GST
│  │   ├─ Delivery Charges
│  │   ├─ Round Off
│  │   └─ Net Amount
│  └─ Footer
│      ├─ Payment Method
│      ├─ Terms & Conditions
│      └─ Digital Signature
│
├─ Styling:
│  ├─ Print-friendly CSS
│  ├─ Page break controls
│  └─ Professional invoice layout
│
└─ ⚠️ REMOVED (Dec 1):
   ├─ calculateTotalsViaAPI() - DELETED
   ├─ useEffect for calculation - DELETED
   ├─ calculatedTotals state - DELETED
   └─ isCalculating state - DELETED
```

---

### **5. SHARED COMPONENTS** 🔧

#### **Items Table**

```
📄 ItemsTableKeyboard.js (364 lines)
├─ Location: components/global/ui/display/ItemsTableKeyboard.js
├─ Role: Editable table with keyboard navigation
│
├─ Props:
│  ├─ items (array)
│  ├─ onUpdateItem(index, field, value)
│  ├─ onRemoveItem(index)
│  ├─ readOnly (bool, default: false)
│  └─ currencySymbol
│
├─ Editable Fields:
│  ├─ Quantity (EditableCell)
│  ├─ Rate (EditableCell) ⭐
│  ├─ Discount % (EditableCell)
│  ├─ Free Quantity (EditableCell)
│  └─ GST % (EditableCell)
│
├─ Keyboard Navigation:
│  ├─ Tab → Next field
│  ├─ Enter → Next field or new row
│  ├─ Arrow Up/Down → Row navigation
│  └─ Escape → Cancel edit
│
└─ Features:
   ├─ Auto-focus next field
   ├─ Select-on-focus
   ├─ Real-time calculation
   └─ Delete row button
```

#### **Editable Cell**

```
📄 EditableCell.js (247 lines)
├─ Location: components/global/ui/display/EditableCell.js
├─ Role: Single editable field with keyboard navigation
│
├─ Props:
│  ├─ value (current value)
│  ├─ type ('number' or 'text')
│  ├─ onChange(value) → Real-time
│  ├─ onSave(value) → On blur/enter
│  ├─ onNavigate(direction) → Tab/Arrow
│  ├─ readOnly (bool)
│  ├─ min, max (validation)
│  ├─ prefix, suffix ('₹', '%')
│  └─ selectOnFocus (bool)
│
├─ Features:
│  ├─ Auto-select text on focus
│  ├─ Decimal place formatting
│  ├─ Min/max validation
│  ├─ Escape to cancel
│  └─ Visual editing state (blue border)
│
└─ Styling:
   ├─ Normal: Gray border
   ├─ Editing: Blue border + blue bg
   └─ ReadOnly: Gray bg + cursor disabled
```

---

### **6. SERVICES & UTILITIES** ⚙️

#### **API Service**

```
📄 invoices.api.js (259 lines)
├─ Location: services/api/modules/invoices.api.js
├─ Role: All invoice API calls
│
├─ Methods:
│  ├─ create(data) → POST /api/sales/direct-invoice
│  ├─ getAll(params) → GET /api/invoices
│  ├─ getById(id) → GET /api/invoices/:id
│  ├─ update(id, data) → PUT /api/invoices/:id
│  ├─ delete(id) → DELETE /api/invoices/:id
│  ├─ calculate(data) → POST /api/invoices/calculate
│  ├─ validate(data) → POST /api/invoices/validate
│  └─ generateNumber() → GET /api/invoices/generate-number
│
└─ ⚠️ USE THIS ONE, NOT invoiceApiService.js!
```

#### **Calculator**

```
📄 EnterpriseCalculator.js (273 lines)
├─ Location: services/enterpriseCalculator.js
├─ Role: SINGLE SOURCE OF TRUTH for calculations
│
├─ Methods:
│  ├─ calculateInvoice(invoiceData) → Full calculation
│  ├─ calculateDebounced(data, delay) → Debounced calc
│  ├─ enrichItemWithCalculations(item) → Per-item calc
│  ├─ formatCurrency(amount) → Format to ₹X.XX
│  └─ calculateGSTBreakdown() → Tax summary
│
├─ Calculation Flow:
│  1. For each item:
│     ├─ gross_amount = qty × rate
│     ├─ discount_amount = gross × discount%
│     ├─ taxable_amount = gross - discount
│     ├─ gst_amount = taxable × gst%
│     └─ total_amount = taxable + gst
│  2. Sum all items
│  3. Apply delivery charges
│  4. Calculate round-off
│  5. Return totals object
│
└─ ⚠️ ONLY calculator - NO duplicates!
```

#### **Data Transformer**

```
📄 DataTransformer.js (375 lines)
├─ Location: services/dataTransformer.js
├─ Role: Format data for API/display
│
├─ Methods:
│  ├─ transformInvoiceForAPI(invoice) → Backend format
│  ├─ transformInvoiceFromAPI(data) → Frontend format
│  ├─ transformItem(item) → Item format
│  └─ enrichItemData(item) → Add batch info
│
├─ Field Mappings:
│  ├─ quantity ↔ quantity
│  ├─ rate ↔ sale_price
│  ├─ discount ↔ discount_percent
│  ├─ gst_percent ↔ gst_percent
│  ├─ batch_number ↔ batch_number ⭐
│  ├─ batch_id ↔ batch_id ⭐
│  ├─ expiry_date ↔ expiry_date ⭐
│  └─ manufacturing_date ↔ manufacturing_date ⭐
│
└─ Ensures consistency between frontend/backend
```

#### **Offline Database**

```
📄 offlineDatabase.js (lines TBD)
├─ Location: services/offline/offlineDatabase.js
├─ Role: IndexedDB storage for offline mode
│
├─ Stores:
│  ├─ invoices (pending sync)
│  ├─ customers (cached)
│  ├─ products (cached)
│  └─ metadata
│
└─ Methods:
   ├─ saveInvoice(invoice) → Save to IndexedDB
   ├─ getPendingInvoices() → Get unsaved
   ├─ markAsSynced(id) → After successful sync
   └─ clearSynced() → Cleanup
```

---

## 🔄 Data Flow Diagram

### **Creating Invoice (Online)**

```
User Actions
    ↓
InvoiceFlow
    ↓
useInvoiceLogic (state management)
    ↓
Step 1: Add items
    ↓ handleAddProduct()
    ↓ ProductSearchSimple → Search product
    ↓ onAddProduct(product)
    ↓ invoice.items.push(product)
    ↓
Step 1: Edit items
    ↓ ItemsTableKeyboard
    ↓ EditableCell (rate) → User types "50"
    ↓ onChange(50) → Real-time update
    ↓ onSave(50) → Persist change
    ↓ handleUpdateItem(index, 'rate', 50)
    ↓ invoice.items[index].rate = 50
    ↓
Auto-calculation (300ms debounce)
    ↓ useEffect detects items changed
    ↓ handleCalculate()
    ↓ EnterpriseCalculator.calculateDebounced()
    ↓ Returns: { totals: {...} }
    ↓ invoice.totals = result.totals
    ↓
Step 1: Continue
    ↓ handleContinueFromStep1()
    ↓ Force calculation (0ms, synchronous)
    ↓ Wait for completion
    ↓ Navigate to Step 2
    ↓
Step 2: Add details
    ↓ User enters delivery charges, payment
    ↓ invoice.delivery_charges = 50
    ↓ invoice.payment_method = 'cash'
    ↓
Step 2: Continue
    ↓ handleContinueFromStep2()
    ↓ Force calculation AGAIN (ensure totals updated)
    ↓ Wait for completion
    ↓ invoice.totals = { gross: 120, final: 134 }
    ↓ Navigate to Step 3
    ↓
Step 3: Preview
    ↓ InvoicePreviewEnterprise
    ↓ Receives: invoice (with .totals ⭐)
    ↓ Displays: invoice.totals.final_amount
    ↓ NO CALCULATION HERE!
    ↓
User clicks Save
    ↓ onSave()
    ↓ handleSave()
    ↓ DataTransformer.transformInvoiceForAPI()
    ↓ invoicesApi.create(data)
    ↓ POST /api/sales/direct-invoice
    ↓
Backend
    ↓ Validates data
    ↓ Checks stock availability
    ↓ Generates sequential invoice number
    ↓ Saves to database
    ↓ Returns: { invoice_id, invoice_number, ... }
    ↓
Frontend
    ↓ Success modal shown
    ↓ Clear draft from localStorage
    ↓ Close invoice flow
```

### **Creating Invoice (Offline)**

```
User Actions (same as above)
    ↓
... (same flow until Save)
    ↓
User clicks Save
    ↓ onSave()
    ↓ handleSave()
    ↓ Detects: isOnline = false
    ↓
Offline Save
    ↓ Generate local invoice number: LOCAL-123456
    ↓ offlineDB.saveInvoice(invoice)
    ↓ Save to IndexedDB
    ↓ Show success modal (marked as "Pending Sync")
    ↓
Later: Internet reconnects
    ↓ useNetworkStatus detects: isOnline = true
    ↓ syncEngine.syncPendingInvoices()
    ↓ Get all pending from offlineDB
    ↓ Sort chronologically
    ↓ For each invoice:
    │   ↓ invoicesApi.create(invoice)
    │   ↓ If success: offlineDB.markAsSynced()
    │   ↓ If conflict: Show ConflictResolutionModal
    │   ↓ If error: Keep in queue, retry later
    └─► All synced!
```

---

## 🔍 Calculation Flow (Detailed)

### **When Calculations Happen:**

```
TRIGGER 1: User edits item
    ↓ onChange in EditableCell
    ↓ handleUpdateItem()
    ↓ invoice.items updated
    ↓ useEffect detects change
    ↓ Wait 300ms (debounce)
    ↓ EnterpriseCalculator.calculateDebounced(300)
    ↓ Calculate in background
    ↓ Update invoice.totals
    ↓ UI updates

TRIGGER 2: User clicks Continue (Step 1 → 2)
    ↓ handleContinueFromStep1()
    ↓ Force calculation (NO delay, synchronous)
    ↓ EnterpriseCalculator.calculateDebounced(0)
    ↓ Wait for Promise to resolve
    ↓ Ensure invoice.totals populated
    ↓ Navigate to Step 2

TRIGGER 3: User clicks Continue (Step 2 → 3)
    ↓ handleContinueFromStep2()
    ↓ Force calculation AGAIN
    ↓ (In case delivery/discount changed)
    ↓ EnterpriseCalculator.calculateDebounced(0)
    ↓ Wait for Promise to resolve
    ↓ Ensure invoice.totals updated
    ↓ Navigate to Step 3 (Preview)

⚠️ NO TRIGGER 4!
    ❌ InvoicePreviewEnterprise does NOT calculate
    ✅ It ONLY displays invoice.totals
    ✅ Single source of truth!
```

### **Calculation Details:**

```
EnterpriseCalculator.calculateInvoice(data)
    ↓
For each item:
    gross = quantity × rate
    discount_amount = gross × (discount% / 100)
    taxable = gross - discount_amount
    gst_amount = taxable × (gst% / 100)
    total = taxable + gst_amount
    
    item.enriched = {
        gross_amount: gross,
        discount_amount,
        taxable_amount: taxable,
        gst_amount,
        total_amount: total
    }
    ↓
Sum all items:
    total_gross = Σ item.gross_amount
    total_discount = Σ item.discount_amount
    total_taxable = Σ item.taxable_amount
    total_gst = Σ item.gst_amount
    ↓
Apply invoice-level adjustments:
    taxable_after_discount = total_taxable - invoice.discount_amount
    gst_after_discount = taxable_after_discount × (avg_gst% / 100)
    subtotal = taxable_after_discount + gst_after_discount
    ↓
Apply delivery & round-off:
    before_rounding = subtotal + delivery_charges
    round_off = Math.round(before_rounding) - before_rounding
    final_amount = before_rounding + round_off
    ↓
Return:
    {
        items: [enriched items],
        totals: {
            gross_amount,
            total_discount,
            taxable_amount,
            cgst_amount,
            sgst_amount,
            igst_amount,
            total_tax,
            delivery_charges,
            round_off,
            final_amount
        }
    }
```

---

## 📊 State Flow

### **Invoice Object Structure:**

```javascript
invoice = {
    // Document Info
    invoice_no: "DRAFT-20241201",  // Becomes "INV-2024-001" on save
    invoice_date: "2024-12-01",
    invoice_type: "tax_invoice",
    
    // Customer Info
    customer_id: 123,
    customer_details: {
        name: "Customer Name",
        phone: "1234567890",
        email: "customer@example.com",
        billing_address: {...},
        shipping_address: {...}
    },
    
    // Items
    items: [
        {
            product_id: 456,
            product_name: "Airpods Pro",
            hsn_code: "3004",
            quantity: 3,
            rate: 40.00,
            discount: 0,
            gst_percent: 12,
            
            // Batch Info ⭐
            batch_number: "BATCH123",
            batch_id: 789,
            expiry_date: "2025-12-01",
            manufacturing_date: "2024-01-01",
            
            // Enriched (after calculation)
            gross_amount: 120.00,
            discount_amount: 0,
            taxable_amount: 120.00,
            gst_amount: 14.40,
            total_amount: 134.40
        }
    ],
    
    // Invoice Adjustments
    delivery_charges: 0,
    discount_amount: 0,
    gst_type: "CGST/SGST",  // or "IGST"
    
    // Payment
    payment_method: "cash",
    paid_amount: 134.40,
    
    // Totals ⭐ (calculated by EnterpriseCalculator)
    totals: {
        gross_amount: 120.00,
        total_discount: 0,
        taxable_amount: 120.00,
        cgst_amount: 7.20,
        sgst_amount: 7.20,
        igst_amount: 0,
        total_tax: 14.40,
        delivery_charges: 0,
        round_off: 0.20,
        net_amount: 134.40,
        final_amount: 134.40
    },
    
    // Metadata
    created_by: 1,
    branch_id: 1,
    organization_id: 1,
    notes: ""
}
```

---

## ⚠️ CRITICAL RULES

### **DO NOT:**

1. ❌ **Calculate in InvoicePreviewEnterprise**
   - It's DISPLAY ONLY
   - Use invoice.totals (pre-calculated)

2. ❌ **Use invoiceApiService.js**
   - It has NO methods!
   - Use invoicesApi from invoices.api.js

3. ❌ **Skip forced calculation on Continue**
   - Always calculate BEFORE navigation
   - Ensures totals are up-to-date

4. ❌ **Edit items directly**
   - Always go through handleUpdateItem()
   - Triggers re-calculation

5. ❌ **Create new calculators**
   - EnterpriseCalculator is SINGLE SOURCE
   - NO duplicates allowed!

### **ALWAYS:**

1. ✅ **Calculate BEFORE navigating to preview**
   - handleContinueFromStep2() forces calculation
   - Waits for completion
   - Then navigates

2. ✅ **Use invoicesApi for all API calls**
   - Correct endpoints
   - Proper auth
   - Error handling

3. ✅ **Pass invoice.totals to preview**
   - Single source of truth
   - No race conditions
   - Consistent display

4. ✅ **Use DataTransformer for API data**
   - Consistent field mapping
   - Batch info included
   - Proper formatting

5. ✅ **Handle offline mode**
   - Save to offlineDB
   - Sync when online
   - Show conflict resolution

---

## 🗂️ Files Quick Reference

### **Active Files (DO NOT DELETE):**

```
✅ InvoiceFlow.js                     (Orchestrator)
✅ useInvoiceLogic.js                 (Business logic)
✅ InvoiceItemsStep.js                (Step 1)
✅ InvoiceDetailsStep.js              (Step 2)
✅ InvoicePreviewStep.js              (Step 3 wrapper)
✅ InvoicePreviewEnterprise.js        (Display component)
✅ ItemsTableKeyboard.js              (Items table)
✅ EditableCell.js                    (Editable field)
✅ invoices.api.js                    (API service) ⭐
✅ EnterpriseCalculator.js            (Calculator) ⭐
✅ DataTransformer.js                 (Data formatting)
✅ offlineDatabase.js                 (Offline storage)
```

### **Duplicate/Unused Files (CONSIDER ARCHIVING):**

```
❓ InvoicePreview.js                  (Old preview - unused?)
❓ invoiceApiService.js               (NO methods - DELETE!) ⭐
❓ InvoiceContainer.js                (Wrapper - needed?)
❓ InvoiceManagement.js               (Management UI - separate?)
❓ InvoiceSidebar.js                  (Sidebar - where used?)
❓ useInvoiceCalculation.js           (Duplicate calculator?)
```

### **Supporting Files (KEEP):**

```
✅ InvoiceSuccessModal.js             (Success dialog)
✅ InvoiceListV2.tsx                  (Invoice history)
✅ InvoiceSelector.js                 (Selection modal)
✅ InvoiceSearch.js                   (Search component)
✅ invoiceValidator.js                (Validation rules)
✅ invoicePdfGenerator.js             (PDF generation)
✅ ConflictResolutionModal.js         (Sync conflicts)
```

---

## 🎯 Component Communication

### **Parent → Child (Props Down):**

```
InvoiceFlow
    ├─► InvoiceItemsStep
    │   ├─ invoice (state)
    │   ├─ selectedCustomer (state)
    │   ├─ onCustomerSelect (method)
    │   ├─ onAddProduct (method)
    │   ├─ onUpdateItem (method)
    │   └─ onContinue (method)
    │
    ├─► InvoiceDetailsStep
    │   ├─ invoice (state)
    │   ├─ setInvoice (updater)
    │   ├─ onContinue (method)
    │   └─ onBack (method)
    │
    └─► InvoicePreviewStep
        ├─ invoice (with totals! ⭐)
        ├─ selectedCustomer (state)
        ├─ companyInfo (state)
        ├─ onSave (method)
        ├─ onPrint (method)
        ├─ onBack (method)
        └─ saving (boolean)
```

### **Child → Parent (Callbacks Up):**

```
ItemsTableKeyboard
    ├─ onUpdateItem(index, field, value)
    │   ↓ InvoiceItemsStep.handleUpdateItem()
    │   ↓ useInvoiceLogic.handleUpdateItem()
    │   ↓ Updates invoice.items[index]
    │   ↓ Triggers calculation
    │
    └─ onRemoveItem(index)
        ↓ InvoiceItemsStep.handleRemoveItem()
        ↓ useInvoiceLogic.handleRemoveItem()
        ↓ Removes invoice.items[index]
        ↓ Triggers calculation
```

---

## 🔄 Lifecycle Flow

### **Component Mount:**

```
1. InvoiceFlow mounts
    ↓ useInvoiceLogic initializes
    ↓ Load draft from localStorage (if exists)
    ↓ Show restore prompt
    ↓ If yes: Load draft state
    ↓ If no: Start fresh
    ↓
2. Start auto-save interval (30s)
    ↓
3. Display Step 1 (Items)
```

### **User Interaction:**

```
1. User selects customer
    ↓ onCustomerSelect()
    ↓ setSelectedCustomer()
    ↓
2. User searches product
    ↓ ProductSearchSimple
    ↓ onAddProduct(product)
    ↓ Add to invoice.items
    ↓ Auto-calculate (300ms debounce)
    ↓
3. User edits rate
    ↓ Click EditableCell
    ↓ Field turns blue (editing)
    ↓ Type "50"
    ↓ onChange(50) fires (real-time)
    ↓ Press Enter
    ↓ onSave(50) fires
    ↓ handleUpdateItem(index, 'rate', 50)
    ↓ invoice.items[index].rate = 50
    ↓ Auto-calculate (300ms debounce)
    ↓
4. User clicks Continue
    ↓ handleContinueFromStep1()
    ↓ Force calculation (0ms)
    ↓ Wait for completion
    ↓ Navigate to Step 2
    ↓
5. (Similar flow for Step 2 → 3)
    ↓
6. User clicks Save
    ↓ handleSave()
    ↓ Transform data
    ↓ API call
    ↓ Success modal
    ↓ Clear draft
    ↓ Close flow
```

---

## 📝 Summary

### **Total Files:**
- **Active**: 12 core files
- **Supporting**: 10 files
- **Duplicate/Unused**: ~10 files
- **Total**: ~32 files

### **Key Components:**
1. **InvoiceFlow** - Orchestrator
2. **useInvoiceLogic** - Business logic
3. **3 Step Components** - UI
4. **InvoicePreviewEnterprise** - Display
5. **invoicesApi** - API calls
6. **EnterpriseCalculator** - Calculations

### **Critical Paths:**
1. **Data Flow**: User → Steps → useInvoiceLogic → API → Database
2. **Calculation**: Items change → Calculator → invoice.totals → Preview
3. **Save**: Preview → Transform → API → Success

### **Known Issues (Fixed Dec 1):**
- ✅ Independent calculation in preview (REMOVED)
- ✅ Wrong API service (FIXED: use invoicesApi)
- ✅ Race condition on Continue (FIXED: force calc)
- ⏳ Batch info display (BEING TESTED)
- ⏳ Rate field editability (BEING TESTED)

---

**Last Updated**: December 3, 2024  
**Status**: Complete file inventory with actual locations added  
**Next**: Archive unused files after verification

---

## 📂 COMPLETE FILE INVENTORY WITH LOCATIONS

### **🟢 ACTIVE FILES - PRODUCTION READY (Keep & Maintain)**

#### **Core Invoice Creation Flow**

| File | Location | Lines | Purpose | Status |
|------|----------|-------|---------|--------|
| **InvoiceFlow.js** | `frontend/src/components/sales/InvoiceFlow.js` | 425 | Main orchestrator, 3-step workflow | ✅ ACTIVE |
| **useInvoiceLogic.js** | `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.js` | 618 | Business logic hook, state management | ✅ ACTIVE |
| **InvoiceItemsStep.js** | `frontend/src/components/sales/invoice/steps/InvoiceItemsStep.js` | 364 | Step 1 - Add items & customer | ✅ ACTIVE |
| **InvoiceDetailsStep.js** | `frontend/src/components/sales/invoice/steps/InvoiceDetailsStep.js` | 727 | Step 2 - Payment & delivery details | ✅ ACTIVE |
| **InvoicePreviewStep.js** | `frontend/src/components/sales/invoice/steps/InvoicePreviewStep.js` | 463 | Step 3 - Preview wrapper | ✅ ACTIVE |
| **InvoicePreviewEnterprise.js** | `frontend/src/components/invoice/components/InvoicePreviewEnterprise.js` | 534 | Display component for preview/print | ✅ ACTIVE |

#### **Services & Utilities**

| File | Location | Lines | Purpose | Status |
|------|----------|-------|---------|--------|
| **invoices.api.js** | `frontend/src/services/api/modules/invoices.api.js` | 258 | API service - USE THIS ONE | ✅ ACTIVE |
| **EnterpriseCalculator.js** | `frontend/src/services/enterpriseCalculator.js` | 284 | Single source of truth for calculations | ✅ ACTIVE |
| **DataTransformer.js** | `frontend/src/services/dataTransformer.js` | ~375 | Data formatting for API/display | ✅ ACTIVE |
| **offlineDatabase.js** | `frontend/src/services/offline/offlineDatabase.js` | TBD | Offline storage (IndexedDB) | ✅ ACTIVE |
| **invoiceValidator.js** | `frontend/src/services/invoiceValidator.js` | TBD | Validation rules | ✅ ACTIVE |
| **invoicePdfGenerator.js** | `frontend/src/utils/invoicePdfGenerator.js` | TBD | PDF generation | ✅ ACTIVE |

#### **Supporting Components**

| File | Location | Lines | Purpose | Status |
|------|----------|-------|---------|--------|
| **InvoiceSuccessModal.js** | `frontend/src/components/sales/InvoiceSuccessModal.js` | 184 | Success dialog after save | ✅ ACTIVE |
| **InvoiceListV2.tsx** | `frontend/src/components/sales/InvoiceListV2.tsx` | 1287 | Invoice history list | ✅ ACTIVE |
| **InvoiceSelector.tsx** | `frontend/src/components/global/modals/InvoiceSelector.tsx` | TBD | Invoice selection modal (TypeScript) | ✅ ACTIVE |
| **InvoiceSearch.js** | `frontend/src/components/global/search/InvoiceSearch.js` | TBD | Search functionality | ✅ ACTIVE |
| **ConflictResolutionModal.js** | `frontend/src/components/sales/ConflictResolutionModal.js` | 261 | Offline sync conflict resolution | ✅ ACTIVE |

---

### **🟡 DUPLICATE/QUESTIONABLE FILES (Review & Consider Archiving)**

#### **Duplicate Preview Components**

| File | Location | Lines | Issue | Action |
|------|----------|-------|-------|--------|
| **InvoicePreview.js** | `frontend/src/components/invoice/components/InvoicePreview.js` | 514 | ⚠️ Duplicate of InvoicePreviewEnterprise? | ❓ CHECK IF USED |

**Question**: Are both InvoicePreview.js and InvoicePreviewEnterprise.js being used? Or can we archive one?

#### **Duplicate API Services**

| File | Location | Lines | Issue | Action |
|------|----------|-------|-------|--------|
| **invoiceApiService.js** | `frontend/src/services/invoiceApiService.js` | 510 | ⚠️ Mock/duplicate of invoices.api.js | 🔴 LIKELY ARCHIVE |

**Analysis**: This file contains 510 lines of mock responses. The proper API service is `invoices.api.js` (258 lines). This appears to be a development/fallback service.

#### **Duplicate Calculation Hooks**

| File | Location | Lines | Issue | Action |
|------|----------|-------|-------|--------|
| **useInvoiceCalculation.js** | `frontend/src/hooks/useInvoiceCalculation.js` | 330 | ⚠️ Duplicate calculator logic? | ❓ CHECK VS EnterpriseCalculator |

**Analysis**: We have EnterpriseCalculator.js (284 lines) as single source of truth. This hook (330 lines) might be duplicate/old.

#### **Wrapper/Container Components**

| File | Location | Lines | Issue | Action |
|------|----------|-------|-------|--------|
| **InvoiceContainer.js** | `frontend/src/components/sales/InvoiceContainer.js` | 103 | ⚠️ What does this wrap? | ❓ CHECK USAGE |
| **InvoiceManagement.js** | `frontend/src/components/sales/InvoiceManagement.js` | 554 | ⚠️ Management interface? | ❓ CHECK USAGE |
| **InvoiceSidebar.js** | `frontend/src/components/sales/InvoiceSidebar.js` | 188 | ⚠️ Where is this used? | ❓ CHECK USAGE |

**Question**: What do these files do and are they actively used in the invoice creation flow?

#### **Other Selectors**

| File | Location | Lines | Issue | Action |
|------|----------|-------|-------|--------|
| **InvoiceSelector.js** | `frontend/src/components/global/InvoiceSelector.js` | TBD | ⚠️ Duplicate of InvoiceSelector.tsx? | ❓ JS vs TSX version |
| **InvoiceSelector.tsx** | `frontend/src/components/payment/components/InvoiceSelector.tsx` | TBD | ⚠️ Another InvoiceSelector | ❓ WHICH ONE TO USE? |

**Analysis**: We have 3 InvoiceSelector files! Need to determine which is the canonical version.

#### **Utility/Supporting Files**

| File | Location | Lines | Purpose | Status |
|------|----------|-------|---------|--------|
| **InvoiceSummaryTop.tsx** | `frontend/src/components/sales/components/InvoiceSummaryTop.tsx` | TBD | Summary header component | ❓ CHECK USAGE |
| **ConvertToInvoiceButton.tsx** | `frontend/src/components/sales/components/ConvertToInvoiceButton.tsx` | TBD | Convert order to invoice | ✅ LIKELY ACTIVE |
| **ImportFromInvoiceModal.js** | `frontend/src/components/challan/components/ImportFromInvoiceModal.js` | TBD | Import invoice to challan | ✅ LIKELY ACTIVE |
| **OutstandingInvoicesTable.js** | `frontend/src/components/global/display/OutstandingInvoicesTable.js` | TBD | Outstanding invoices display | ✅ LIKELY ACTIVE |
| **localInvoiceService.js** | `frontend/src/services/invoice/localInvoiceService.js` | 235 | Local invoice operations | ❓ CHECK VS offlineDatabase |
| **invoiceStyles.js** | `frontend/src/components/invoice/styles/invoiceStyles.js` | TBD | Styles for invoice components | ✅ LIKELY ACTIVE |
| **invoice.config.js** | `frontend/src/config/invoice.config.js` | TBD | Invoice configuration | ✅ ACTIVE |

---

### **🔵 BACKEND FILES (Keep)**

| File | Location | Purpose | Status |
|------|----------|---------|--------|
| **invoices.py** | `backend/app/api/routes/invoices.py` | Main invoice routes | ✅ ACTIVE |
| **invoices_v2.py** | `backend/app/api/routes/invoices_v2.py` | V2 invoice routes | ✅ ACTIVE |
| **invoice_calculation.py** | `backend/app/api/routes/invoice_calculation.py` | Calculation endpoints | ✅ ACTIVE |
| **invoice_service.py** | `backend/app/api/services/invoice_service.py` | Invoice business logic | ✅ ACTIVE |
| **invoice_service.py** | `backend/app/services/invoices/invoice_service.py` | Invoice domain service | ✅ ACTIVE |
| **calculations.py** | `backend/app/services/invoices/calculations.py` | Backend calculations | ✅ ACTIVE |
| **invoice_repository.py** | `backend/app/repositories/invoices/invoice_repository.py` | Database operations | ✅ ACTIVE |
| **invoice_schemas.py** | `backend/app/api/schemas/invoice_schemas.py` | API schemas/validation | ✅ ACTIVE |

---

### **📦 ARCHIVED/BACKUP FILES (Can Ignore)**

| File | Location | Note |
|------|----------|------|
| **SimpleInvoiceCalculator.js.2024-12-01.backup** | `frontend/src/services/archive/` | Backup file |
| **InvoiceCalculator.js.2024-12-01.backup** | `frontend/src/services/archive/` | Backup file |

---

## 🔍 KEY FINDINGS & QUESTIONS

### **Problem 1: Too Many Selectors**
We have **3 different InvoiceSelector files**:
1. `components/global/InvoiceSelector.js` (JavaScript)
2. `components/global/modals/InvoiceSelector.tsx` (TypeScript)
3. `components/payment/components/InvoiceSelector.tsx` (TypeScript)

**Action Needed**: Determine which one is canonical and archive the others.

### **Problem 2: Duplicate API Services**
- `services/api/modules/invoices.api.js` (258 lines) - ✅ **USE THIS ONE**
- `services/invoiceApiService.js` (510 lines) - ❓ Mock/fallback service?

**Action Needed**: Verify if invoiceApiService.js is still needed or can be archived.

### **Problem 3: Duplicate Calculators**
- `services/enterpriseCalculator.js` (284 lines) - ✅ **SINGLE SOURCE OF TRUTH**
- `hooks/useInvoiceCalculation.js` (330 lines) - ❓ Duplicate?

**Action Needed**: Check if useInvoiceCalculation.js can be replaced by EnterpriseCalculator.

### **Problem 4: Unknown Usage**
These files need usage verification:
- InvoiceContainer.js (103 lines)
- InvoiceManagement.js (554 lines)
- InvoiceSidebar.js (188 lines)
- InvoicePreview.js (514 lines)

**Action Needed**: Search codebase for imports to verify if they're used.

---

## 📊 FILE COUNT SUMMARY

| Category | Count | Status |
|----------|-------|--------|
| **Active Core Files** | 6 | ✅ Production ready |
| **Active Services** | 6 | ✅ Production ready |
| **Active Supporting** | 5 | ✅ Production ready |
| **Questionable/Duplicate** | 15+ | ⚠️ Need review |
| **Backend Files** | 8 | ✅ Active |
| **Archive/Backup** | 2 | 📦 Ignore |
| **TOTAL FRONTEND** | ~35 files | ⚠️ TOO MANY |

---

## 🎯 RECOMMENDED ACTIONS

### **Immediate Actions**
1. ✅ **Verify which InvoiceSelector is canonical** - Check imports across codebase
2. ✅ **Check if invoiceApiService.js is still used** - Search for imports
3. ✅ **Verify useInvoiceCalculation.js usage** - Compare vs EnterpriseCalculator
4. ✅ **Check usage of Container/Management/Sidebar** - Search imports

### **After Verification**
5. 📦 **Archive unused files** to `frontend/src/components/archive/invoice/`
6. 📝 **Update imports** if consolidating
7. 🧪 **Test thoroughly** after any changes
8. 📚 **Update this documentation** with final decisions

---

**Last Updated**: December 3, 2024  
**Status**: Complete file inventory with actual locations added  
**Next**: Verify usage of questionable files, then archive unused ones

