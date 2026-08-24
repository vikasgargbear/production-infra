import type { StockItem } from '../types/stock.types';

const requiredNumber = (value: unknown, field: string, row: number): number => {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Current stock row ${row} is missing ${field}`);
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Current stock row ${row} has invalid ${field}`);
  return parsed;
};

/** Strict decoder for the canonical product-grain current-stock DTO. */
export const normalizeCurrentStock = (rows: unknown): StockItem[] => {
  if (!Array.isArray(rows)) throw new Error('Current stock response must be an array');

  return rows.map((row: Record<string, unknown>, index) => {
    const rowNumber = index + 1;
    if (!row || typeof row !== 'object') throw new Error(`Current stock row ${rowNumber} is invalid`);
    if (typeof row.product_id !== 'string' || typeof row.product_name !== 'string') {
      throw new Error(`Current stock row ${rowNumber} is missing product identity`);
    }

    const quantity = requiredNumber(row.total_quantity_available, 'total_quantity_available', rowNumber);
    const totalValue = requiredNumber(row.total_value, 'total_value', rowNumber);
    const nearExpiry = requiredNumber(row.near_expiry_batches, 'near_expiry_batches', rowNumber);

    return {
      product_id: row.product_id,
      product_name: row.product_name,
      product_code: typeof row.product_code === 'string' ? row.product_code : undefined,
      generic_name: typeof row.generic_name === 'string' ? row.generic_name : undefined,
      category: typeof row.category === 'string' ? row.category : undefined,
      product_type: typeof row.product_type === 'string' ? row.product_type : undefined,
      hsn_code: typeof row.hsn_code === 'string' ? row.hsn_code : undefined,
      unit: typeof row.unit === 'string' ? row.unit : undefined,
      total_quantity_available: quantity,
      available_stock: quantity,
      cost_per_unit: requiredNumber(row.cost_per_unit, 'cost_per_unit', rowNumber),
      total_batches: requiredNumber(row.total_batches, 'total_batches', rowNumber),
      expired_batches: requiredNumber(row.expired_batches, 'expired_batches', rowNumber),
      near_expiry_batches: nearExpiry,
      expiry_alert: nearExpiry > 0,
      total_value: totalValue,
      stock_value: totalValue,
      requires_cold_chain: row.requires_cold_chain === true,
    };
  });
};
