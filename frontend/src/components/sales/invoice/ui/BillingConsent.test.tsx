import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BillingConsent from './BillingConsent';
import { billingConsentApi } from '../../../../services/api/modules/billingConsent.api';

jest.mock('../../../../services/api/modules/billingConsent.api', () => ({
  billingConsentApi: { read: jest.fn(), create: jest.fn(), revoke: jest.fn() },
}));
const api = billingConsentApi as jest.Mocked<typeof billingConsentApi>;
const snapshot = { can_manage: true, branches: [{id:'branch-1', name:'Main'}], grants: [] };
beforeEach(() => {
  jest.clearAllMocks();
  api.read.mockResolvedValue({data:snapshot} as any);
  let serial = 0;
  Object.defineProperty(global.crypto, 'randomUUID', { configurable:true, value: () => `retry-key-${++serial}` });
});

async function fill() {
  await screen.findByLabelText('Branch');
  fireEvent.change(screen.getByLabelText('Branch'), {target:{value:'branch-1'}});
  fireEvent.change(screen.getByLabelText('Maximum amount per invoice (INR)'), {target:{value:'1000.00'}});
  fireEvent.change(screen.getByLabelText('Authorization expiry (your local time)'), {target:{value:'2030-01-01T12:00'}});
  fireEvent.click(screen.getByRole('checkbox'));
}

test('never grants on mount and cashier cannot issue consent', async () => {
  api.read.mockResolvedValue({data:{...snapshot,can_manage:false}} as any);
  render(<BillingConsent onClose={jest.fn()} />);
  await screen.findByText(/Your account cannot issue/);
  expect(screen.queryByRole('button',{name:'Confirm authorization'})).not.toBeInTheDocument();
  expect(api.create).not.toHaveBeenCalled();
});

test('Escape and invoice shortcuts stay inside modal and focus restores', async () => {
  const trigger = document.createElement('button'); document.body.appendChild(trigger); trigger.focus();
  const close = jest.fn(); const documentKey = jest.fn(); document.addEventListener('keydown',documentKey);
  const view = render(<BillingConsent onClose={close} />);
  await screen.findByLabelText('Branch');
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Enter',ctrlKey:true});
  fireEvent.keyDown(screen.getByRole('dialog'),{key:'Escape'});
  expect(close).toHaveBeenCalledTimes(1); expect(documentKey).not.toHaveBeenCalled();
  view.unmount(); expect(trigger).toHaveFocus();
  document.removeEventListener('keydown',documentKey); trigger.remove();
});

test('unchanged uncertain retry reuses key; successful renewal rotates it', async () => {
  api.create.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({data:snapshot} as any);
  render(<BillingConsent onClose={jest.fn()} />); await fill();
  fireEvent.click(screen.getByRole('button',{name:'Confirm authorization'}));
  await screen.findByText(/Could not confirm authorization/);
  fireEvent.click(screen.getByRole('button',{name:'Confirm authorization'}));
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked());
  expect(api.create.mock.calls[0][0].idempotency_key).toEqual(api.create.mock.calls[1][0].idempotency_key);
  expect(api.create.mock.calls[0][0].maximum_amount).toBe('1000.00');
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Confirm authorization'}));
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(3));
  expect(api.create.mock.calls[2][0].idempotency_key).not.toEqual(api.create.mock.calls[1][0].idempotency_key);
});
