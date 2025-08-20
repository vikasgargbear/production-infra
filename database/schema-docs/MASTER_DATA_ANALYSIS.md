# Master Data Tables Analysis & Recommendations

## 🎯 **Objective**
Replace hardcoded TEXT fields with standardized master data tables for better data consistency, user experience, and reporting.

---

## 📊 **Current State Analysis**

### ✅ **Existing Master Data Tables**
| Table | Schema | Status | Frontend Managed |
|-------|--------|--------|------------------|
| `product_categories` | inventory | ✅ Good | Need to verify |
| `product_types` | inventory | ✅ Good | Need to verify |
| `units_of_measure` | inventory | ✅ Good | Need to verify |
| `payment_methods` | financial | ✅ Good | Need to verify |
| `currencies` | master | ✅ Good | Need to verify |
| `customer_groups` | parties | ✅ Good | Need to verify |
| `territories` | parties | ✅ Good | Need to verify |
| `gst_rates` | gst | ✅ Good | Need to verify |

---

## ❌ **Missing Master Data Tables (Critical)**

### 1. **Sales & Returns**
| Current Implementation | Issue | Proposed Master Table |
|----------------------|-------|----------------------|
| `sales_returns.return_reason` (TEXT) | Free text, inconsistent | `master.return_reasons` |
| `sales_return_items.item_return_reason` (TEXT) | Free text, inconsistent | `master.item_return_reasons` |
| `sales_returns.return_category` (TEXT) | Free text, inconsistent | `master.return_categories` |
| `sales_returns.approval_status` (TEXT) | Free text, inconsistent | `master.approval_statuses` |
| `sales_returns.disposition` (TEXT) | Free text, inconsistent | `master.return_dispositions` |

**Example Values:**
- **Return Reasons:** Damaged, Expired, Wrong Product, Customer Dissatisfaction, Quality Issue, Overstocked
- **Return Categories:** Commercial, Quality, Regulatory, Customer Initiated
- **Dispositions:** Resaleable, Destroy, Return to Supplier, Quarantine

### 2. **Inventory & Stock Management**
| Current Implementation | Issue | Proposed Master Table |
|----------------------|-------|----------------------|
| `inventory_movements.movement_type` (TEXT) | Free text, inconsistent | `master.stock_movement_types` |
| `inventory_movements.movement_direction` (TEXT) | Free text, inconsistent | `master.movement_directions` |
| `stock_transfers.transfer_status` (TEXT) | Free text, inconsistent | `master.transfer_statuses` |

**Example Values:**
- **Movement Types:** Sale, Purchase, Transfer, Adjustment, Return, Damage, Expiry
- **Movement Directions:** IN, OUT, TRANSFER
- **Transfer Statuses:** Draft, Pending, In Transit, Completed, Cancelled

### 3. **Financial & Payments**
| Current Implementation | Issue | Proposed Master Table |
|----------------------|-------|----------------------|
| `payments.payment_type` (TEXT) | Free text, inconsistent | `master.payment_types` |
| `payments.party_type` (TEXT) | Free text, inconsistent | `master.party_types` |
| `payments.payment_status` (TEXT) | Free text, inconsistent | `master.payment_statuses` |
| `payment_allocations.allocation_status` (TEXT) | Free text, inconsistent | `master.allocation_statuses` |
| `payment_allocations.reversal_reason` (TEXT) | Free text, inconsistent | `master.reversal_reasons` |

**Example Values:**
- **Payment Types:** Advance, On Account, Invoice Payment, Refund
- **Party Types:** Customer, Supplier, Employee, Bank
- **Payment Statuses:** Draft, Pending, Cleared, Bounced, Cancelled

### 4. **Purchase & Procurement**
| Current Implementation | Issue | Proposed Master Table |
|----------------------|-------|----------------------|
| Missing purchase return reasons | No standardization | `master.purchase_return_reasons` |
| `purchase_orders.po_status` (TEXT) | Free text, inconsistent | `master.po_statuses` |
| `goods_receipt_notes.grn_status` (TEXT) | Free text, inconsistent | `master.grn_statuses` |

### 5. **Geographic & Location Data**
| Current Implementation | Issue | Proposed Master Table |
|----------------------|-------|----------------------|
| `customers.state` (TEXT) | Free text, inconsistent GST calculations | `master.states` |
| `suppliers.state` (TEXT) | Free text, inconsistent GST calculations | `master.states` |
| `addresses.state` (TEXT) | Free text, inconsistent | `master.states` |
| Missing cities/districts | No standardization | `master.cities` |
| Missing pincodes | No standardization | `master.pincodes` |

