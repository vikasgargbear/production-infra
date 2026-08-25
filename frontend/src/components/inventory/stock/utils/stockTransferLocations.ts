import type { InventoryLocation } from '../../../../services/api/modules/inventory/canonicalInventoryReads.api';

export type TransferLocationAvailability = {
  eligible: boolean;
  reasons: string[];
};

export const governedTransferLocationAvailability = (
  location: InventoryLocation,
): TransferLocationAvailability => {
  const reasons: string[] = [];
  if (location.location_status !== 'active') reasons.push('location is not active');
  if (location.location_type !== 'saleable') reasons.push('location type is not saleable');
  if (!location.allows_sale) reasons.push('sales are disabled');
  if (location.allows_negative_stock) reasons.push('negative stock is allowed');
  return { eligible: reasons.length === 0, reasons };
};

export const transferTemperatureBoundsMatch = (
  source: InventoryLocation,
  destination: InventoryLocation,
): boolean => (
  source.temperature_min_c === destination.temperature_min_c
  && source.temperature_max_c === destination.temperature_max_c
);

export const destinationTransferLocationAvailability = (
  location: InventoryLocation,
  source?: InventoryLocation,
): TransferLocationAvailability => {
  const governed = governedTransferLocationAvailability(location);
  const reasons = [...governed.reasons];
  if (source && !transferTemperatureBoundsMatch(source, location)) {
    reasons.push('storage temperature bounds differ from the source');
  }
  return { eligible: reasons.length === 0, reasons };
};

export const unavailableTransferLocationLabel = (
  location: InventoryLocation,
  availability: TransferLocationAvailability,
): string => availability.eligible
  ? location.location_name
  : `${location.location_name} — unavailable: ${availability.reasons.join('; ')}`;
