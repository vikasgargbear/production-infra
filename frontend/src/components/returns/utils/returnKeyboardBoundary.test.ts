import { returnFlowOwnsEscape } from './returnKeyboardBoundary';

it('does not close a return flow when an open child menu consumed Escape', () => {
  expect(returnFlowOwnsEscape({ key: 'Escape', defaultPrevented: true })).toBe(false);
});

it('lets the return flow handle an otherwise unconsumed Escape', () => {
  expect(returnFlowOwnsEscape({ key: 'Escape', defaultPrevented: false })).toBe(true);
  expect(returnFlowOwnsEscape({ key: 'Enter', defaultPrevented: false })).toBe(false);
});
