export type DisplayMovementType = 'receive' | 'issue' | 'transfer' | 'adjustment';

const RECEIVE_TYPES = new Set(['in', 'receive', 'receipt', 'stock_in', 'return_in']);
const ISSUE_TYPES = new Set(['out', 'issue', 'stock_out', 'destruction']);
const TRANSFER_TYPES = new Set(['transfer', 'transfer_in', 'transfer_out']);
const ADJUSTMENT_TYPES = new Set(['adjustment', 'count_gain', 'count_loss', 'stock_count']);

const normalized = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** Project canonical movement direction into the four UI movement categories. */
export const projectMovementType = (movement: Record<string, unknown>): DisplayMovementType => {
  for (const value of [movement.movement_type, movement.type, movement.entry_kind]) {
    const candidate = normalized(value);
    if (RECEIVE_TYPES.has(candidate)) return 'receive';
    if (ISSUE_TYPES.has(candidate)) return 'issue';
    if (TRANSFER_TYPES.has(candidate)) return 'transfer';
    if (ADJUSTMENT_TYPES.has(candidate)) return 'adjustment';
  }
  return 'adjustment';
};

export const signedMovementQuantity = (
  movementType: DisplayMovementType,
  quantity: unknown,
): number => {
  const absolute = Math.abs(Number(quantity) || 0);
  return movementType === 'issue' ? -absolute : absolute;
};
