import type { Invoice } from '../types/invoiceTypes';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

type SavedAddress = Record<string, unknown>;

const text = (value: unknown): string => String(value ?? '').trim();

/**
 * Applies one server-saved delivery address to invoice state.
 * The first selection establishes billing and delivery; later selections may
 * change delivery/place-of-supply without silently changing billing.
 */
export const applySelectedDeliveryAddress = (
  invoice: Invoice,
  address: SavedAddress,
): Invoice => {
  const addressId = text(address.address_id ?? address.id);
  const rowVersion = text(address.row_version);
  if (!isCanonicalUuid(addressId) || !/^[1-9][0-9]*$/.test(rowVersion)) {
    throw new Error('The selected delivery address is missing its canonical identity or row version.');
  }
  const stateCode = text(address.state_code);
  if (!/^\d{2}$/.test(stateCode)) {
    throw new Error('The selected delivery address is missing its canonical state code.');
  }
  const normalizedAddress = {
    ...address,
    address_id: addressId,
    row_version: rowVersion,
    state_code: stateCode,
  };
  const displayAddress = [
    address.address_line1,
    address.address_line2,
    address.city,
    stateCode,
    address.pincode,
  ].map(text).filter(Boolean).join(', ');

  return {
    ...invoice,
    billing_address: invoice.billing_address || displayAddress,
    billing_address_data: invoice.billing_address_data || normalizedAddress,
    shipping_address: displayAddress,
    shipping_address_data: normalizedAddress,
    // Tax treatment is server-owned and remains unresolved until preview.
    gst_type: '',
  } as Invoice;
};
