import { projectMovementType, signedMovementQuantity } from './movementProjection';

describe('canonical movement projection', () => {
  it.each([
    [{ movement_type: 'in', entry_kind: 'receipt' }, 'receive'],
    [{ movement_type: 'out', entry_kind: 'issue' }, 'issue'],
    [{ type: 'In', entry_kind: 'count_gain' }, 'receive'],
    [{ type: 'Out', entry_kind: 'count_loss' }, 'issue'],
    [{ movement_type: 'transfer' }, 'transfer'],
    [{ entry_kind: 'count_gain' }, 'adjustment'],
  ] as const)('maps %p to %s', (input, expected) => {
    expect(projectMovementType(input)).toBe(expected);
  });

  it('renders issues negative and receipts positive without trusting raw sign', () => {
    expect(signedMovementQuantity('issue', 14)).toBe(-14);
    expect(signedMovementQuantity('issue', -14)).toBe(-14);
    expect(signedMovementQuantity('receive', -4)).toBe(4);
  });
});