**Critical for Pharma Business:**
- **States:** All 28 states + 8 UTs with GST state codes (e.g., Gujarat=24, Maharashtra=27)
- **GST Implications:** 
  - Intrastate: CGST (9%) + SGST (9%) = 18%
  - Interstate: IGST (18%)
  - Wrong state = Wrong tax calculation = GST compliance issues
- **Delivery Zones:** State-wise delivery charges and timelines
- **Current Problem:** Free text "Gujarat", "gujrat", "GJ" all mean same state but cause different tax calculations

### 6. **General Business Operations**
| Current Implementation | Issue | Proposed Master Table |
|----------------------|-------|----------------------|
| Missing discount reasons | No standardization | `master.discount_reasons` |
| Missing customer contact types | No standardization | `master.contact_types` |
| Missing storage conditions | No standardization | `master.storage_conditions` |
| Missing packaging types | No standardization | `master.packaging_types` |

---

## 🗂️ **Recommended Master Data Table Structure**

### **Schema: `master` (Add to existing master schema)**

```sql
-- 1. Return Management
CREATE TABLE master.return_reasons (
    reason_id SERIAL PRIMARY KEY,
    reason_code VARCHAR(20) UNIQUE NOT NULL,
    reason_name VARCHAR(100) NOT NULL,
    category VARCHAR(50), -- 'Quality', 'Commercial', 'Regulatory'
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    requires_approval BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.return_dispositions (
    disposition_id SERIAL PRIMARY KEY,
    disposition_code VARCHAR(20) UNIQUE NOT NULL,
    disposition_name VARCHAR(100) NOT NULL,
    affects_inventory BOOLEAN DEFAULT true, -- Does this disposition affect sellable inventory?
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Stock Movement Management
CREATE TABLE master.stock_movement_types (
    movement_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    default_direction VARCHAR(10), -- 'IN', 'OUT', 'TRANSFER'
    affects_valuation BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Payment & Financial
CREATE TABLE master.payment_types (
    payment_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    is_advance_payment BOOLEAN DEFAULT false,
    requires_reference BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.payment_statuses (
    status_id SERIAL PRIMARY KEY,
    status_code VARCHAR(20) UNIQUE NOT NULL,
    status_name VARCHAR(100) NOT NULL,
    is_final_status BOOLEAN DEFAULT false, -- Can't be changed after this
    allows_reversal BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Geographic & Location Data (CRITICAL for GST compliance)
CREATE TABLE master.states (
    state_id SERIAL PRIMARY KEY,
    state_code VARCHAR(10) UNIQUE NOT NULL, -- AS, AP, AR, etc. (official state codes)
    state_name VARCHAR(100) NOT NULL, -- Assam, Andhra Pradesh, etc.
    gst_state_code VARCHAR(2) NOT NULL, -- 18, 37, 12, etc. (GST state codes)
    is_union_territory BOOLEAN DEFAULT false,
    zone VARCHAR(20), -- North, South, East, West, Northeast, Central
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.cities (
    city_id SERIAL PRIMARY KEY,
    city_name VARCHAR(100) NOT NULL,
    state_id INTEGER REFERENCES master.states(state_id),
    district_name VARCHAR(100),
    is_metro BOOLEAN DEFAULT false,
    delivery_zone VARCHAR(20), -- Zone A, Zone B, Zone C for delivery charges
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.pincodes (
    pincode_id SERIAL PRIMARY KEY,
    pincode VARCHAR(6) UNIQUE NOT NULL,
    area_name VARCHAR(200),
    city_id INTEGER REFERENCES master.cities(city_id),
    state_id INTEGER REFERENCES master.states(state_id),
    delivery_available BOOLEAN DEFAULT true,
    delivery_days INTEGER DEFAULT 3, -- Standard delivery days
    is_cod_available BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. General Business Operations
CREATE TABLE master.discount_reasons (
    reason_id SERIAL PRIMARY KEY,
    reason_code VARCHAR(20) UNIQUE NOT NULL,
    reason_name VARCHAR(100) NOT NULL,
    max_discount_percent DECIMAL(5,2), -- Optional limit
    requires_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.contact_types (
    contact_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    applies_to VARCHAR(20), -- 'customer', 'supplier', 'both'
    is_primary_contact BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.storage_conditions (
    condition_id SERIAL PRIMARY KEY,
    condition_code VARCHAR(20) UNIQUE NOT NULL,
    condition_name VARCHAR(100) NOT NULL,
    temperature_range VARCHAR(50), -- e.g., "2-8°C", "Room Temperature"
    humidity_range VARCHAR(50), -- e.g., "30-60% RH"
    special_requirements TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE master.packaging_types (
    package_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    is_primary_packaging BOOLEAN DEFAULT false, -- Strip, Bottle vs Box, Carton
    typical_units_per_pack INTEGER,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔄 **Schema Migration Plan**

### **Phase 1: Create Master Tables**
1. Create all master data tables in `master` schema
2. Insert default/standard values for each master table
3. Create backend APIs for CRUD operations

### **Phase 2: Update Existing Tables**
```sql
-- Example: Update sales_returns table
ALTER TABLE sales.sales_returns 
ADD COLUMN return_reason_id INTEGER REFERENCES master.return_reasons(reason_id);

