import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CanonicalSalesCommandReview from './CanonicalSalesCommandReview';

const preview = {
  command_request_id: '10000000-0000-4000-8000-000000000001',
  preview_hash: `sha256:${'a'.repeat(64)}`,
  financial_impact: [{ receivable: '168.00' }],
  tax_impact: [{ cgst_total: '9.00', sgst_total: '9.00' }],
  inventory_impact: [{ base_quantity: '2.000000' }],
  resolved_references: [{
    resource_type: 'product',
    id: '20000000-0000-4000-8000-000000000001',
    product_code: 'PROD-000001',
    product_name: 'Canonical Carton',
  }],
  policy_warnings: [],
};

describe('CanonicalSalesCommandReview', () => {
  it('shows operator-readable exact impact labels and requires acknowledgement', () => {
    const onPost = jest.fn();
    render(<CanonicalSalesCommandReview title="Review exact sales invoice" preview={preview}
      open posting={false} onBack={jest.fn()} onPost={onPost} />);

    expect(screen.getByRole('dialog', { name: 'Review exact sales invoice' })).toBeTruthy();
    expect(screen.getByTestId('canonical-immutable-preview')).toHaveTextContent('168.00');
    expect(screen.getByTestId('canonical-immutable-preview')).toHaveTextContent(
      preview.command_request_id,
    );
    expect(screen.getByText('₹168.00')).toBeTruthy();
    expect(screen.getByText('1 server-calculated line')).toBeTruthy();
    expect(screen.getByText('Canonical Carton (PROD-000001)')).toBeTruthy();
    const post = screen.getByRole('button', { name: 'Approve & Post' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /reviewed this exact server preview/i }));
    expect(post.disabled).toBe(false);
  });

  it('keeps acknowledgement when the parent refreshes callbacks for the same preview', () => {
    const { rerender } = render(<CanonicalSalesCommandReview
      title="Review exact delivery dispatch"
      preview={preview}
      open
      posting={false}
      onBack={() => undefined}
      onPost={async () => undefined}
    />);

    const checkbox = screen.getByRole('checkbox', {
      name: /reviewed this exact server preview/i,
    }) as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    rerender(<CanonicalSalesCommandReview
      title="Review exact delivery dispatch"
      preview={preview}
      open
      posting={false}
      onBack={() => undefined}
      onPost={async () => undefined}
    />);

    expect(checkbox.checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Approve & Post' })).toBeEnabled();
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

  it('shows a selected label only when its canonical product ID is in the server preview', () => {
    const productId = '20000000-0000-4000-8000-000000000001';
    render(<CanonicalSalesCommandReview title="Review exact sales order" preview={{
      ...preview,
      resolved_references: [{ resource_type: 'product_uom_tax', product_id: productId }],
    }} open posting={false} onBack={jest.fn()} onPost={jest.fn()} selectedProducts={[
      { id: productId, code: 'PROD-000001', name: 'Canonical Carton' },
      { id: '20000000-0000-4000-8000-000000000099', code: 'OTHER', name: 'Other' },
    ]} />);

    expect(screen.getByText('Canonical Carton (PROD-000001)')).toBeTruthy();
    expect(screen.queryByText('Other (OTHER)')).toBeNull();
  });
});
