# Missing Frontend Inputs - Priority Classification

**Analysis Date:** 2025-08-08  
**System:** Pharmaceutical ERP Frontend vs Database Schema  
**Purpose:** Actionable list of missing frontend inputs categorized by business priority

---

## 🔴 MUST HAVE - Critical Missing Inputs

**These fields MUST be added immediately for legal compliance and basic business operations**

### 1. NARCOTIC & CONTROLLED SUBSTANCES (Legal Requirement)
**Risk:** Criminal liability, license cancellation

| Input Field | Component Location | Database Field | Why Critical |
|-------------|-------------------|----------------|--------------|
| **Is Narcotic Drug?** | Product Master | `inventory.batches.is_narcotic` | Legal tracking requirement |
| **Schedule Type** | Product Master | `inventory.products.schedule_type` | H/H1/X classification mandatory |
| **Prescription Number** | Sales Invoice | `compliance.narcotic_register.prescription_number` | Legal requirement for narcotics |
| **Doctor Name** | Sales Invoice | `compliance.narcotic_register.doctor_name` | Prescription validation |
| **Doctor Registration** | Sales Invoice | `compliance.narcotic_register.doctor_registration` | Medical license verification |
| **Patient Name** | Sales Invoice | `compliance.narcotic_register.patient_name` | End-user tracking |
| **Patient Address** | Sales Invoice | `compliance.narcotic_register.patient_address` | Verification requirement |

**Implementation Code:**
```javascript
// Add to InvoiceFlow.js
if (product.is_narcotic || product.schedule_type) {
  showPrescriptionModal({
    prescriptionNumber: { type: 'text', required: true },
    doctorName: { type: 'text', required: true },
    doctorRegistration: { type: 'text', required: true, pattern: 'MCI format' },
    patientName: { type: 'text', required: true },
    patientAddress: { type: 'textarea', required: true }
  });
}
```

### 2. DRUG LICENSE COMPLIANCE
**Risk:** Cannot legally operate without valid licenses

| Input Field | Component Location | Database Field | Why Critical |
|-------------|-------------------|----------------|--------------|
| **Drug License Number** | Customer Master | `parties.customers.drug_license_number` | Cannot sell without license |
| **License Expiry Date** | Customer Master | `parties.customers.drug_license_validity` | Compliance tracking |
| **Drug License Number** | Supplier Master | `parties.suppliers.drug_license_number` | Cannot buy without license |
| **License Expiry Date** | Supplier Master | `parties.suppliers.drug_license_validity` | Supplier validation |
| **FSSAI Number** | Customer Master | `parties.customers.fssai_number` | Food safety compliance |

### 3. GST COMPLIANCE
**Risk:** Heavy penalties, GST suspension

| Input Field | Component Location | Database Field | Why Critical |
|-------------|-------------------|----------------|--------------|
| **Place of Supply** | Invoice | `sales.invoices.place_of_supply` | GST rate determination |
| **E-Invoice IRN** | Invoice | `sales.invoices.e_invoice_number` | Mandatory for B2B |
| **E-Invoice Status** | Invoice | `sales.invoices.e_invoice_status` | Compliance tracking |
| **HSN Code** | Product Master | Already captured ✅ | - |

### 4. PAYMENT TRACKING
**Risk:** Cash flow issues, reconciliation problems

| Input Field | Component Location | Database Field | Why Critical |
|-------------|-------------------|----------------|--------------|
| **Clearance Date** | Payment Entry | `financial.payments.clearance_date` | Bank reconciliation |
| **Clearance Status** | Payment Entry | `financial.payments.clearance_status` | Payment confirmation |
| **Unallocated Amount** | Payment Entry | `financial.payments.unallocated_amount` | Allocation tracking |
| **Bank Account** | Supplier Master | `parties.suppliers.bank_name` | Payment processing |
| **Account Number** | Supplier Master | `parties.suppliers.account_number` | Payment processing |
| **IFSC Code** | Supplier Master | `parties.suppliers.ifsc_code` | Payment routing |

