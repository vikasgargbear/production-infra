import { canonicalActionErrorMessage } from './canonicalActionError';

describe('canonical action error presentation', () => {
  const fallback = 'Canonical readback failed. Retry the read-only verification.';

  it('uses a structured public message without copying attached payload values', () => {
    const message = canonicalActionErrorMessage({ response: { data: { detail: {
      message: 'Canonical readback is temporarily unavailable.',
      input: { password: 'must-not-render', supplier_name: 'must-not-render' },
    } } } }, fallback);
    expect(message).toBe('Canonical readback is temporarily unavailable.');
    expect(message).not.toMatch(/password|supplier_name|must-not-render/);
  });

  it('keeps validation locations and messages but excludes submitted input', () => {
    const message = canonicalActionErrorMessage({ response: { data: { detail: [{
      loc: ['body', 'lines', 0, 'quantity'],
      msg: 'Must be greater than zero',
      input: 'customer-secret-value',
    }] } } }, fallback);
    expect(message).toBe('body.lines.0.quantity: Must be greater than zero');
    expect(message).not.toContain('customer-secret-value');
  });

  it('fails closed on unstructured server detail that may echo a request', () => {
    expect(canonicalActionErrorMessage({ response: { data: {
      detail: 'payload={"password":"must-not-render"}',
    } } }, fallback)).toBe(fallback);
  });

  it('preserves locally authored validation errors', () => {
    expect(canonicalActionErrorMessage(new Error('Select a canonical branch.'), fallback))
      .toBe('Select a canonical branch.');
  });
});
