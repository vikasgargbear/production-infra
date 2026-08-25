import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { gstJurisdictionsApi } from '../../../../services/api/modules/master/gstJurisdictions.api';
import GSTJurisdictionSelect from './GSTJurisdictionSelect';


jest.mock('../../../../services/api/modules/master/gstJurisdictions.api', () => ({
  gstJurisdictionsApi: { list: jest.fn() },
}));

const mockList = gstJurisdictionsApi.list as jest.MockedFunction<typeof gstJurisdictionsApi.list>;

const jurisdiction = {
  code: '27',
  display_name: 'Maharashtra',
  jurisdiction_kind: 'state' as const,
  effective_from: '2017-07-01',
  effective_to: null,
  source_authority: 'GSTN',
  authority_catalog_uri: 'https://einvoice1.gst.gov.in/Others/MasterCodes',
  source_uri: 'https://gst.example/source.pdf',
  source_publication_date: '2026-03-31',
  source_retrieved_at: '2026-08-25T10:20:00Z',
  source_document_sha256: 'a'.repeat(64),
  dataset_sha256: 'b'.repeat(64),
  source_record_sha256: 'c'.repeat(64),
};

describe('GSTJurisdictionSelect', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads the canonical API catalog and emits only its exact code', async () => {
    mockList.mockResolvedValue({ data: [jurisdiction] } as any);
    const onChange = jest.fn();
    render(<GSTJurisdictionSelect aria-label="GST jurisdiction" value="" onChange={onChange} />);

    const select = screen.getByRole('combobox', { name: 'GST jurisdiction' });
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
    expect(mockList).toHaveBeenCalledWith('domestic_address', undefined);
    fireEvent.change(select, { target: { value: '27' } });
    expect(onChange).toHaveBeenCalledWith('27');
    expect(screen.getByRole('option', { name: '27 — Maharashtra' })).toBeTruthy();
  });

  it('fails closed without a free-text or cached-code fallback', async () => {
    mockList.mockRejectedValue(new Error('unavailable'));
    render(<GSTJurisdictionSelect aria-label="GST jurisdiction" value="27" onChange={jest.fn()} />);

    const select = screen.getByRole('combobox', { name: 'GST jurisdiction' });
    await waitFor(() => expect(select.getAttribute('aria-invalid')).toBe('true'));
    expect((select as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByRole('option').textContent).toBe('GST jurisdictions unavailable');
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