### 5. INVENTORY QUALITY CONTROL
**Risk:** Selling damaged/expired goods

| Input Field | Component Location | Database Field | Why Critical |
|-------------|-------------------|----------------|--------------|
| **QC Status** | GRN/Batch Entry | `inventory.batches.qc_status` | Quality assurance |
| **QC Date** | GRN/Batch Entry | `inventory.batches.qc_date` | Quality tracking |
| **Manufacturing Date** | Purchase Entry | `inventory.batches.manufacturing_date` | Age tracking |
| **Storage Condition** | Batch Entry | `inventory.batches.storage_condition` | Storage compliance |

### 6. BUSINESS OPERATIONS
**Risk:** Poor accountability, no sales tracking

| Input Field | Component Location | Database Field | Why Critical |
|-------------|-------------------|----------------|--------------|
| **Assigned Salesperson** | Customer Master | `parties.customers.assigned_salesperson_id` | Sales accountability |
| **Territory** | Customer Master | `parties.customers.territory_id` | Territory management |
| **Route** | Customer Master | `parties.customers.route_id` | Delivery planning |
| **WhatsApp Number** | Customer Master | `parties.customers.whatsapp_number` | Customer communication |
| **Credit Rating** | Customer Master | `parties.customers.credit_rating` | Risk assessment |

---

## 🟡 GREAT TO HAVE - Business Enhancement Inputs

**These fields significantly improve operations but business can function temporarily without them**

### 1. ADVANCED CUSTOMER MANAGEMENT

| Input Field | Component Location | Database Field | Business Value |
|-------------|-------------------|----------------|----------------|
| **Customer Grade** | Customer Master | `parties.customers.customer_grade` | Customer segmentation |
| **Overdue Interest Rate** | Customer Master | `parties.customers.overdue_interest_rate` | Interest calculation |
| **Preferred Delivery Time** | Customer Master | `parties.customers.preferred_delivery_time` | Logistics optimization |
| **Communication Preferences** | Customer Master | `parties.customers.prefer_sms/email/whatsapp` | Targeted communication |
| **KYC Status** | Customer Master | `parties.customers.kyc_status` | Compliance automation |
| **KYC Documents Upload** | Customer Master | `parties.customers.kyc_documents` | Digital verification |
| **Loyalty Points** | Customer Master | `parties.customers.loyalty_points` | Loyalty program |
| **Loyalty Tier** | Customer Master | `parties.customers.loyalty_tier` | Customer benefits |

### 2. SUPPLIER PERFORMANCE TRACKING

| Input Field | Component Location | Database Field | Business Value |
|-------------|-------------------|----------------|----------------|
| **Quality Rating** | Supplier Master | `parties.suppliers.quality_rating` | Supplier scoring |
| **Delivery Rating** | Supplier Master | `parties.suppliers.delivery_rating` | Performance metrics |
| **Compliance Rating** | Supplier Master | `parties.suppliers.compliance_rating` | Risk assessment |
| **Payment Days** | Supplier Master | `parties.suppliers.payment_days` | Payment planning |
| **Early Payment Discount** | Supplier Master | `parties.suppliers.early_payment_discount` | Cost optimization |
| **Product Categories** | Supplier Master | `parties.suppliers.product_categories` | Product filtering |
| **Brand Authorizations** | Supplier Master | `parties.suppliers.brand_authorizations` | Brand validation |

### 3. PURCHASE ORDER ENHANCEMENTS

