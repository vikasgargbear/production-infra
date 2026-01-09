# 📦 Current Stock - Complete Field Reference

> **Complete Documentation**: Every field, every variable, frontend to backend mapping.

---

## 🎯 Current Stock Module Overview

This module displays real-time inventory status with advanced filtering, sorting, batch tracking, and export capabilities.

---

## 📝 Core Data Structures

### Section 1.1: Stock Item Fields

Each stock item (`StockItem`):

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Product ID** | `item.product_id` | `product_id` | Integer | Unique product ID |
| **Product Name** | `item.product_name` | `product_name` | String | Product display name |
| **Product Code** | `item.product_code` | `product_code` | String | SKU/article code |
| **Generic Name** | `item.generic_name` | `generic_name` | String | Generic/salt name |
| **Category** | `item.category` | `category` | String | Product category |
| **Product Type** | `item.product_type` | `product_type` | String | 'standard'/'composite' |
| **Product Class** | `item.product_class` | `product_class` | String | 'medicine'/'surgical'/'fmcg' |
| **Manufacturer** | `item.manufacturer` | `manufacturer` | String | Manufacturer name |
| **Brand** | `item.brand` | `brand` | String | Brand name |
| **HSN Code** | `item.hsn_code` | `hsn_code` | String | Tax classification |
| **Unit** | `item.unit` | `unit` | String | Unit of measurement |

**Quantity Fields**:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Qty Available** | `item.total_quantity_available` | `total_quantity` | Decimal | Free stock |
| **Qty Reserved** | `item.total_quantity_reserved` | `allocated_quantity` | Decimal | Reserved/committed |
| **Available Stock** | `item.available_stock` | Alias | Decimal | Same as qty available |
| **Reserved Stock** | `item.reserved_stock` | Alias | Decimal | Same as qty reserved |

**Pricing Fields**:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **MRP** | `item.mrp_per_unit` | `mrp` | Decimal | Maximum retail price |
| **Cost** | `item.cost_per_unit` | `average_cost` | Decimal | Average purchase cost |
| **Sale Price** | `item.sale_price_per_unit` | `sale_price_per_unit` | Decimal | Selling price |
| **Total Value** | `item.total_value` | `total_value` | Decimal | Stock value (qty × cost) |

**Stock Alert Fields**:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Reorder Level** | `item.reorder_level` | `reorder_level` | Decimal | Minimum stock level |
| **Low Stock** | `item.low_stock` | `is_below_minimum` | Boolean | Below reorder level |
| **Expiry Alert** | `item.expiry_alert` | Based on `near_expiry_batches` | Boolean | Has items expiring soon |
| **Stock Status** | `item.stock_status` | Calculated | Enum | 'out_of_stock'/'low_stock'/'normal' |

**Batch Fields**:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Total Batches** | `item.total_batches` | `total_batches` | Integer | Number of batch entries |
| **Expired Batches** | `item.expired_batches` | `expired_batches` | Integer | Count of expired |
| **Near Expiry** | `item.near_expiry_batches` | `near_expiry_batches` | Integer | Expiring within 30/60 days |
| **Batches** | `item.batches` | `batches` | Array | Batch detail list |

**Regulatory Fields**:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Drug Schedule** | `item.drug_schedule` | `drug_schedule` | String | H/H1/X/Narcotics |
| **Prescription Req** | `item.prescription_required` | `prescription_required` | Boolean | Rx required |
| **Is Narcotic** | `item.is_narcotic` | `is_narcotic` | Boolean | Narcotic substance |
| **Controlled** | `item.is_controlled_substance` | `is_controlled_substance` | Boolean | Controlled drug |

**Storage Fields**:

| Field | Frontend Variable | Backend Column | Type | Description |
|-------|------------------|----------------|------|-------------|
| **Storage Conditions** | `item.storage_conditions` | `storage_conditions` | String | Storage notes |
| **Cold Chain** | `item.requires_cold_chain` | `requires_cold_chain` | Boolean | Needs refrigeration |

