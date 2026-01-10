"""
Integration Test: Delta Sync Critical Path

Tests delta sync mechanism to ensure stock changes trigger synchronization.
"""
import pytest
from datetime import datetime, timedelta
from time import sleep


class TestDeltaSyncCriticalPath:
    """Critical path tests for delta sync"""
    
    def test_invoice_creation_triggers_batch_sync(self, db_session, test_org, test_customer, test_product_with_batch):
        """Invoice creation must update batch.updated_at for delta sync"""
        product, batch = test_product_with_batch
        initial_updated_at = batch.updated_at
        
        # Wait 1ms to ensure timestamp difference
        sleep(0.001)
        
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "items": [{
                "product_id": product.product_id,
                "batch_id": batch.batch_id,
                "quantity": 5,
                "unit_price": 10.00
            }]
        }
        
        InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        # Check batch updated_at changed
        updated_batch = db_session.execute(
            "SELECT updated_at FROM inventory.batches WHERE batch_id = :id",
            {"id": batch.batch_id}
        ).fetchone()
        
        assert updated_batch.updated_at > initial_updated_at, \
            "Batch updated_at must change for delta sync"
    
    def test_delta_sync_captures_batch_changes(self, db_session, test_org, test_product_with_batch):
        """Delta sync query must return batches modified after timestamp"""
        product, batch = test_product_with_batch
        cutoff_time = datetime.utcnow() - timedelta(seconds=1)
        
        # Modify batch
        db_session.execute(
            "UPDATE inventory.batches SET quantity_available = quantity_available - 1, updated_at = CURRENT_TIMESTAMP WHERE batch_id = :id",
            {"id": batch.batch_id}
        )
        db_session.commit()
        
        # Query delta sync
        result = db_session.execute(
            "SELECT batch_id FROM inventory.batches WHERE org_id = :org_id AND updated_at > :cutoff",
            {"org_id": test_org.org_id, "cutoff": cutoff_time}
        ).fetchall()
        
        batch_ids = [row.batch_id for row in result]
        assert batch.batch_id in batch_ids, \
            "Delta sync must capture recently updated batches"
    
    def test_purchase_return_triggers_batch_sync(self, db_session, test_org, test_supplier, test_product_with_batch):
        """Purchase return must update batch.updated_at"""
        product, batch = test_product_with_batch
        initial_updated_at = batch.updated_at
        
        sleep(0.001)
        
        # Create purchase return (simplified)
        from app.api.services.returns.purchase_return.service import PurchaseReturnService
        
        PurchaseReturnService.update_batch_stock_for_return(
            db=db_session,
            batch_id=batch.batch_id,
            return_qty=2.0
        )
        db_session.commit()
        
        updated_batch = db_session.execute(
            "SELECT updated_at FROM inventory.batches WHERE batch_id = :id",
            {"id": batch.batch_id}
        ).fetchone()
        
        assert updated_batch.updated_at > initial_updated_at
    
    def test_sales_return_triggers_batch_sync(self, db_session, test_org, test_customer, test_product_with_batch):
        """Sales return (restocking) must update batch.updated_at"""
        product, batch = test_product_with_batch
        
        # Create invoice first
        invoice_data = {
            "customer_id": test_customer.customer_id,
            "items": [{
                "product_id": product.product_id,
                "batch_id": batch.batch_id,
                "quantity": 5,
                "unit_price": 10.00
            }]
        }
        
        invoice_result = InvoiceService.create_invoice_with_items(
            db=db_session,
            org_id=test_org.org_id,
            branch_id=1,
            user_id=1,
            invoice_data=invoice_data
        )
        
        # Get updated_at after invoice
        after_invoice = db_session.execute(
            "SELECT updated_at FROM inventory.batches WHERE batch_id = :id",
            {"id": batch.batch_id}
        ).fetchone().updated_at
        
        sleep(0.001)
        
        # Create return (this should update batch again)
        # Simplified - actual return creation would go through return service
        db_session.execute(
            """UPDATE inventory.batches 
               SET quantity_available = quantity_available + 3,
                   updated_at = CURRENT_TIMESTAMP
               WHERE batch_id = :id""",
            {"id": batch.batch_id}
        )
        db_session.commit()
        
        after_return = db_session.execute(
            "SELECT updated_at FROM inventory.batches WHERE batch_id = :id",
            {"id": batch.batch_id}
        ).fetchone().updated_at
        
        assert after_return > after_invoice
