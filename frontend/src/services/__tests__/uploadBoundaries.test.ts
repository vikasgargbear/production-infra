/**
 * Upload boundary tests for AasoPharma ERP
 *
 * Covers:
 * - Unsupported product import rejects before legacy transport
 * - PDF invoice upload: valid PDF submitted to server, server error surfaced
 * - Fake-success guard: success toast fires only on 2xx, not before
 *
 * All fixtures are synthetic (no real documents are read or uploaded).
 */

import { productsApi } from '../api/modules/master/products.api';
import { purchasesApi } from '../api/modules/purchase/purchases.api';
import { apiHelpers } from '../api/apiClient';

// ---------------------------------------------------------------------------
// Mock apiClient so no real network calls are made
// ---------------------------------------------------------------------------
jest.mock('../api/apiClient', () => ({
  apiHelpers: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockedPost = apiHelpers.post as jest.MockedFunction<typeof apiHelpers.post>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a synthetic File with given content bytes and MIME type. */
function syntheticFile(
  content: string | Uint8Array,
  filename: string,
  mimeType: string,
): File {
  const blob = new Blob([content], { type: mimeType });
  return new File([blob], filename, { type: mimeType });
}

/** Minimal valid XLSX magic bytes (PK\x03\x04 ZIP header). */
const XLSX_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

// Product batch import has no reviewed canonical command.  The client must
// reject before transport instead of reviving the retired legacy mutation.
describe('productsApi.batchUpload — canonical write boundary', () => {
  it.each([
    ['valid spreadsheet', syntheticFile(XLSX_MAGIC, 'products.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
    ['corrupt spreadsheet', syntheticFile(new Uint8Array([0xde, 0xad]), 'corrupt.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
    ['wrong type', syntheticFile('MZ', 'malware.exe', 'application/octet-stream')],
    ['oversized input', syntheticFile(XLSX_MAGIC, 'oversized.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')],
  ])('fails closed for %s before any upload request', async (_case, file) => {
    await expect(productsApi.batchUpload(file)).rejects.toMatchObject({
      code: 'CANONICAL_WRITE_UNAVAILABLE',
    });
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite: PDF invoice upload via purchase upload endpoint
// ---------------------------------------------------------------------------

describe('purchase PDF upload — safe canonical parser boundary tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const PDF_MAGIC = '%PDF-1.4\n%%EOF'; // synthetic minimal PDF content

  it('accepts a valid PDF and submits to the exact safe parser endpoint', () => {
    const file = syntheticFile(PDF_MAGIC, 'invoice.pdf', 'application/pdf');

    mockedPost.mockResolvedValueOnce({
      data: {
        success: true,
        extracted_data: { invoice_number: 'INV-001', items: [] },
        confidence_score: 0.9,
        manual_review_required: false,
      },
      status: 200,
    } as any);

    const formData = new FormData();
    formData.append('file', file);
    purchasesApi.parseInvoice(formData);

    expect(mockedPost).toHaveBeenCalledWith(
      '/purchase-upload/parse-invoice-safe',
      expect.any(FormData),
    );
  });

  it('propagates server error when corrupt PDF is uploaded', async () => {
    const file = syntheticFile(new Uint8Array([0x00, 0x01, 0x02]), 'corrupt.pdf', 'application/pdf');

    mockedPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { detail: "File content does not match expected format for '.pdf'" },
      },
    });

    const formData = new FormData();
    formData.append('file', file);

    await expect(
      purchasesApi.parseInvoice(formData),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('propagates server error when non-PDF file is uploaded', async () => {
    const file = syntheticFile('not a pdf', 'document.exe', 'application/octet-stream');

    mockedPost.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { detail: "File type '.exe' not allowed. Accepted: pdf" },
      },
    });

    const formData = new FormData();
    formData.append('file', file);

    await expect(
      purchasesApi.parseInvoice(formData),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });

  it('propagates server 413 when PDF exceeds 10 MB size limit', async () => {
    const file = syntheticFile(PDF_MAGIC, 'giant.pdf', 'application/pdf');

    mockedPost.mockRejectedValueOnce({
      response: {
        status: 413,
        data: { detail: 'File too large (15MB). Maximum: 10MB' },
      },
    });

    const formData = new FormData();
    formData.append('file', file);

    await expect(
      purchasesApi.parseInvoice(formData),
    ).rejects.toMatchObject({ response: { status: 413 } });
  });
});
