import { TextDecoder, TextEncoder } from 'util';

Object.defineProperties(globalThis, {
  TextDecoder: { configurable: true, value: TextDecoder },
  TextEncoder: { configurable: true, value: TextEncoder },
});

const { jsPDF } = require('jspdf') as typeof import('jspdf');
const { autoTable } = require('jspdf-autotable') as typeof import('jspdf-autotable');
const html2pdfModule = require('html2pdf.js') as {
  default?: typeof import('html2pdf.js').default;
} & typeof import('html2pdf.js').default;
const html2pdf = html2pdfModule.default ?? html2pdfModule;

test('jsPDF and AutoTable generate a PDF byte stream through their ESM APIs', () => {
  const document = new jsPDF();
  document.text('AASO Pharma PDF smoke test', 14, 16);
  autoTable(document, {
    startY: 22,
    head: [['Item', 'Amount']],
    body: [['Paracetamol', '100.00']],
  });

  const output = document.output('arraybuffer');
  const header = String.fromCharCode(...new Uint8Array(output).slice(0, 5));

  expect(header).toBe('%PDF-');
  expect(output.byteLength).toBeGreaterThan(500);
  expect(document.getNumberOfPages()).toBe(1);
});

test('html2pdf exposes the browser worker chain used by invoice and return flows', () => {
  const source = document.createElement('section');
  source.textContent = 'Invoice INV-001';

  const worker = html2pdf();
  const configured = worker.set({
    margin: [5, 5, 5, 5],
    filename: 'invoice.pdf',
    image: { type: 'jpeg', quality: 1 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  });
  const sourced = configured.from(source);

  expect(typeof configured.from).toBe('function');
  expect(typeof sourced.toCanvas).toBe('function');
  expect(typeof sourced.toPdf).toBe('function');
  expect(typeof sourced.save).toBe('function');
  expect(typeof sourced.catch).toBe('function');
});
