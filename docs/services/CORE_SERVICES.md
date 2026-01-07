# Core Services

Core utility services used across the application including authentication, compliance, email, and document numbering.

---

## AuthService

**Location:** `backend/app/api/services/auth/auth_service.py`

**Used By:** `auth/routes.py`, all authenticated routes

**Description:** Authentication and authorization service.

### Methods

| Method | Description |
|--------|-------------|
| `authenticate_user()` | Validate credentials |
| `create_access_token()` | Generate JWT token |
| `verify_token()` | Validate JWT token |
| `get_current_user()` | Get user from token |
| `hash_password()` | Hash password with bcrypt |
| `verify_password()` | Verify password hash |
| `refresh_token()` | Refresh access token |

---

## GSTService

**Location:** `backend/app/api/services/compliance/gst_service.py`

**Used By:** All invoice/billing routes, `returns/*/routes.py`

**Description:** GST calculation and E-Way bill management.

### Methods

| Method | Description |
|--------|-------------|
| `calculate_gst()` | Calculate GST amount |
| `calculate_gst_components()` | Split into CGST/SGST/IGST |
| `validate_gstin()` | Validate GST number format |
| `get_gst_type()` | Determine intra/inter-state |
| `generate_eway_bill()` | Generate E-Way bill |
| `cancel_eway_bill()` | Cancel E-Way bill |
| `get_hsn_details()` | Get HSN code info |
| `validate_gst_slab()` | Validate GST rate |

### GST Calculation

```python
# Intra-state (same state)
taxable_amount = 1000
sgst = taxable_amount * rate / 200  # 50% of GST
cgst = taxable_amount * rate / 200  # 50% of GST
total_tax = sgst + cgst

# Inter-state (different state)
igst = taxable_amount * rate / 100
total_tax = igst
```

---

## ComplianceService

**Location:** `backend/app/api/services/compliance/compliance_service.py`

**Used By:** Various compliance routes

**Description:** Regulatory compliance utilities.

### Methods

| Method | Description |
|--------|-------------|
| `validate_drug_license()` | Validate drug license number |
| `check_schedule_h()` | Check if product is Schedule H |
| `get_compliance_report()` | Generate compliance report |

---

## DocumentNumberService

**Location:** `backend/app/api/services/document_number_service.py`

**Used By:** All routes that create numbered documents

**Description:** Centralized document numbering with configurable patterns.

### Methods

| Method | Description |
|--------|-------------|
| `generate_number()` | Generate next document number |
| `get_next_sequence()` | Get next sequence value |
| `configure_pattern()` | Set numbering pattern |
| `reset_sequence()` | Reset sequence counter |

### Supported Document Types

| Type | Pattern Example |
|------|-----------------|
| `invoice` | INV/2024/00001 |
| `purchase_order` | PO/2024/00001 |
| `grn` | GRN/2024/00001 |
| `challan` | DC20240106001 |
| `payment` | PAY/2024/00001 |
| `receipt` | REC/2024/00001 |
| `credit_note` | CN/2024/00001 |
| `debit_note` | DN/2024/00001 |
| `journal` | JV/2024/00001 |
| `purchase_return` | PR/2024/00001 |

---

## EmailService

**Location:** `backend/app/api/services/email/email_service.py`

**Used By:** Various notification triggers

**Description:** Email sending service with templates.

### Methods

| Method | Description |
|--------|-------------|
| `send_email()` | Send single email |
| `send_bulk()` | Send bulk emails |
| `send_template()` | Send using template |
| `get_templates()` | List email templates |

### Email Templates

| Template | Use Case |
|----------|----------|
| `invoice_notification` | Invoice sent to customer |
| `payment_reminder` | Payment due reminder |
| `order_confirmation` | Order confirmed |
| `password_reset` | Password reset link |
| `welcome` | New user welcome |

---

## SettingsService

**Location:** `backend/app/api/services/settings/settings_service.py`

**Used By:** `settings/routes.py`

**Description:** Organization and user settings management.

### Methods

| Method | Description |
|--------|-------------|
| `get_org_settings()` | Get organization settings |
| `update_org_settings()` | Update org settings |
| `get_user_preferences()` | Get user preferences |
| `update_user_preferences()` | Update user preferences |
| `get_business_settings()` | Get business configuration |
| `update_business_settings()` | Update business config |

---

## DashboardService

**Location:** `backend/app/api/services/dashboard_service.py`

**Used By:** `dashboard/routes.py`

**Description:** Dashboard analytics and KPI calculations.

### Methods

| Method | Description |
|--------|-------------|
| `get_sales_summary()` | Daily/weekly/monthly sales |
| `get_purchase_summary()` | Purchase analytics |
| `get_inventory_summary()` | Stock levels and values |
| `get_receivables_summary()` | Outstanding receivables |
| `get_payables_summary()` | Outstanding payables |
| `get_top_products()` | Best selling products |
| `get_top_customers()` | Top customers by value |
| `get_cash_flow()` | Cash flow summary |

---

## LoyaltyService

**Location:** `backend/app/api/services/loyalty/service.py`

**Used By:** `loyalty/routes.py`

**Description:** Customer loyalty program management.

### Methods (25 total)

