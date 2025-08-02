// Stock Movement Data Transformer
// Handles data transformation between frontend and backend formats

export const stockDataTransformer = {
  // Transform frontend stock movement to backend format
  transformMovementToBackend: (movementData, type) => {
    if (!movementData) return null;
    
    const baseData = {
      movement_date: movementData.date || new Date().toISOString().split('T')[0],
      reason: movementData.reason,
      notes: movementData.notes || '',
      created_by: movementData.created_by || 'system'
    };
    
    // Transform items to individual movements
    if (movementData.items && movementData.items.length > 0) {
      // For multiple items, return array of movements
      return movementData.items.map(item => ({
        ...baseData,
        product_id: item.product_id,
        quantity: parseFloat(item.quantity || 0),
        unit: item.unit || 'strip',
        batch_number: item.batch_number || item.batch_no || 'DEFAULT',
        expiry_date: item.expiry_date || null,
        ...(type === 'receive' ? {
          source_location: movementData.source_destination || ''
        } : {
          destination_location: movementData.source_destination || ''
        })
      }));
    } else {
      // Single movement
      return {
        ...baseData,
        product_id: movementData.product_id,
        quantity: parseFloat(movementData.quantity || 0),
        unit: movementData.unit || 'strip',
        batch_number: movementData.batch_number || 'DEFAULT',
        expiry_date: movementData.expiry_date || null,
        ...(type === 'receive' ? {
          source_location: movementData.source_destination || ''
        } : {
          destination_location: movementData.source_destination || ''
        })
      };
    }
  },
  
  // Transform backend movement to frontend format
  transformBackendToMovement: (backendData) => {
    if (!backendData) return null;
    
    return {
      movement_id: backendData.movement_id,
      movement_number: backendData.movement_number,
      type: backendData.movement_type,
      date: backendData.movement_date,
      product_id: backendData.product_id,
      product_name: backendData.product_name,
      quantity: parseFloat(backendData.quantity || 0),
      unit: backendData.unit,
      batch_number: backendData.batch_number,
      expiry_date: backendData.expiry_date,
      reason: backendData.reason,
      source_destination: backendData.source_location || backendData.destination_location || '',
      notes: backendData.notes,
      created_at: backendData.created_at,
      created_by: backendData.created_by
    };
  },
  
  // Transform stock transfer data
  transformTransferToBackend: (transferData) => {
    if (!transferData) return null;
    
    return {
      product_id: transferData.product_id,
      quantity: parseFloat(transferData.quantity || 0),
      movement_date: transferData.date || new Date().toISOString().split('T')[0],
      source_location: transferData.source_location || transferData.from_location,
      destination_location: transferData.destination_location || transferData.to_location,
      batch_number: transferData.batch_number || 'DEFAULT',
      expiry_date: transferData.expiry_date || null,
      notes: transferData.notes || '',
      reason: 'transfer',
      created_by: transferData.created_by || 'system'
    };
  },
  
  // Transform stock adjustment data
  transformAdjustmentToBackend: (adjustmentData) => {
    if (!adjustmentData) return null;
    
    return {
      product_id: adjustmentData.product_id,
      adjustment_type: adjustmentData.type || (adjustmentData.quantity > 0 ? 'increase' : 'decrease'),
      quantity: Math.abs(parseFloat(adjustmentData.quantity || 0)),
      movement_date: adjustmentData.date || new Date().toISOString().split('T')[0],
      reason: adjustmentData.reason || 'adjustment',
      batch_number: adjustmentData.batch_number || 'DEFAULT',
      notes: adjustmentData.notes || '',
      created_by: adjustmentData.created_by || 'system'
    };
  },
  
  // Validate stock movement data
  validateMovementData: (movementData, type) => {
    const errors = [];
    
    if (!movementData.movement_date) {
      errors.push('Movement date is required');
    }
    
    if (!movementData.reason) {
      errors.push('Reason is required');
    }
    
    // Check for items or single product
    if (movementData.items && movementData.items.length > 0) {
      // Validate each item
      movementData.items.forEach((item, index) => {
        if (!item.product_id) {
          errors.push(`Item ${index + 1}: Product is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
        }
      });
    } else {
      // Single product validation
      if (!movementData.product_id) {
        errors.push('Product is required');
      }
      if (!movementData.quantity || movementData.quantity <= 0) {
        errors.push('Quantity must be greater than 0');
      }
    }
    
    // Type-specific validation
    if (type === 'transfer') {
      if (!movementData.source_location) {
        errors.push('Source location is required for transfer');
      }
      if (!movementData.destination_location) {
        errors.push('Destination location is required for transfer');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  },
  
  // Transform batch stock data
  transformBatchStock: (batchData) => {
    if (!batchData) return null;
    
    return {
      batch_id: batchData.batch_id || batchData.inventory_id,
      batch_number: batchData.batch_number,
      product_id: batchData.product_id,
      product_name: batchData.product_name,
      current_stock: parseFloat(batchData.current_stock || 0),
      expiry_date: batchData.expiry_date,
      days_to_expiry: batchData.days_to_expiry,
      purchase_price: parseFloat(batchData.purchase_price || 0),
      selling_price: parseFloat(batchData.selling_price || 0),
      mrp: parseFloat(batchData.mrp || 0)
    };
  }
};

export default stockDataTransformer;