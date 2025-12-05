# 📁 Simple Folder Structure Guide

**For Non-Engineers**: Understanding where everything lives in your application

**Last Updated**: December 3, 2024

---

## 🏗️ High-Level Structure

Think of your application like a restaurant:
- **Frontend** = The dining room (what customers see)
- **Backend** = The kitchen (where the actual work happens)
- **Database** = The storage room (where ingredients/data are kept)

```
production-infra/
├── frontend/          🎨 What users see and interact with
├── backend/           ⚙️ Business logic and data processing
├── database/          💾 Database structure and rules
├── docs/              📚 Documentation
└── scripts/           🔧 Utility scripts
```

---

## 🎨 FRONTEND Structure (User Interface)

**Path**: `frontend/src/`

Think of this as organizing a store:

### **1. Components** (Like sections of your store)

```
frontend/src/components/
├── sales/              🛒 Everything related to selling (invoices, orders)
├── purchase/           📦 Everything related to buying (purchase orders)
├── payment/            💰 Payment handling
├── reports/            📊 Reports and analytics
├── global/             🌐 Reusable parts (like cash registers used everywhere)
└── invoice/            📄 Invoice-specific display components
```

**Analogy**: 
- `sales/` = The checkout counter area
- `purchase/` = The receiving dock
- `global/` = Common tools used across all departments

### **2. Services** (Like the store's utilities)

```
frontend/src/services/
├── api/                📡 Talks to the backend (like phone calls to suppliers)
│   └── modules/
│       └── invoices.api.js  ✅ Invoice API calls - USE THIS ONE
├── enterpriseCalculator.js  🧮 Calculates totals (like your cash register)
├── dataTransformer.js       🔄 Converts data between formats
└── offline/                 📴 Works when internet is down
    └── offlineDatabase.js   💾 Local storage for offline mode
```

**Key Services**:
- **invoices.api.js** (258 lines) = How frontend talks to backend about invoices
- **EnterpriseCalculator.js** (284 lines) = Calculates invoice totals (**single source of truth**)
- **offlineDatabase.js** = Saves invoices when internet is down

### **3. Hooks** (Like employee training manuals)

```
frontend/src/hooks/
└── useInvoiceLogic.js      🧠 The "brain" for invoice creation
```

**Explanation**: Hooks are reusable pieces of logic that components can use.

### **4. Utils** (Utility tools)

```
frontend/src/utils/
└── invoicePdfGenerator.js  🖨️ Creates PDF invoices for printing
```

### **5. Config** (Settings)

```
frontend/src/config/
└── invoice.config.js       ⚙️ Invoice settings and configurations
```

---

## 📋 How Invoice Creation Works (Simplified)

### **The 3-Step Flow**:

```
1. ITEMS STEP
   📍 InvoiceItemsStep.js
   ↓ User selects customer and adds products
   
2. DETAILS STEP
   📍 InvoiceDetailsStep.js
   ↓ User adds payment method, delivery charges
   
3. PREVIEW STEP
   📍 InvoicePreviewStep.js
   ↓ User sees final invoice and clicks Save
   
   ✅ SAVED!
   📍 Backend saves to database
```

### **Key Files in Invoice Flow**:

| File | What It Does | Where It Lives |
|------|-------------|----------------|
| **InvoiceFlow.js** | Controls the 3 steps | `components/sales/` |
| **useInvoiceLogic.js** | Contains all the logic | `components/sales/invoice/hooks/` |
| **InvoiceItemsStep.js** | Step 1 - Add items | `components/sales/invoice/steps/` |
| **InvoiceDetailsStep.js** | Step 2 - Add details | `components/sales/invoice/steps/` |
| **InvoicePreviewStep.js** | Step 3 - Preview | `components/sales/invoice/steps/` |
| **InvoicePreviewEnterprise.js** | Displays the invoice | `components/invoice/components/` |

---

## ⚙️ BACKEND Structure (The Kitchen)

**Path**: `backend/app/`

### **Main Areas**:

```
backend/app/
├── api/
│   ├── routes/           🛤️ API endpoints (like menu items)
│   │   ├── invoices.py         Main invoice routes
│   │   └── invoices_v2.py      New invoice routes
│   ├── services/         🔧 Business logic
│   │   └── invoice_service.py  Invoice operations
│   └── schemas/          📋 Data validation
│       └── invoice_schemas.py  What invoice data should look like
│
├── services/             💼 Core business logic
│   └── invoices/
│       ├── invoice_service.py  Main invoice logic
│       └── calculations.py     Backend calculations
│
└── repositories/         💾 Database access
    └── invoices/
        └── invoice_repository.py  Saves/retrieves invoices
```

