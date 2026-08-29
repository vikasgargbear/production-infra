import { apiHelpers } from '../../apiClient';

export type LicenseSubjectKind = 'branch' | 'supplier';
export type WholesaleLicenseType = 'drug_wholesale_form_20b' | 'drug_wholesale_form_21b';

export interface LicenseSubjectOption {
  id: string;
  code: string;
  name: string;
}

export interface DrugLicenseReadback {
  license_id: string;
  subject_kind: LicenseSubjectKind;
  subject_id: string;
  subject_code: string;
  subject_name: string;
  evidence_branch_id: string;
  license_type_code: WholesaleLicenseType;
  license_number: string;
  issuing_authority: string;
  jurisdiction_code: string;
  issued_on: string;
  valid_from: string;
  next_verification_due_on: string;
  evidence_attachment_id: string;
  evidence_filename: string;
  evidence_sha256: string;
  status: 'active';
  verified_at: string;
  row_version: number;
}

export interface DrugLicenseSetupContext {
  business_date: string;
  branches: LicenseSubjectOption[];
  suppliers: LicenseSubjectOption[];
  licenses: DrugLicenseReadback[];
  supported_license_types: WholesaleLicenseType[];
  controlled_drug_scope: 'unsupported';
  controlled_drug_message: string;
}

export interface DrugLicenseRecordInput {
  subject_kind: LicenseSubjectKind;
  subject_id: string;
  evidence_branch_id: string;
  license_type_code: WholesaleLicenseType;
  license_number: string;
  issuing_authority: string;
  jurisdiction_code: string;
  issued_on: string;
  valid_from: string;
  next_verification_due_on: string;
  evidence_attachment_id: string;
  reviewed: true;
  idempotency_key: string;
}

export const drugLicensesApi = {
  setup: async (): Promise<DrugLicenseSetupContext> => (
    await apiHelpers.get<DrugLicenseSetupContext>('/canonical/compliance/drug-licenses/setup')
  ).data,

  uploadEvidence: async (branchId: string, issuedOn: string, file: File) => {
    const body = new FormData();
    body.set('branch_id', branchId);
    body.set('issued_on', issuedOn);
    body.set('file', file);
    return (await apiHelpers.post<{ attachment_id: string }>(
      '/canonical/compliance/drug-licenses/evidence', body,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )).data;
  },

  record: async (input: DrugLicenseRecordInput) => (
    await apiHelpers.post<{ license: DrugLicenseReadback; idempotency_replayed: boolean }>(
      '/canonical/compliance/drug-licenses', input,
    )
  ).data,
};

export default drugLicensesApi;