| Input Field | Component Location | Database Field | Business Value |
|-------------|-------------------|----------------|----------------|
| **Expected Delivery Date** | Purchase Order | `procurement.purchase_orders.expected_delivery_date` | Inventory planning |
| **PO Type** | Purchase Order | `procurement.purchase_orders.po_type` | Order classification |
| **Approval Status** | Purchase Order | `procurement.purchase_orders.approval_status` | Workflow management |
| **Approved By** | Purchase Order | `procurement.purchase_orders.approved_by` | Accountability |
| **Special Instructions** | Purchase Order | `procurement.purchase_orders.special_instructions` | Supplier communication |
| **Terms & Conditions** | Purchase Order | `procurement.purchase_orders.terms_conditions` | Legal protection |

### 4. ADVANCED INVENTORY MANAGEMENT

| Input Field | Component Location | Database Field | Business Value |
|-------------|-------------------|----------------|----------------|
| **Reserved Quantity** | Stock Management | `inventory.batches.quantity_reserved` | Allocation tracking |
| **Damaged Quantity** | Stock Adjustment | `inventory.batches.quantity_damaged` | Loss tracking |
| **Expired Quantity** | Stock Adjustment | `inventory.batches.quantity_expired` | Waste management |
| **Temperature Range** | Storage Location | `inventory.storage_locations.temperature_min/max` | Cold chain |
| **Humidity Range** | Storage Location | `inventory.storage_locations.humidity_min/max` | Environmental control |
| **Storage Capacity** | Storage Location | `inventory.storage_locations.capacity_units` | Space planning |
| **Quarantine Reason** | Stock Management | `inventory.location_wise_stock.quarantine_reason` | Quality control |

### 5. SALES ENHANCEMENTS

| Input Field | Component Location | Database Field | Business Value |
|-------------|-------------------|----------------|----------------|
| **Order Source** | Sales Order | `sales.orders.order_source` | Channel analytics |
| **Sales Person** | Sales Order | `sales.orders.sales_person_id` | Performance tracking |
| **Delivery Instructions** | Sales Order | `sales.orders.delivery_instructions` | Delivery success |
| **QR Code Generation** | Invoice | `sales.invoices.qr_code_data` | Digital verification |
| **Terms & Conditions** | Invoice | `sales.invoices.terms_conditions` | Legal clarity |

### 6. FINANCIAL TRACKING

| Input Field | Component Location | Database Field | Business Value |
|-------------|-------------------|----------------|----------------|
| **Bank Charges** | Payment Entry | `financial.payments.bank_charges` | Cost tracking |
| **Exchange Rate** | International Sales | `financial.payments.exchange_rate` | Multi-currency |
| **Expense Category** | Expense Entry | `financial.expense_claims.expense_type` | Cost analysis |
| **Approval Workflow** | Expense Entry | `financial.expense_claims.approved_by` | Control |

---

## 🟢 OK TO HAVE - Nice-to-Have Inputs

**These fields provide marginal improvements and can be added in future phases**

### 1. CONTACT PERSONALIZATION

| Input Field | Component Location | Database Field | Value Addition |
|-------------|-------------------|----------------|----------------|
| **Contact Designation** | Contact Management | `parties.customer_contacts.designation` | Personalization |
| **Department** | Contact Management | `parties.customer_contacts.department` | Routing |
| **Date of Birth** | Contact Management | `parties.customer_contacts.date_of_birth` | Wishes |
| **Anniversary Date** | Contact Management | `parties.customer_contacts.anniversary_date` | Relationship |
| **Preferred Language** | Contact Management | `parties.customer_contacts.preferred_language` | Localization |
| **Preferred Contact Time** | Contact Management | `parties.customer_contacts.preferred_contact_time` | Better reach |

### 2. BUSINESS INTELLIGENCE

| Input Field | Component Location | Database Field | Value Addition |
|-------------|-------------------|----------------|----------------|
| **Business Type** | Customer Master | `parties.customers.business_type` | Segmentation |
| **Establishment Year** | Customer Master | `parties.customers.establishment_year` | Relationship age |
| **Customer Source** | Customer Master | New field needed | Acquisition tracking |
| **Referral Source** | Customer Master | New field needed | Marketing ROI |
| **Customer Interests** | Customer Master | New field needed | Cross-selling |

