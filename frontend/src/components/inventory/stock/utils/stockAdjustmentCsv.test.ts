import { parseStockAdjustmentCsv } from './stockAdjustmentCsv';

const productId = '018f1e5a-7b2c-7abc-8def-0123456789ab';
const batchId = '018f1e5a-7b2c-7abc-9def-0123456789ac';
const header = 'product_id,batch_id,product_name,adjustment_quantity,reason,product_code,current_stock,notes';

describe('parseStockAdjustmentCsv', () => {
  it('accepts UUIDv7 identifiers and quoted commas without writing data', () => {
    const result = parseStockAdjustmentCsv(`${header}\n${productId},${batchId},"Pain Relief, 10 mg",12,physical_count,PAIN10,40,"Counted, twice"`);

    expect(result.errors).toEqual([]);
    expect(result.adjustmentType).toBe('increase');
    expect(result.reason).toBe('physical_count');
    expect(result.rows[0]).toMatchObject({
      productId,
      batchId,
      productName: 'Pain Relief, 10 mg',
      adjustmentQuantity: 12,
      currentStock: 40,
      notes: 'Counted, twice',
    });
  });

  it('reports missing headers and does not create preview rows', () => {
    const result = parseStockAdjustmentCsv(`product_id,product_name,adjustment_quantity,reason\n${productId},Test,1,count`);
    expect(result.rows).toEqual([]);
    expect(result.errors.join(' ')).toContain('batch_id');
  });

  it.each(['0', '1.5', 'not-a-number'])('rejects invalid quantity %s', quantity => {
    const result = parseStockAdjustmentCsv(`${header}\n${productId},${batchId},Test,${quantity},count,CODE,,`);
    expect(result.errors.join(' ')).toContain('non-zero whole number');
  });

  it('rejects non-canonical identifiers', () => {
    const result = parseStockAdjustmentCsv(`${header}\n123,456,Test,1,count,CODE,,`);
    expect(result.errors.join(' ')).toContain('product_id must be a canonical UUID');
    expect(result.errors.join(' ')).toContain('batch_id must be a canonical UUID');
  });

  it('rejects mixed directions and reasons because one command has one header', () => {
    const result = parseStockAdjustmentCsv([
      header,
      `${productId},${batchId},First,1,count,CODE,,`,
      `018f1e5a-7b2c-7abc-8def-0123456789ad,018f1e5a-7b2c-7abc-9def-0123456789ae,Second,-2,damage,CODE2,,`,
    ].join('\n'));

    expect(result.errors.join(' ')).toContain('same adjustment direction');
    expect(result.errors.join(' ')).toContain('same reason');
  });
});
