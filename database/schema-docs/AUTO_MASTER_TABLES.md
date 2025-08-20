# Auto Master Tables Implementation

## 🎯 Quick Reference for Master Data Tables

This file contains the complete master data table structure for immediate implementation.

### SQL Implementation (Run these in order):

```sql
-- 1. States (Critical for GST)
CREATE TABLE master.states (
    state_id SERIAL PRIMARY KEY,
    state_code VARCHAR(10) UNIQUE NOT NULL,
    state_name VARCHAR(100) NOT NULL,
    gst_state_code VARCHAR(2) NOT NULL,
    is_union_territory BOOLEAN DEFAULT false,
    zone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Return Reasons (User requested)
CREATE TABLE master.return_reasons (
    reason_id SERIAL PRIMARY KEY,
    reason_code VARCHAR(20) UNIQUE NOT NULL,
    reason_name VARCHAR(100) NOT NULL,
    category VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    requires_approval BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Stock Movement Types
CREATE TABLE master.stock_movement_types (
    movement_type_id SERIAL PRIMARY KEY,
    type_code VARCHAR(20) UNIQUE NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    default_direction VARCHAR(10),
    affects_valuation BOOLEAN DEFAULT true,
    requires_approval BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Note:** Complete implementation details in MASTER_DATA_ANALYSIS.md