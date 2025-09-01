import React from 'react';
import { usePurchase } from '../../../contexts/PurchaseContext';
import PharmaItemsTable from '../../global/PharmaItemsTable';

/**
 * Wrapper component to connect PharmaItemsTable with PurchaseContext
 * Handles all purchase-specific logic and data flow
 */
const PurchaseItemsTableWrapper = () => {
  const { 
    purchase, 
    updateItem, 
    removeItem, 
    addItem,
    calculateTotals 
  } = usePurchase();

  // Handle item updates
  const handleUpdateItem = (itemId, field, value) => {
    updateItem(itemId, field, value);
    // Calculations are triggered automatically in the context
  };

  // Handle item removal
  const handleRemoveItem = (itemId) => {
    removeItem(itemId);
    // Calculations are triggered automatically in the context
  };

  // Handle adding new item
  const handleAddItem = () => {
    addItem({
      product_id: '',
      product_name: '',
      batch_number: '',
      expiry_date: '',
      quantity: 1,
      free_quantity: 0,
      purchase_price: 0,
      mrp: 0,
      selling_price: 0,
      tax_percent: 12,
      discount_percent: 0
    });
  };

  return (
    <PharmaItemsTable
      items={purchase.items || []}
      onUpdateItem={handleUpdateItem}
      onRemoveItem={handleRemoveItem}
      onAddItem={handleAddItem}
      totals={{
        subtotal: purchase.subtotal_amount || 0,
        tax: purchase.tax_amount || 0,
        discount: purchase.discount_amount || 0,
        total: purchase.final_amount || 0
      }}
      readOnly={false}
      showActions={true}
      showTotals={true}
      title="Purchase Items"
    />
  );
};

export default PurchaseItemsTableWrapper;