### 3. ADVANCED LOGISTICS

| Input Field | Component Location | Database Field | Value Addition |
|-------------|-------------------|----------------|----------------|
| **GPS Coordinates** | Customer Address | `master.addresses.coordinates` | Route optimization |
| **Landmark** | Customer Address | `master.addresses.landmark` | Easy location |
| **Delivery Window** | Delivery Planning | New field needed | Time slots |
| **Packaging Preference** | Customer Master | New field needed | Customization |

### 4. MARKETING & PROMOTIONS

| Input Field | Component Location | Database Field | Value Addition |
|-------------|-------------------|----------------|----------------|
| **Marketing Consent** | Customer Master | New field needed | GDPR compliance |
| **Promotion Eligibility** | Customer Master | New field needed | Targeted offers |
| **Purchase Patterns** | Analytics | `analytics.customer_analytics` | Predictive sales |
| **Product Preferences** | Customer Master | New field needed | Recommendations |

### 5. INTERNAL NOTES & DOCUMENTATION

| Input Field | Component Location | Database Field | Value Addition |
|-------------|-------------------|----------------|----------------|
| **Internal Notes** | All Masters | `*.internal_notes` | Team communication |
| **Special Handling Notes** | Customer Master | New field needed | Service quality |
| **Complaint History** | Customer Service | New field needed | Service improvement |
| **Visit Notes** | Sales Management | New field needed | Relationship tracking |

---

## Implementation Priority Matrix

### Week 1 Sprint (CRITICAL)
```javascript
const week1Fields = {
  narcoticTracking: ['is_narcotic', 'schedule_type', 'prescription_fields'],
  drugLicenses: ['drug_license_number', 'drug_license_validity'],
  gstCompliance: ['place_of_supply', 'e_invoice_fields'],
  paymentTracking: ['clearance_date', 'clearance_status']
};
```

### Week 2-4 Sprint (HIGH PRIORITY)
```javascript
const week2to4Fields = {
  customerEnhancements: ['whatsapp_number', 'credit_rating', 'territory_id'],
  supplierDetails: ['bank_details', 'quality_ratings'],
  inventoryQuality: ['qc_status', 'manufacturing_date', 'storage_condition'],
  purchaseOrders: ['expected_delivery_date', 'approval_workflow']
};
```

### Month 2-3 (ENHANCEMENTS)
```javascript
const month2to3Fields = {
  analytics: ['customer_analytics', 'supplier_performance'],
  loyalty: ['loyalty_points', 'loyalty_tier'],
  advancedInventory: ['temperature_tracking', 'capacity_planning'],
  financialManagement: ['bank_reconciliation', 'expense_tracking']
};
```

---

## Quick Implementation Templates

### 1. Customer Master Enhancement
```javascript
// Add to CustomerCreationModal.js
const MustHaveFields = () => (
  <div className="grid grid-cols-2 gap-4">
    {/* Compliance Section - MUST HAVE */}
    <div className="col-span-2 border-l-4 border-red-500 pl-4">
      <h3 className="font-bold text-red-600 mb-2">Compliance (Required)</h3>
      <Input
        label="Drug License Number*"
        name="drug_license_number"
        required
        pattern="[A-Z0-9-/]+"
        placeholder="DL-XX-XXXXX"
      />
      <DatePicker
        label="License Expiry Date*"
        name="drug_license_validity"
        required
        minDate={today}
        warningDays={30}
      />
    </div>
    
    {/* Business Critical - MUST HAVE */}
    <div className="col-span-2 border-l-4 border-orange-500 pl-4">
      <h3 className="font-bold text-orange-600 mb-2">Business Critical</h3>
      <Select
        label="Credit Rating*"
        name="credit_rating"
        options={['A', 'B', 'C', 'D']}
        default="C"
        onChange={updateCreditLimit}
      />
      <Input
        label="WhatsApp Number"
        name="whatsapp_number"
        type="tel"
        copyFrom="primary_phone"
      />
      <UserSelect
        label="Assigned Salesperson*"
        name="assigned_salesperson_id"
        filterRole="sales"
      />
    </div>
  </div>
);
```

