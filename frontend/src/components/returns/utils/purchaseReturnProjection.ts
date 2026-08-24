import type { ItemsTableItem } from '../../global/ui/display/ItemsTableUnified';

export interface PurchaseReturnProjectionItem extends ItemsTableItem {
  id: string | number;
  product_id: number | string;
  product_name: string;
  batch_id: number | string;
  return_quantity: number;
  original_quantity: number;
  max_returnable_qty: number;
  selected: boolean;
  is_manual: boolean;
}

export function manualPurchaseReturnItem(product: any): PurchaseReturnProjectionItem {
  if (!product?.product_id || !product?.batch_id) {
    throw new Error('Select a product and an available batch to add this return item.');
  }
  const availableQuantity = Number(product.quantity_available ?? product.available_quantity ?? 0);
  if (!Number.isFinite(availableQuantity) || availableQuantity <= 0) {
    throw new Error('The selected batch has no available quantity to return.');
  }
  return {
    id: `manual_${String(product.product_id)}_${String(product.batch_id)}`,
    product_id: product.product_id,
    product_name: product.product_name || product.name || 'Product',
    product_code: product.product_code,
    batch_id: product.batch_id,
    batch_number: product.batch_number || '',
    original_quantity: availableQuantity,
    return_quantity: 1,
    unit_price: Number(product.cost_per_unit ?? product.unit_price ?? 0),
    tax_percent: Number(product.gst_percent ?? product.tax_percent ?? 0),
    discount_percent: 0,
    selected: true,
    is_manual: true,
    max_returnable_qty: availableQuantity,
    expiry_date: product.expiry_date,
    disposition: 'RETURN_TO_VENDOR',
    restock: false,
  };
}

export function purchaseReturnItemsForTable(items: any[]): ItemsTableItem[] {
  return items.map(item => ({
    ...item,
    quantity: Number(item.return_quantity || 0),
    gst_percent: Number(item.tax_percent || 0),
  }));
}

export function updatePurchaseReturnItem(items: any[], index: number, field: string, value: unknown): any[] {
  const stateField = field === 'quantity' ? 'return_quantity' : field;
  return items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const nextValue = stateField === 'return_quantity' || stateField === 'unit_price'
      ? Number(value || 0)
      : value;
    return { ...item, [stateField]: nextValue };
  });
}
