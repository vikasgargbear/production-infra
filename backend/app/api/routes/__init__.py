"""
API Routes Package

Routes are now organized into domain-based folders:
- auth/       - Authentication & authorization
- master/     - Master data (customers, products, etc.)
- sales/      - Sales orders, invoices, returns
- purchase/   - Purchase orders, GRN, returns
- inventory/  - Stock management
- finance/    - Payments, ledger, journal
- compliance/ - GST, regulatory
- analytics/  - Dashboards, reports
- org/        - Company settings, setup
- settings/   - Business/feature settings

Legacy flat files remain for backwards compatibility but new code
should import from domain folders.
"""

# Only export essential utilities that other modules might need
# Domain-specific routers are imported directly in main.py

__all__ = []