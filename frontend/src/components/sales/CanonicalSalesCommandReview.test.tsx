import { fireEvent, render, screen } from '@testing-library/react';
import CanonicalSalesCommandReview from './CanonicalSalesCommandReview';

const preview = {
  command_request_id: '10000000-0000-4000-8000-000000000001',
  preview_hash: `sha256:${'a'.repeat(64)}`,
  financial_impact: [{ receivable: '168.00' }],
  tax_impact: [{ cgst_total: '9.00', sgst_total: '9.00' }],
  inventory_impact: [{ base_quantity: '2.000000' }],
  policy_warnings: [],
};

describe('CanonicalSalesCommandReview', () => {
  it('shows operator-readable exact impact labels and requires acknowledgement', () => {
    const onPost = jest.fn();
    render(<CanonicalSalesCommandReview title="Review exact sales invoice" preview={preview}
      open posting={false} onBack={jest.fn()} onPost={onPost} />);

    expect(screen.getByRole('dialog', { name: 'Review exact sales invoice' })).toBeTruthy();
    expect(screen.getByText('₹168.00')).toBeTruthy();
    expect(screen.getByText('1 server-calculated line')).toBeTruthy();
    const post = screen.getByRole('button', { name: 'Approve & Post' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed this exact server preview/i }));
    expect(post.disabled).toBe(false);
  });

  it('contains Tab focus, closes only itself on Escape, and restores trigger focus', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onBack = jest.fn();
    const outerEscape = jest.fn();
    document.addEventListener('keydown', outerEscape);
    const { unmount } = render(<CanonicalSalesCommandReview title="Review exact dispatch" preview={preview}
      open posting={false} onBack={onBack} onPost={jest.fn()} />);

    const back = screen.getByRole('button', { name: 'Back' });
    expect(document.activeElement).toBe(back);
    const checkbox = screen.getByRole('checkbox', { name: /reviewed this exact server preview/i });
    fireEvent.click(checkbox);
    checkbox.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Approve & Post' }));
    outerEscape.mockClear();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(outerEscape).not.toHaveBeenCalled();

    unmount();
    expect(document.activeElement).toBe(trigger);
    document.removeEventListener('keydown', outerEscape);
    trigger.remove();
  });
});