### 2. Narcotic Sale Validation
```javascript
// Add to InvoiceFlow.js
const validateNarcoticSale = async (item) => {
  if (item.is_narcotic || item.schedule_type) {
    const prescription = await showPrescriptionDialog();
    
    if (!prescription.isValid) {
      throw new Error('Valid prescription required for narcotic drugs');
    }
    
    // Store in narcotic register
    await apiClient.post('/narcotic-register/', {
      ...prescription,
      product_id: item.product_id,
      quantity_dispensed: item.quantity,
      invoice_id: invoice.id
    });
  }
};
```

### 3. License Expiry Alerts
```javascript
// Add to notification system
const checkLicenseExpiry = () => {
  const expiringLicenses = customers.filter(c => {
    const daysToExpiry = daysBetween(today, c.drug_license_validity);
    return daysToExpiry <= 30 && daysToExpiry > 0;
  });
  
  expiringLicenses.forEach(customer => {
    createNotification({
      type: 'warning',
      title: 'License Expiring Soon',
      message: `${customer.customer_name} license expires in ${daysToExpiry} days`,
      priority: 'high',
      action: 'Update License'
    });
  });
};
```

---

## Validation Rules for New Fields

```javascript
const validationRules = {
  // MUST HAVE Validations
  drug_license_number: {
    required: true,
    pattern: /^[A-Z]{2}-[0-9]{2}-[A-Z0-9]{5,}$/,
    message: 'Format: DL-XX-XXXXX'
  },
  
  prescription_number: {
    required: (product) => product.is_narcotic,
    pattern: /^[A-Z0-9]+$/,
    minLength: 5,
    message: 'Valid prescription number required'
  },
  
  place_of_supply: {
    required: true,
    validate: (value, customer) => {
      return value === customer.state || value === 'INTERSTATE';
    }
  },
  
  // GREAT TO HAVE Validations
  credit_rating: {
    options: ['A', 'B', 'C', 'D'],
    impacts: {
      creditLimit: (rating) => baseLimit * ratingMultiplier[rating],
      paymentDays: (rating) => ratingDays[rating]
    }
  },
  
  quality_rating: {
    type: 'number',
    min: 1,
    max: 5,
    step: 0.5,
    calculate: () => averageOfLastNOrders(10)
  }
};
```

---

## Final Recommendations

### Immediate Actions (TODAY)
1. **Create narcotic register component** - Legal requirement
2. **Add drug license fields to masters** - Cannot operate without
3. **Add prescription capture for narcotics** - Compliance critical
4. **Update customer form with license fields** - Start implementation

### This Week
1. Implement complete narcotic tracking workflow
2. Add all compliance fields to customer/supplier
3. Create license expiry notification system
4. Add place of supply to invoice

### Next 2 Weeks
1. Complete all MUST HAVE fields
2. Start GREAT TO HAVE implementation
3. Create compliance dashboard
4. Setup automated alerts

### Success Metrics
- **Week 1:** 100% narcotic compliance
- **Week 2:** All licenses tracked
- **Week 4:** All MUST HAVE fields implemented
- **Month 2:** 50% GREAT TO HAVE fields done
- **Month 3:** System fully compliant and optimized

---

*Critical Note: The narcotic register and drug license tracking are LEGAL REQUIREMENTS. Non-compliance can result in criminal prosecution and business shutdown. These MUST be implemented immediately.*

*Document prepared by: Claude Code Analysis*  
*Priority: URGENT - Immediate Implementation Required*  
*Risk Level: EXTREME - Legal and Business Critical*