export type StockAdjustmentCsvRow = {
  productId: string;
  batchId: string;
  productName: string;
  productCode: string;
  adjustmentQuantity: number;
  reason: string;
  notes: string;
  currentStock: number | null;
};

export type StockAdjustmentCsvResult = {
  rows: StockAdjustmentCsvRow[];
  errors: string[];
  adjustmentType: 'increase' | 'decrease' | null;
  reason: string | null;
};

const REQUIRED_HEADERS = [
  'product_id',
  'batch_id',
  'product_name',
  'adjustment_quantity',
  'reason',
] as const;

const ALLOWED_HEADERS = new Set([
  ...REQUIRED_HEADERS,
  'product_code',
  'current_stock',
  'notes',
]);

// Canonical identifiers are UUIDs. Version 7 is intentionally accepted.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseCsvRecords = (text: string): string[][] => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      record.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1;
      record.push(field.trim());
      field = '';
      if (record.some(value => value !== '')) records.push(record);
      record = [];
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV contains an unclosed quoted value.');
  record.push(field.trim());
  if (record.some(value => value !== '')) records.push(record);
  return records;
};

export const parseStockAdjustmentCsv = (text: string): StockAdjustmentCsvResult => {
  const empty: StockAdjustmentCsvResult = {
    rows: [],
    errors: [],
    adjustmentType: null,
    reason: null,
  };

  let records: string[][];
  try {
    records = parseCsvRecords(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    return { ...empty, errors: [error instanceof Error ? error.message : 'CSV could not be parsed.'] };
  }

  if (records.length < 2) {
    return { ...empty, errors: ['CSV must contain a header and at least one data row.'] };
  }

  const headers = records[0].map(header => header.trim().toLowerCase());
  const errors: string[] = [];
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length > 0) errors.push(`Duplicate header(s): ${Array.from(new Set(duplicates)).join(', ')}.`);

  const missing = REQUIRED_HEADERS.filter(header => !headers.includes(header));
  if (missing.length > 0) errors.push(`Missing required header(s): ${missing.join(', ')}.`);

  const unsupported = headers.filter(header => !ALLOWED_HEADERS.has(header));
  if (unsupported.length > 0) errors.push(`Unsupported header(s): ${unsupported.join(', ')}.`);
  if (errors.length > 0) return { ...empty, errors };

  const indexOf = (header: string) => headers.indexOf(header);
  const rows: StockAdjustmentCsvRow[] = [];

  records.slice(1).forEach((values, rowIndex) => {
    const line = rowIndex + 2;
    if (values.length !== headers.length) {
      errors.push(`Row ${line}: expected ${headers.length} columns but found ${values.length}.`);
      return;
    }

    const productId = values[indexOf('product_id')];
    const batchId = values[indexOf('batch_id')];
    const productName = values[indexOf('product_name')];
    const quantityText = values[indexOf('adjustment_quantity')];
    const reason = values[indexOf('reason')];
    const productCodeIndex = indexOf('product_code');
    const currentStockIndex = indexOf('current_stock');
    const notesIndex = indexOf('notes');
    const quantity = Number(quantityText);
    const currentStockText = currentStockIndex >= 0 ? values[currentStockIndex] : '';
    const currentStock = currentStockText === '' ? null : Number(currentStockText);

    if (!UUID_PATTERN.test(productId)) errors.push(`Row ${line}: product_id must be a canonical UUID.`);
    if (!UUID_PATTERN.test(batchId)) errors.push(`Row ${line}: batch_id must be a canonical UUID.`);
    if (!productName) errors.push(`Row ${line}: product_name is required.`);
    if (!Number.isSafeInteger(quantity) || quantity === 0) {
      errors.push(`Row ${line}: adjustment_quantity must be a non-zero whole number.`);
    }
    if (!reason) errors.push(`Row ${line}: reason is required.`);
    if (currentStock !== null && (!Number.isFinite(currentStock) || currentStock < 0)) {
      errors.push(`Row ${line}: current_stock must be blank or a non-negative number.`);
    }

    if (
      UUID_PATTERN.test(productId)
      && UUID_PATTERN.test(batchId)
      && productName
      && Number.isSafeInteger(quantity)
      && quantity !== 0
      && reason
      && (currentStock === null || (Number.isFinite(currentStock) && currentStock >= 0))
    ) {
      rows.push({
        productId,
        batchId,
        productName,
        productCode: productCodeIndex >= 0 ? values[productCodeIndex] : '',
        adjustmentQuantity: quantity,
        reason,
        notes: notesIndex >= 0 ? values[notesIndex] : '',
        currentStock,
      });
    }
  });

  const directions = new Set(rows.map(row => row.adjustmentQuantity > 0 ? 'increase' : 'decrease'));
  if (directions.size > 1) errors.push('All rows must use the same adjustment direction; split increases and decreases into separate files.');

  const reasons = new Set(rows.map(row => row.reason));
  if (reasons.size > 1) errors.push('All rows must use the same reason; split different reasons into separate files.');

  return {
    rows,
    errors,
    adjustmentType: directions.size === 1 ? Array.from(directions)[0] as 'increase' | 'decrease' : null,
    reason: reasons.size === 1 ? Array.from(reasons)[0] : null,
  };
};
