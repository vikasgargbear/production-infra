"""
Service layer for business logic

Organized by domain:
- sales/:     Order services
- purchase/:  Purchase services
- finance/:   Payment, Ledger, Credit Note services
- inventory/: Inventory services
- master/:    Product, Customer services
- returns/:   Return services (sales & purchase)
- settings/:  Settings services
- email/:     Email services

Legacy sales/master write services are retired; reviewed commands own writes.
"""
# Import concrete modules directly.  Eager compatibility re-exports used to
# pull retired master/GST services into every API process.
__all__: list[str] = []