ALTER TABLE sales.sales_returns 
ADD COLUMN disposition_id INTEGER REFERENCES master.return_dispositions(disposition_id);

-- Migrate existing data
UPDATE sales.sales_returns 
SET return_reason_id = (
    SELECT reason_id FROM master.return_reasons 
    WHERE reason_name = sales_returns.return_reason 
    LIMIT 1
);

-- After migration, drop old TEXT columns
ALTER TABLE sales.sales_returns DROP COLUMN return_reason;
```

### **Phase 3: Update Frontend**
1. Replace hardcoded dropdowns with API-driven dropdowns
2. Create master data management interfaces
3. Add validation to prevent invalid values

---

## 🎨 **Frontend Implementation Strategy**

### **1. Generic Master Data Component**
```javascript
// MasterDataDropdown.jsx
const MasterDataDropdown = ({ 
    masterType, // 'return_reasons', 'payment_types', etc.
    value, 
    onChange, 
    placeholder,
    allowAddNew = false // Allow users to add new values
}) => {
    // Fetch data from /api/master-data/{masterType}
    // Render dropdown with option to add new values
};
```

### **2. Master Data Management Interface**
```javascript
// MasterDataManager.jsx - Admin interface
const MasterDataManager = () => {
    // Tabs for each master data type
    // CRUD operations for each master table
    // Bulk import/export functionality
    // Audit trail of changes
};
```

---

## 📈 **Benefits of This Approach**

### **For Users:**
1. **Consistent Experience:** Standardized dropdown options across all modules
2. **Faster Data Entry:** Autocomplete and quick selection
3. **Better Validation:** Prevent invalid/inconsistent data entry
4. **Customizable:** Admin can add new values as business needs evolve

### **For Business:**
1. **Better Reporting:** Standardized values enable meaningful analytics
2. **Data Quality:** Eliminate typos and inconsistencies
3. **Audit Trail:** Track changes to master data values
4. **Compliance:** Easier to maintain regulatory compliance with standardized reasons

### **For Developers:**
1. **Maintainable:** Single source of truth for dropdown values
2. **Scalable:** Easy to add new master data types
3. **Consistent API:** Uniform pattern for all master data
4. **Migration Safe:** Can migrate gradually without breaking existing functionality

---

## 🚀 **Implementation Priority**

### **Critical Priority (GST Compliance):**
1. **`states`** - Critical for GST calculations (IGST vs CGST+SGST)
2. **`cities`** - Essential for accurate address and delivery management
3. **`pincodes`** - Required for delivery zones and COD availability

### **High Priority (Immediate Impact):**
1. `return_reasons` - Most requested by user
2. `stock_movement_types` - Critical for inventory accuracy
3. `payment_types` - Important for financial reporting

### **Medium Priority:**
1. `discount_reasons` - Important for sales analysis
2. `contact_types` - Better customer/supplier management
3. `storage_conditions` - Pharma regulatory compliance

### **Low Priority (Future Enhancement):**
1. `packaging_types` - Can be handled in product master initially
2. Advanced approval workflows
3. Multi-language support for master data

---

## 🔍 **Next Steps**

1. **✅ Get approval for this approach**
2. **Create backend APIs for master data management**
3. **Design and implement frontend master data manager**
4. **Start with return_reasons as pilot implementation**
5. **Gradually migrate other TEXT fields to use master data**

---

*This approach will significantly improve data quality, user experience, and reporting capabilities across the entire ERP system.*