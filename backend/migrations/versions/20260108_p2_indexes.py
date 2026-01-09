"""P2 Additional Indexes

Revision ID: 20260108_p2_indexes
Revises: 20260108_critical_indexes
Create Date: 2026-01-08

"""
from alembic import op

# revision identifiers
revision = '20260108_p2_indexes'
down_revision = '20260108_critical_indexes'
branch_labels = None
depends_on = None


def upgrade():
    """
    P2-4,5: Add additional indexes for common filter patterns.
    All created CONCURRENTLY for zero-downtime deployment.
    """
    
    # P2-4: GRN status filter index
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grns_status_org 
        ON procurement.goods_receipt_notes(grn_status, org_id)
    """)
    
    # P2-5: GRN date range index
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_grns_date_org 
        ON procurement.goods_receipt_notes(org_id, grn_date DESC)
    """)
    
    # P2-4: Purchase order status index
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_status_org 
        ON procurement.purchase_orders(order_status, org_id)
    """)
    
    # P2-5: Purchase order date range index
    op.execute("""
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_date_org 
        ON procurement.purchase_orders(org_id, order_date DESC)
    """)


def downgrade():
    """Remove P2 indexes"""
    op.execute("DROP INDEX IF EXISTS procurement.idx_grns_status_org")
    op.execute("DROP INDEX IF EXISTS procurement.idx_grns_date_org")
    op.execute("DROP INDEX IF EXISTS procurement.idx_po_status_org")
    op.execute("DROP INDEX IF EXISTS procurement.idx_po_date_org")
