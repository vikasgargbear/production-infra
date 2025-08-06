# 🚨 Missing Core APIs for Pharma ERP

## 🎯 Critical APIs That Should Exist

After testing all existing modules, here are the essential APIs that are missing but critical for a pharmaceutical ERP system:

## 1. 🏥 Drug License & Compliance API
**Why Critical**: Pharma businesses cannot operate without proper drug licenses and compliance tracking.

### Required Endpoints:
- `POST /api/drug-licenses` - Add drug license details
- `GET /api/drug-licenses/expiring` - Get licenses expiring soon
- `POST /api/drug-licenses/{id}/renew` - Renew license
- `GET /api/compliance/checklist` - Compliance requirements checklist
- `POST /api/compliance/audits` - Record compliance audits

### Key Features:
- Drug license expiry tracking
- License renewal reminders
- Compliance document storage
- Audit trail for inspections
- Multi-state license management

## 2. 💊 Batch Recall Management API
**Why Critical**: FDA/regulatory requirement to handle product recalls efficiently.

### Required Endpoints:
- `POST /api/recalls` - Initiate product recall
- `GET /api/recalls/{batch_id}/affected-customers` - Get customers who received batch
- `POST /api/recalls/{id}/notify` - Send recall notifications
- `GET /api/recalls/{id}/status` - Track recall progress
- `POST /api/recalls/{id}/complete` - Mark recall completed

### Key Features:
- Batch traceability
- Customer notification system
- Recall reason categorization
- Return tracking for recalled items
- Regulatory reporting

## 3. 🌡️ Cold Chain Management API
**Why Critical**: Many pharma products require temperature-controlled storage and transport.

### Required Endpoints:
- `POST /api/cold-chain/temperature-logs` - Record temperature readings
- `GET /api/cold-chain/violations` - Get temperature violations
- `POST /api/cold-chain/devices` - Register temperature monitoring devices
- `GET /api/products/{id}/temperature-requirements` - Get product temp requirements
- `POST /api/cold-chain/alerts` - Configure temperature alerts

### Key Features:
- Real-time temperature monitoring
- Violation alerts
- Temperature history for batches
- Device calibration tracking
- Compliance reporting

## 4. 📋 Prescription Management API
**Why Critical**: Required for Schedule H/H1/X drugs that need prescriptions.

### Required Endpoints:
- `POST /api/prescriptions` - Upload/record prescription
- `GET /api/prescriptions/validate` - Validate prescription details
- `GET /api/products/{id}/prescription-required` - Check if prescription needed
- `POST /api/prescriptions/{id}/dispense` - Link prescription to sale
- `GET /api/prescriptions/audit` - Prescription audit trail

### Key Features:
- Digital prescription storage
- Doctor verification
- Prescription validity checking
- Controlled substance tracking
- Regulatory compliance reports

## 5. 🔄 Batch Splitting & Merging API
**Why Critical**: Pharma businesses often need to split or merge batches for various reasons.

### Required Endpoints:
- `POST /api/batches/{id}/split` - Split batch into multiple
- `POST /api/batches/merge` - Merge multiple batches
- `GET /api/batches/{id}/history` - Get split/merge history
- `POST /api/batches/{id}/repack` - Repackaging operations
- `GET /api/batches/genealogy/{id}` - Batch family tree

### Key Features:
- Maintain batch traceability
- Cost allocation on split/merge
- Expiry date management
- Quality certificate handling
- Audit trail maintenance

## 6. 🏭 Manufacturing API (if applicable)
**Why Critical**: For pharma companies that manufacture products.

### Required Endpoints:
- `POST /api/manufacturing/batches` - Create manufacturing batch
- `POST /api/manufacturing/bom` - Bill of Materials management
- `GET /api/manufacturing/schedule` - Production schedule
- `POST /api/manufacturing/qc-results` - Quality control results
- `GET /api/manufacturing/yield-analysis` - Production yield reports

### Key Features:
- Formula/recipe management
- Raw material consumption
- In-process quality checks
- Batch yield tracking
- GMP compliance

## 7. 📊 Regulatory Reporting API
**Why Critical**: Mandatory reporting to drug control authorities.

### Required Endpoints:
- `GET /api/reports/schedule-h` - Schedule H drug report
- `GET /api/reports/narcotic-psychotropic` - Narcotic/Psychotropic report
- `GET /api/reports/expired-destroyed` - Expired/destroyed items report
- `POST /api/reports/submit/{type}` - Submit reports to authorities
- `GET /api/reports/compliance-status` - Overall compliance status

### Key Features:
- Automated report generation
- Scheduled report submission
- Authority-specific formats
- Digital signature support
- Submission acknowledgments

## 8. 🚚 Multi-Location Transfer API
**Why Critical**: Pharma distributors often transfer stock between warehouses/branches.

### Required Endpoints:
- `POST /api/transfers` - Initiate stock transfer
- `GET /api/transfers/{id}/in-transit` - Track in-transit stock
- `POST /api/transfers/{id}/receive` - Receive transferred stock
- `GET /api/transfers/pending` - Pending transfers
- `POST /api/transfers/{id}/reconcile` - Reconcile differences

### Key Features:
- Inter-branch transfers
- Transit stock tracking
- Transfer pricing rules
- Damage/loss during transit
- Multi-approval workflow

## 9. 💰 Scheme & Discount Management API
**Why Critical**: Pharma industry has complex promotional schemes.

### Required Endpoints:
- `POST /api/schemes` - Create promotional scheme
- `GET /api/schemes/active` - Get active schemes
- `POST /api/schemes/{id}/apply` - Apply scheme to order
- `GET /api/products/{id}/applicable-schemes` - Get product schemes
- `POST /api/schemes/{id}/settlement` - Scheme claim settlement

### Key Features:
- Buy X Get Y schemes
- Volume-based discounts
- Product combination offers
- Scheme validity management
- Automatic scheme application

## 10. 🔐 Narcotic & Controlled Substance API
**Why Critical**: Special handling required for controlled substances.

### Required Endpoints:
- `POST /api/controlled-substances/register` - Register controlled drug
- `GET /api/controlled-substances/balance` - Narcotic register balance
- `POST /api/controlled-substances/dispense` - Record dispensing
- `GET /api/controlled-substances/audit-trail` - Complete audit trail
- `POST /api/controlled-substances/destroy` - Record destruction

### Key Features:
- Separate narcotic register
- Double verification
- Prescription linkage
- Destruction witnesses
- Regulatory reporting

## 🚀 Implementation Priority

### Phase 1 (Immediate):
1. Drug License & Compliance API
2. Batch Recall Management API
3. Prescription Management API
4. Regulatory Reporting API

### Phase 2 (Short-term):
5. Cold Chain Management API
6. Multi-Location Transfer API
7. Narcotic & Controlled Substance API

### Phase 3 (Medium-term):
8. Batch Splitting & Merging API
9. Scheme & Discount Management API
10. Manufacturing API (if needed)

## 📋 Next Steps

1. **Create API Specifications**: Design detailed OpenAPI specs for each API
2. **Database Schema Updates**: Add required tables for new features
3. **Implement Core APIs**: Start with Phase 1 APIs
4. **Integration Points**: Ensure new APIs integrate with existing modules
5. **Compliance Validation**: Verify regulatory requirements are met

These APIs are not "nice to have" - they are **essential** for a pharmaceutical ERP to be compliant and functional in the real world.