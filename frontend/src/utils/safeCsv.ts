/** Quote a CSV cell and neutralize spreadsheet formulas, including after leading whitespace. */
export const safeCsvCell = (value: unknown): string => {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const safeCsvRows = (rows: readonly (readonly unknown[])[]): string => (
  rows.map(row => row.map(safeCsvCell).join(',')).join('\n')
);