**Visual Flow**:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ ☑ │ Product           │ Qty      │ Unit │ MRP    │ Value   │ Status   │
├───┼───────────────────┼──────────┼──────┼────────┼─────────┼──────────┤
│ ☑ │ Paracetamol 500mg │ 5,000    │ TAB  │ ₹2.50  │ ₹12,500 │ 🟢 Normal│
│   │ SKU: MED001       │ Reserved:│      │        │         │          │
│   │ Generic: Paracet  │ 200      │      │        │         │          │
├───┼───────────────────┼──────────┼──────┼────────┼─────────┼──────────┤
│ ☐ │ Crocin Advance    │ 50       │ TAB  │ ₹15.00 │ ₹750    │ 🟡 Low   │
│   │ SKU: MED002       │ Reorder: │      │        │         │          │
│   │ Generic: Para+Caf │ 100      │      │        │         │          │
├───┼───────────────────┼──────────┼──────┼────────┼─────────┼──────────┤
│ ☐ │ Disprin           │ 0        │ TAB  │ ₹5.00  │ ₹0      │ 🔴 Out   │
│   │ SKU: MED003       │          │      │        │         │          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

### Section 1.2: Filter Fields

| Field | Frontend Variable | Type | Options | Description |
|-------|------------------|------|---------|-------------|
| **Search Query** | `searchQuery` | String | - | Search name/code/generic |
| **Category** | `selectedCategory` | String | 'all'/category names | Filter by category |
| **Location** | `selectedLocation` | String | 'all'/location names | Filter by storage |
| **Show Low Stock** | `showLowStock` | Boolean | - | Only low/out of stock |
| **Show Expiring** | `showExpiring` | Boolean | - | Only with expiry alerts |
| **Date Filter** | `dateFilter` | String | 'all'/'today'/'week'/etc | Time-based filter |

**More Filters** (`moreFilters`):

| Field | Frontend Variable | Options | Description |
|-------|------------------|---------|-------------|
| **Stock Status** | `moreFilters.stockStatus` | 'all'/'out'/'low'/'normal' | Detailed status filter |
| **Expiry Period** | `moreFilters.expiryPeriod` | 'all'/'30days'/'60days'/'90days' | Expiry timeframe |
| **Pack Type** | `moreFilters.packType` | 'all'/'strips'/'bottles'/etc | Package type filter |

---

### Section 1.3: Sort Configuration

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Sort Key** | `sortConfig.key` | String | Column to sort by |
| **Direction** | `sortConfig.direction` | 'asc'/'desc' | Sort direction |

**Sortable Columns**:
- `product_name` (default)
- `product_code`
- `total_quantity_available`
- `mrp_per_unit`
- `category`
- `manufacturer`

---

### Section 1.4: UI State

| Field | Frontend Variable | Type | Description |
|-------|------------------|------|-------------|
| **Loading** | `loading` | Boolean | Initial load |
| **Loading More** | `loadingMore` | Boolean | Pagination load |
| **Has More** | `hasMore` | Boolean | More data available |
| **Refreshing** | `refreshing` | Boolean | Manual refresh |
| **Error** | `error` | String | Error message |
| **Show Details** | `showDetails` | Boolean | Detail modal open |
| **Show Edit Modal** | `showEditModal` | Boolean | Edit modal open |
| **Show Help** | `showHelpModal` | Boolean | Help modal open |
| **Show More Filters** | `showMoreFilters` | Boolean | Advanced filters |
| **Selected IDs** | `selectedIds` | Set<number> | Selected products |

---

## 📊 Complete TypeScript Interface

