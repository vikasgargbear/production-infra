import * as XLSX from 'xlsx';

const EXPECTED_SHEETJS_VERSION = '0.20.3';
const EXPECTED_ROWS = [
  {
    'Product Name': 'Paracetamol 500mg',
    Quantity: '10',
    Rate: '12.5',
  },
];

function createUploadWorkbook(): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([['Instructions'], ['Use the Data sheet']]);
  const data = XLSX.utils.aoa_to_sheet([
    ['Product Name', 'Quantity', 'Rate'],
    ['Paracetamol 500mg', 10, 12.5],
  ]);

  data['!cols'] = [{ wch: 24 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(workbook, instructions, 'Instructions');
  XLSX.utils.book_append_sheet(workbook, data, 'Data');
  return workbook;
}

function assertWorkbookRoundTrip(bookType: 'xlsx' | 'xls'): void {
  const bytes = XLSX.write(createUploadWorkbook(), { bookType, type: 'array' });
  const parsed = XLSX.read(bytes, { type: 'array' });

  expect(parsed.SheetNames).toEqual(['Instructions', 'Data']);
  expect(XLSX.utils.sheet_to_json(parsed.Sheets.Data, { raw: false })).toEqual(EXPECTED_ROWS);
}

test('pins the remediated official SheetJS release', () => {
  expect(XLSX.version).toBe(EXPECTED_SHEETJS_VERSION);
});

test('preserves XLSX template output and formatted upload parsing', () => {
  assertWorkbookRoundTrip('xlsx');
});

test('preserves legacy XLS upload parsing', () => {
  assertWorkbookRoundTrip('xls');
});

test('preserves CSV upload parsing with formatted string values', () => {
  const csv = 'Product Name,Quantity,Rate\nParacetamol 500mg,10,12.5\n';
  const parsed = XLSX.read(csv, { type: 'string' });
  const firstSheet = parsed.Sheets[parsed.SheetNames[0]];

  expect(XLSX.utils.sheet_to_json(firstSheet, { raw: false })).toEqual(EXPECTED_ROWS);
});
