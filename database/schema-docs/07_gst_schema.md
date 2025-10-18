# GST Schema Documentation

**Schema:** `gst`
**Purpose:** GST compliance, returns filing, reconciliation
**Last Updated:** 2025-10-16
**Tables:** 15

---

## Overview

The `gst` schema manages complete GST (Goods and Services Tax) compliance for India including tax rates, HSN/SAC codes, GSTR-1/2A/2B/3B returns, e-invoicing, e-way bills, reconciliation, audit trail, and GST credit ledger.

---

## Tables Summary

| # | Table | Purpose | Primary Key | Key Features |
|---|-------|---------|-------------|--------------|
| 1 | gst_rates | GST rate master | rate_id | Product/service tax rates |
| 2 | hsn_sac_codes | HSN/SAC code master | hsn_id | Goods/services classification |
| 3 | gstr1_data | GSTR-1 outward supplies | gstr1_id | Sales data for filing |
| 4 | gstr2a_data | GSTR-2A inward supplies | gstr2a_id | Auto-populated purchase data |
| 5 | gstr2b_data | GSTR-2B static data | gstr2b_id | ITC-eligible purchases |
| 6 | gstr3b_data | GSTR-3B summary | gstr3b_id | Monthly GST liability |
| 7 | gst_liability | GST liability ledger | liability_id | Tax payable tracking |
| 8 | gst_credit_ledger | ITC credit ledger | credit_id | Input tax credit |
| 9 | advance_receipts | Advance payments | advance_id | Advance GST liability |
| 10 | eway_bills | E-way bill tracking | eway_bill_id | Transport compliance |
| 11 | gst_reconciliation | GST rec summary | reconciliation_id | Books vs GSTN matching |
| 12 | purchase_reconciliation | Purchase matching | reconciliation_id | GSTR-2A vs books |
| 13 | return_filing_status | Filing status tracker | filing_id | GSTR-1/3B filing dates |
| 14 | compliance_calendar | GST due dates | calendar_id | Filing reminders |
| 15 | gst_audit_trail | GST change log | audit_id | All GST-related changes |

---

## Related Documentation

- [MASTER_SCHEMA_INDEX.md](./MASTER_SCHEMA_INDEX.md) - All schemas
- [04_sales_schema.md](./04_sales_schema.md) - GSTR-1 data source
- [05_procurement_schema.md](./05_procurement_schema.md) - GSTR-2A/2B reconciliation

---

**Documentation Status:** ✅ Updated 2025-10-16
**Schema Version:** Production (Railway)
**Total Tables:** 15
**Key Features:** GSTR-1/2A/2B/3B Returns, E-invoice Integration, GST Reconciliation, ITC Tracking, Compliance Calendar
