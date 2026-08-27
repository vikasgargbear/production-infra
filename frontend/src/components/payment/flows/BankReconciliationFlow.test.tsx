import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import BankReconciliationFlow from './BankReconciliationFlow';
import { canonicalControlledOperationsApi } from '../../../services/api/modules/controlledOperations.api';
import { getCanonicalCommandStatus } from '../../../services/api/canonicalOperatorActions';

jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
jest.mock('../../../services/api/modules/controlledOperations.api', () => ({
  canonicalControlledOperationsApi: {
    bankContext: jest.fn(),
    bankReadback: jest.fn(),
  },
}));
jest.mock('../../../services/api/canonicalOperatorActions', () => ({
  approveCanonicalAction: jest.fn(),
  executeApprovedCanonicalAction: jest.fn(),
  getCanonicalCommandReview: jest.fn(),
  getCanonicalCommandStatus: jest.fn(),
  prepareCanonicalAction: jest.fn(),
}));

const commandId = 'd3000000-0000-7000-8000-000000000041';

beforeEach(() => {
  jest.clearAllMocks();
  (canonicalControlledOperationsApi.bankContext as jest.Mock).mockResolvedValue({ data: {
    organization_id: 'd3000000-0000-7000-8000-000000000001',
    business_date: '2026-08-27',
    statement_import_available: false,
    statement_import_message: 'Import is not enabled.',
    candidates: [],
  } });
});

const openStatus = async () => {
  render(<BankReconciliationFlow />);
  await waitFor(() => expect(canonicalControlledOperationsApi.bankContext).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: '3. Execute & verify' }));
  fireEvent.change(screen.getByLabelText('Command ID'), { target: { value: commandId } });
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
};

it('shows the authoritative approved status before enabling requester execution', async () => {
  (getCanonicalCommandStatus as jest.Mock).mockResolvedValue({ data: {
    command_request_id: commandId,
    preview_hash: `sha256:${'a'.repeat(64)}`,
    status: 'approved',
  } });

  await openStatus();

  expect(await screen.findByText('approved', { selector: 'strong' })).not.toBeNull();
  expect(screen.getByRole('checkbox', {
    name: 'Execute this approved immutable match once.',
  })).not.toBeNull();
  expect(getCanonicalCommandStatus).toHaveBeenCalledWith(commandId);
});

it('shows a structured status error without exposing attached request payload', async () => {
  (getCanonicalCommandStatus as jest.Mock).mockRejectedValue({ response: { data: { detail: {
    message: 'Canonical command status is temporarily unavailable.',
    input: { password: 'must-not-render', statement_reference: 'must-not-render' },
  } } } });

  await openStatus();

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Canonical command status is temporarily unavailable.');
  expect(alert.textContent).not.toMatch(/password|statement_reference|must-not-render/);
  expect(screen.queryByRole('checkbox', {
    name: 'Execute this approved immutable match once.',
  })).toBeNull();
});