| Method | Description |
|--------|-------------|
| `get_loyalty_config()` | Get program configuration |
| `update_loyalty_config()` | Update configuration |
| `add_points()` | Add points to customer |
| `redeem_points()` | Redeem customer points |
| `get_customer_points()` | Get customer point balance |
| `get_points_history()` | Get transaction history |
| `get_available_rewards()` | List available rewards |
| `create_reward()` | Create new reward |
| `update_reward()` | Update reward |
| `delete_reward()` | Delete reward |
| `claim_reward()` | Claim a reward |
| `get_customer_tier()` | Get customer tier |
| `calculate_points()` | Calculate points for purchase |
| `get_expiring_points()` | Points expiring soon |
| `expire_points()` | Process point expiration |
| `get_loyalty_analytics()` | Program analytics |
| `get_tier_benefits()` | Tier-wise benefits |
| `upgrade_tier()` | Upgrade customer tier |
| `get_redemption_history()` | Redemption history |
| `validate_redemption()` | Validate redemption request |

---

## Usage Examples

### DocumentNumberService - Generate Document Number

```python
from app.api.services.document_number_service import DocumentNumberService

# Generate invoice number
invoice_number = DocumentNumberService.generate_number(
    db=db,
    org_id=str(context.org_id),
    document_type="invoice"
)
# Returns: "INV/2024/00001"
```

### GSTService - Calculate GST Components

```python
from app.api.services.compliance.gst_service import GSTService

# Calculate GST for intra-state transaction
gst = GSTService.calculate_gst_components(
    taxable_amount=Decimal("1000.00"),
    gst_rate=Decimal("18"),
    is_interstate=False
)
# Returns: {"cgst": 90.00, "sgst": 90.00, "igst": 0.00, "total": 180.00}

# For inter-state
gst = GSTService.calculate_gst_components(
    taxable_amount=Decimal("1000.00"),
    gst_rate=Decimal("18"),
    is_interstate=True
)
# Returns: {"cgst": 0.00, "sgst": 0.00, "igst": 180.00, "total": 180.00}
```

### LoyaltyService - Add Points

```python
from app.api.services.loyalty.service import LoyaltyService

# Add points for purchase
LoyaltyService.add_points(
    db=db,
    org_id=str(context.org_id),
    customer_id=customer_id,
    transaction_id=invoice_id,
    transaction_type="purchase",
    amount=Decimal("5000.00"),
    points=50  # Or auto-calculate based on config
)
```

### AuthService - Verify Token

```python
from app.api.services.auth.auth_service import AuthService

# Verify and decode JWT token
payload = AuthService.verify_token(token)
user_id = payload.get("sub")
org_id = payload.get("org_id")
```

---

## Database Tables

| Table | Schema | Service | Description |
|-------|--------|---------|-------------|
| `master.document_sequences` | Number sequences | DocumentNumberService | Auto-numbering |
| `financial.tax_config` | Tax configuration | GSTService | Tax rates and rules |
| `master.eway_bills` | E-Way bills | GSTService | E-Way bill records |
| `loyalty.loyalty_config` | Program config | LoyaltyService | Loyalty settings |
| `loyalty.customer_points` | Point balances | LoyaltyService | Customer points |
| `loyalty.point_transactions` | Point history | LoyaltyService | Point credits/debits |
| `loyalty.rewards` | Reward catalog | LoyaltyService | Available rewards |
| `master.org_users` | User accounts | AuthService | User authentication |
| `master.org_settings` | Org settings | SettingsService | Organization config |
| `master.user_preferences` | User prefs | SettingsService | User preferences |
| `email.email_templates` | Templates | EmailService | Email templates |
| `email.email_log` | Email history | EmailService | Sent emails |

---

## Dependencies

```
DocumentNumberService
├── Uses: master.document_sequences
└── Depends on: None (core utility)

GSTService
├── Uses: financial.tax_config, master.eway_bills
├── Uses: master.states (for state code lookup)
└── Depends on: None (core utility)

AuthService
├── Uses: master.org_users
├── Uses: master.user_roles, master.permissions
└── Depends on: None (security layer)

LoyaltyService
├── Uses: loyalty.* tables
├── Uses: parties.customers
├── Depends on: DocumentNumberService
└── Depends on: SettingsService (program config)

DashboardService
├── Uses: sales.*, procurement.*, inventory.*, financial.*
├── Depends on: LedgerService (outstanding)
├── Depends on: InventoryService (stock summary)
└── Depends on: None directly
```

---

## Error Codes

| Error | HTTP | Description | Resolution |
|-------|------|-------------|------------|
| `INVALID_TOKEN` | 401 | JWT token invalid or expired | Refresh token |
| `INVALID_CREDENTIALS` | 401 | Wrong username/password | Verify credentials |
| `PERMISSION_DENIED` | 403 | User lacks required permission | Check RBAC roles |
| `INVALID_GSTIN` | 400 | Invalid GST number format | Verify 15-char format |
| `INVALID_GST_RATE` | 400 | GST rate not in valid slabs | Use 0, 5, 12, 18, or 28 |
| `SEQUENCE_ERROR` | 500 | Document number generation failed | Check sequence config |
| `EMAIL_SEND_FAILED` | 500 | Email could not be sent | Check SMTP config |
| `INSUFFICIENT_POINTS` | 400 | Not enough points for redemption | Earn more points |
| `REWARD_NOT_FOUND` | 404 | Reward ID not found | Verify reward_id |
| `REWARD_EXPIRED` | 400 | Reward offer has expired | Choose active reward |