```typescript
interface StockItem {
  // Identity
  product_id: number;
  product_name: string;
  product_code: string;
  generic_name?: string;
  category: string;
  product_type?: string;
  product_class?: string;
  manufacturer?: string;
  brand?: string;
  hsn_code?: string;
  unit: string;
  
  // Quantities
  total_quantity_available: number;
  total_quantity_reserved: number;
  available_stock?: number;  // Alias
  reserved_stock?: number;   // Alias
  
  // Pricing
  mrp_per_unit: number;
  cost_per_unit: number;
  sale_price_per_unit?: number;
  total_value: number;
  
  // Alerts
  reorder_level: number;
  low_stock: boolean;
  expiry_alert: boolean;
  stock_status?: 'out_of_stock' | 'low_stock' | 'normal';
  
  // Batches
  total_batches: number;
  expired_batches: number;
  near_expiry_batches: number;
  batches?: BatchInfo[];
  batch_count?: number;
  
  // Regulatory
  drug_schedule?: string;
  prescription_required?: boolean;
  is_narcotic?: boolean;
  is_controlled_substance?: boolean;
  
  // Storage
  storage_conditions?: string;
  requires_cold_chain?: boolean;
}

interface MoreFilters {
  stockStatus: string;
  expiryPeriod: string;
  packType: string;
}

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface UseCurrentStockReturn {
  // Data
  stockData: StockItem[];
  filteredData: StockItem[];
  selectedProduct: StockItem | null;
  
  // State
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  refreshing: boolean;
  hasMore: boolean;
  
  // Filters
  searchQuery: string;
  selectedCategory: string;
  selectedLocation: string;
  showLowStock: boolean;
  showExpiring: boolean;
  sortConfig: SortConfig;
  moreFilters: MoreFilters;
  selectedIds: Set<number>;
  
  // Actions
  handleRefresh: () => Promise<void>;
  handleSort: (key: string) => void;
  handleViewDetails: (product: StockItem) => void;
  handleEdit: (product: StockItem) => void;
  handleExport: () => void;
  exportSelectedPDF: () => void;
  printSelected: () => void;
  whatsappSelected: () => void;
  loadMoreData: () => void;
}
```

---

## 🔄 API Endpoints

### GET /api/inventory/stock/current

**Query Parameters**:
```
limit: number (default: 100)
skip: number (default: 0)
search: string (optional)
category: string (optional)
low_stock: boolean (optional)
```

**Response**:
```json
{
  "stocks": [
    {
      "product_id": 123,
      "product_name": "Paracetamol 500mg",
      "product_code": "MED001",
      "generic_name": "Paracetamol",
      "category": "Pain Relief",
      "manufacturer": "Sun Pharma",
      "total_quantity": 5000,
      "allocated_quantity": 200,
      "mrp": 2.50,
      "average_cost": 1.80,
      "total_value": 9000.00,
      "reorder_level": 100,
      "is_below_minimum": false,
      "is_below_reorder": false,
      "total_batches": 3,
      "expired_batches": 0,
      "near_expiry_batches": 0,
      "unit": "TAB"
    }
  ],
  "total_count": 500,
  "page": 1
}
```

---

## ⌨️ Actions Available

| Action | Frontend Handler | Description |
|--------|------------------|-------------|
| **View Details** | `handleViewDetails(product)` | Open product detail modal |
| **Edit** | `handleEdit(product)` | Open edit modal |
| **Export CSV** | `handleExport()` | Export to CSV |
| **Export PDF** | `exportSelectedPDF()` | Export to PDF |
| **Print** | `printSelected()` | Print selected items |
| **WhatsApp** | `whatsappSelected()` | Share via WhatsApp |
| **Refresh** | `handleRefresh()` | Reload data |
| **Sort** | `handleSort(key)` | Sort by column |

---

## 🔄 State Management (Refactored)

**Before Refactoring**: 24 useState calls  
**After Refactoring**: 1 custom hook (useCurrentStock)

**Reduction**: 1,191 → 373 lines (69%)

---

**Last Updated**: 2026-01-08  
**Component**: `CurrentStock.tsx` (REFACTORED)  
**Hook**: `useCurrentStock.ts` (514 lines)
