import apiClient from '../../apiClient';

export type GSTJurisdictionUsage =
  | 'domestic_address'
  | 'gstin_registration'
  | 'place_of_supply';

export interface CanonicalGSTJurisdiction {
  code: string;
  display_name: string;
  jurisdiction_kind: 'state' | 'union_territory' | 'special';
  effective_from: string;
  effective_to: string | null;
  source_authority: string;
  authority_catalog_uri: string;
  source_uri: string;
  source_publication_date: string;
  source_retrieved_at: string;
  source_document_sha256: string;
  dataset_sha256: string;
  source_record_sha256: string;
}

export const gstJurisdictionsApi = {
  list: (usage: GSTJurisdictionUsage, effectiveOn?: string) =>
    apiClient.get<CanonicalGSTJurisdiction[]>(
      '/canonical/reference/gst-jurisdictions',
      { params: { usage, ...(effectiveOn ? { effective_on: effectiveOn } : {}) } },
    ),
};
