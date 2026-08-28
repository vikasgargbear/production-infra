import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import InventoryDestructionFlow from './InventoryDestructionFlow';
import { canonicalControlledOperationsApi } from '../../../services/api/modules/controlledOperations.api';
import { getCanonicalCommandStatus } from '../../../services/api/canonicalOperatorActions';

jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
jest.mock('../../../services/api/modules/controlledOperations.api', () => ({
  canonicalControlledOperationsApi: {
    destructionContext: jest.fn(),
    destructionReadback: jest.fn(),
  },
}));
jest.mock('../../../services/api/canonicalOperatorActions', () => ({
  approveCanonicalAction: jest.fn(),
  executeApprovedCanonicalAction: jest.fn(),
  getCanonicalCommandReview: jest.fn(),
  getCanonicalCommandStatus: jest.fn(),
  prepareCanonicalAction: jest.fn(),
}));

const commandId = 'd3000000-0000-7000-8000-000000000051';

beforeEach(() => {
  jest.clearAllMocks();
  (canonicalControlledOperationsApi.destructionContext as jest.Mock).mockResolvedValue({
    data: {
      organization_id: 'd3000000-0000-7000-8000-000000000001',
      business_date: '2026-08-27',
      ready: false,
      blocking_reasons: ['No eligible evidence-bound stock.'],
      method_code: 'licensed_incineration',
      itc_treatment: 'section_17_5_h_reversal',
      certificate_upload_available: false,
      certificate_upload_message: 'Upload is not enabled.',
      candidates: [],
      certificates: [],
      itc_reversal_evidence: [],
    },
  });
});

it('shows projected approval evidence before requester destruction execution', async () => {
  (getCanonicalCommandStatus as jest.Mock).mockResolvedValue({
    data: {
      command_request_id: commandId,
      preview_hash: `sha256:${'b'.repeat(64)}`,
      status: 'approved',
    },
  });

  render(<InventoryDestructionFlow />);
  await waitFor(() => {
    expect(canonicalControlledOperationsApi.destructionContext).toHaveBeenCalled();
  });
  fireEvent.click(screen.getByRole('button', { name: '3. Execute & verify' }));
  fireEvent.change(screen.getByLabelText('Command ID'), {
    target: { value: commandId },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }));

  expect(await screen.findByText('approved', { selector: 'strong' })).not.toBeNull();
  expect(screen.getByRole('checkbox', {
    name: 'Execute this approved immutable destruction and Section 17(5)(h) reversal once.',
  })).not.toBeNull();
  expect(getCanonicalCommandStatus).toHaveBeenCalledWith(commandId);
});
