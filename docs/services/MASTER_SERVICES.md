# Master Data Services

Services for master data management including products, customers, suppliers, and employees.

---

## ProductService

**Location:** `backend/app/api/services/master/product/service.py`

**Used By:** `master/products/routes.py`, `purchase/upload/routes.py`, `sales/invoices/routes.py`

**Description:** Comprehensive product management with search, validation, and batch operations.

### Methods (20+ total)

| Method | Description |
|--------|-------------|
| `validate_product_data()` | Validate product data including HSN/GST |
| `check_duplicate_product()` | Check for duplicates by name/code |
| `generate_product_code()` | Generate unique product code |
| `get_or_create_product()` | Get existing or create new product |
| `create_product()` | Create new product with validation |
| `get_product()` | Get product by ID |
| `search_products()` | Search by name, brand, or code |
| `update_product()` | Update product fields |
| `validate_supplier()` | Validate supplier exists |
| `get_categories()` | Get all product categories |
| `get_types()` | Get all product types |
| `search_for_purchase()` | Search for purchase entry |
| `validate_purchase_items()` | Validate items before purchase |
| `validate_products_exist()` | Validate product IDs exist |
| `get_classes()` | Get distinct product classes |
| `list_products()` | List products with filters |
| `get_product_with_batches()` | Get product with batch info |
| `get_product_basic()` | Get basic product info |
| `update_product_batches()` | Update batch-level properties |

### Key Features

- HSN code validation
- GST slab validation (0, 5, 12, 18, 28%)
- Automatic product code generation
- Duplicate detection
- Batch management

---

## CustomerService

**Location:** `backend/app/api/services/master/customer/service.py`

**Used By:** `master/customers/routes.py`, `sales/*/routes.py`

**Description:** Customer master data management with GST validation.

### Methods

| Method | Description |
|--------|-------------|
| `create_customer()` | Create new customer |
| `get_customer()` | Get customer by ID |
| `list_customers()` | List with filters |
| `update_customer()` | Update customer data |
| `search_customers()` | Search by name/phone/GST |
| `validate_gstin()` | Validate GST number format |
| `get_customer_by_gstin()` | Find by GST number |
| `get_customer_by_phone()` | Find by phone |
| `generate_customer_code()` | Generate unique code |

---

## SupplierService

**Location:** `backend/app/api/services/master/supplier/service.py`

**Used By:** `master/suppliers/routes.py`, `purchase/*/routes.py`

**Description:** Supplier master data management.

### Methods

| Method | Description |
|--------|-------------|
| `create_supplier()` | Create new supplier |
| `get_supplier()` | Get supplier by ID |
| `list_suppliers()` | List with filters |
| `update_supplier()` | Update supplier data |
| `search_suppliers()` | Search by name/GST |
| `get_supplier_by_gstin()` | Find by GST number |
| `generate_supplier_code()` | Generate unique code |

---

## EmployeeService

**Location:** `backend/app/api/services/master/employee/service.py`

**Used By:** `master/employees/routes.py`, `finance/expenses/routes.py`

**Description:** Employee master data management.

### Methods

| Method | Description |
|--------|-------------|
| `create_employee()` | Create new employee |
| `get_employee()` | Get employee by ID |
| `list_employees()` | List with filters |
| `update_employee()` | Update employee data |
| `search_employees()` | Search by name/code |
| `get_by_user_id()` | Get employee linked to user |

---

## DepartmentBranchService

**Location:** `backend/app/api/services/master/department_branch_service.py`

**Used By:** `master/departments/routes.py`, `master/branches/routes.py`

**Description:** Department and branch management.

### Methods

| Method | Description |
|--------|-------------|
| `create_department()` | Create new department |
| `list_departments()` | List departments |
| `create_branch()` | Create new branch |
| `list_branches()` | List branches |
| `get_default_branch()` | Get default branch for org |

---

## BankAccountService

**Location:** `backend/app/api/services/master/bank_account_service.py`

**Used By:** `master/bank_accounts/routes.py`, `finance/payments/routes.py`

**Description:** Bank account management for payment processing.

### Methods

| Method | Description |
|--------|-------------|
| `create_bank_account()` | Create bank account |
| `list_bank_accounts()` | List accounts |
| `update_bank_account()` | Update account |
| `get_active_accounts()` | Get active accounts |

---

## Usage Examples

### ProductService - Create Product

```python
from app.api.services.master.product.service import ProductService

product_id = ProductService.create_product(
    db=db,
    org_id=str(context.org_id),
    product_name="Paracetamol 500mg",
    hsn_code="30049099",
    user_id=context.user_id,
    manufacturer="ABC Pharma",
    gst_percent=12,
    purchase_price=Decimal("10.00"),
    sale_price=Decimal("15.00"),
    mrp=Decimal("20.00")
)
```

### ProductService - Search Products

```python
from app.api.services.master.product.service import ProductService

# Search by name, brand, or code
products = ProductService.search_products(
    db=db,
    org_id=str(context.org_id),
    query="paracetamol",
    limit=20,
    offset=0
)
# Returns list of matching products with stock info
```

### CustomerService - Get or Create

```python
from app.api.services.master.customer.service import CustomerService

# Check if customer exists by phone
customer = CustomerService.get_customer_by_phone(db, "9876543210")

if not customer:
    customer_id = CustomerService.create_customer(db, {
        "org_id": str(context.org_id),
        "customer_name": "John Doe",
        "primary_phone": "9876543210",
        "gst_number": "29AABCU9603R1ZM"
    })
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `inventory.products` | Product master | ProductService | All products |
| `inventory.batches` | Batch tracking | ProductService | Batch/lot info |
| `parties.customers` | Customer master | CustomerService | All customers |
| `parties.suppliers` | Supplier master | SupplierService | All suppliers |
| `master.employees` | Employee master | EmployeeService | All employees |
| `master.org_branches` | Branch master | DepartmentBranchService | Branches |
| `master.departments` | Department master | DepartmentBranchService | Departments |
| `master.bank_accounts` | Bank accounts | BankAccountService | Bank accounts |

---

## Dependencies

```
ProductService
├── Uses: inventory.products, inventory.batches
├── Uses: inventory.product_categories
├── Depends on: DocumentNumberService (product code)
└── Depends on: GSTService (validate GST slab)

CustomerService
├── Uses: parties.customers
├── Depends on: DocumentNumberService (customer code)
└── Depends on: GSTService (validate GSTIN)

SupplierService
├── Uses: parties.suppliers
├── Depends on: DocumentNumberService (supplier code)
└── Depends on: GSTService (validate GSTIN)

EmployeeService
├── Uses: master.employees
├── Uses: master.org_users (linked user)
└── Depends on: None
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `DUPLICATE_PRODUCT` | 409 | Product name/code exists | Use different name |
| `INVALID_HSN` | 400 | Invalid HSN code format | Verify HSN code |
| `INVALID_GST_SLAB` | 400 | GST must be 0, 5, 12, 18, or 28 | Use valid GST rate |
| `DUPLICATE_CUSTOMER` | 409 | Customer already exists | Check by phone/GST |
| `DUPLICATE_SUPPLIER` | 409 | Supplier already exists | Check by GST |
| `INVALID_GSTIN` | 400 | Invalid GST number format | Verify GSTIN |
| `CUSTOMER_NOT_FOUND` | 404 | Customer ID not found | Verify ID |
| `SUPPLIER_NOT_FOUND` | 404 | Supplier ID not found | Verify ID |
| `EMPLOYEE_NOT_FOUND` | 404 | Employee ID not found | Verify ID |