**Analogy**:
- **routes/** = The order takers (waiters)
- **services/** = The cooks (prepare the data)
- **repositories/** = The pantry managers (get/store ingredients)

---

## 💾 DATABASE Structure

**Path**: `database/`

```
database/
├── schema-docs/          📖 Documentation of database structure
├── 02-tables/            📊 Table definitions
│   └── 04_sales_tables.sql    Invoice tables
├── 04-triggers/          ⚡ Automatic actions
└── functions/            🔧 Reusable database functions
```

**What's in the Database**:
- **sales.invoices** = Main invoice table
- **sales.invoice_items** = Individual products in each invoice
- **financial.payments** = Payment records

---

## 🗺️ Invoice File Locations Map

### **✅ ACTIVE FILES (Don't Touch Without Reason)**

#### **Frontend - Invoice Creation**
```
frontend/src/
├── components/sales/
│   ├── InvoiceFlow.js                          ⭐ Main orchestrator
│   ├── InvoiceSuccessModal.js                  Success dialog
│   ├── InvoiceListV2.tsx                       Invoice history
│   └── invoice/
│       ├── hooks/
│       │   └── useInvoiceLogic.js              🧠 Business logic
│       └── steps/
│           ├── InvoiceItemsStep.js             Step 1
│           ├── InvoiceDetailsStep.js           Step 2
│           └── InvoicePreviewStep.js           Step 3
│
├── components/invoice/
│   └── components/
│       └── InvoicePreviewEnterprise.js         📄 Display component
│
├── services/
│   ├── api/modules/
│   │   └── invoices.api.js                     📡 API service ✅ USE THIS
│   ├── enterpriseCalculator.js                 🧮 Calculator ✅ SINGLE SOURCE
│   ├── dataTransformer.js                      🔄 Data formatting
│   └── offline/
│       └── offlineDatabase.js                  💾 Offline storage
│
└── utils/
    └── invoicePdfGenerator.js                  🖨️ PDF generation
```

#### **Backend - Invoice Processing**
```
backend/app/
├── api/
│   ├── routes/
│   │   ├── invoices.py                         Main routes
│   │   ├── invoices_v2.py                      V2 routes
│   │   └── invoice_calculation.py              Calculations
│   ├── services/
│   │   └── invoice_service.py                  Invoice logic
│   └── schemas/
│       └── invoice_schemas.py                  Validation
│
├── services/invoices/
│   ├── invoice_service.py                      Core service
│   └── calculations.py                         Backend calculations
│
└── repositories/invoices/
    └── invoice_repository.py                   Database operations
```

### **❓ QUESTIONABLE FILES (Might Be Duplicates)**

These might be old/unused and could potentially be archived:

```
frontend/src/
├── components/
│   ├── invoice/components/
│   │   └── InvoicePreview.js                   ⚠️ Duplicate of Enterprise version?
│   └── sales/
│       ├── InvoiceContainer.js                 ⚠️ What does this do?
│       ├── InvoiceManagement.js                ⚠️ Used?
│       └── InvoiceSidebar.js                   ⚠️ Used?
│
├── services/
│   └── invoiceApiService.js                    ⚠️ 510 lines of mock data
│
└── hooks/
    └── useInvoiceCalculation.js                ⚠️ Duplicate calculator?
```

**Multiple InvoiceSelector files** (3 versions exist!):
1. `components/global/InvoiceSelector.js`
2. `components/global/modals/InvoiceSelector.tsx`
3. `components/payment/components/InvoiceSelector.tsx`

**Action Needed**: Need to figure out which ones are actually used.

---

## 🎯 Summary for Non-Engineers

### **What You Need to Know:**

1. **Frontend** = What users see (the app interface)
   - Lives in: `frontend/src/`
   - Main invoice file: `components/sales/InvoiceFlow.js`

2. **Backend** = Where the work happens (calculations, saving data)
   - Lives in: `backend/app/`
   - Main invoice file: `api/routes/invoices.py`

3. **Database** = Where data is stored
   - Lives in: `database/`
   - Main table: `sales.invoices`

### **The Invoice Flow:**

```
User opens app
    ↓
Frontend (InvoiceFlow.js) shows 3 steps
    ↓
User fills in:
    1. Customer & Products
    2. Payment details
    3. Review & Save
    ↓
Frontend sends data to Backend (via invoices.api.js)
    ↓
Backend validates & calculates
    ↓
Backend saves to Database
    ↓
Frontend shows success message
```

### **Current Problems:**

1. **Too many files** (~35 invoice-related files, should be ~17-20)
2. **Duplicates exist** (2 preview components, 2 API services, 3 selectors)
3. **Some files might be unused** (need to verify)

### **Recommendation:**

Before making any changes, verify which files are actually being used, then archive the duplicates/unused ones to clean up the codebase.

---

## 📞 Quick Reference

**Need to modify invoice creation flow?**
- Start here: `frontend/src/components/sales/InvoiceFlow.js`
- Logic is in: `frontend/src/components/sales/invoice/hooks/useInvoiceLogic.js`

**Need to change calculations?**
- Only edit: `frontend/src/services/enterpriseCalculator.js`

**Need to modify API calls?**
- Only edit: `frontend/src/services/api/modules/invoices.api.js`

**Need to change database structure?**
- Check: `database/schema-docs/04_sales_schema.md`
- Tables are in: `database/02-tables/04_sales_tables.sql`

**Need to change backend logic?**
- Routes: `backend/app/api/routes/invoices.py`
- Service: `backend/app/services/invoices/invoice_service.py`

---

**Last Updated**: December 3, 2024  
**Maintained By**: Droid  
**Purpose**: Help non-engineers understand the codebase structure
