import React from 'react';
import type { InventoryContext } from '../../../../services/api/modules/inventory/canonicalInventoryReads.api';
import { displayDate } from '../utils/canonicalStockReads';

type Props = {
  context: InventoryContext;
  branchId: string;
  locationId: string;
  onBranchChange: (branchId: string) => void;
  onLocationChange: (locationId: string) => void;
  disabled?: boolean;
};

export const InventoryScopeSelector: React.FC<Props> = ({
  context, branchId, locationId, onBranchChange, onLocationChange, disabled,
}) => {
  const branch = context.branches.find(item => item.branch_id === branchId);
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-3">
      <label className="text-sm text-gray-700">
        <span className="mb-1 block font-medium">Branch</span>
        <select
          aria-label="Inventory branch"
          value={branchId}
          disabled={disabled}
          onChange={event => onBranchChange(event.target.value)}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-3"
        >
          {context.branches.map(item => (
            <option key={item.branch_id} value={item.branch_id}>
              {item.branch_code} — {item.branch_name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-gray-700">
        <span className="mb-1 block font-medium">Location</span>
        <select
          aria-label="Inventory location"
          value={locationId}
          disabled={disabled}
          onChange={event => onLocationChange(event.target.value)}
          className="min-h-11 rounded-lg border border-gray-300 bg-white px-3"
        >
          <option value="">All accessible locations in branch</option>
          {(branch?.locations || []).map(item => (
            <option key={item.location_id} value={item.location_id}>
              {item.location_code} — {item.location_name}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-gray-500">
        Organization business date: {displayDate(context.business_date)} ({context.organization_timezone})
      </p>
    </div>
  );
};
