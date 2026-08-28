import { useCallback, useEffect, useState } from 'react';
import {
  canonicalInventoryReadsApi,
  type InventoryContext,
} from '../../../../services/api/modules/inventory/canonicalInventoryReads.api';
import { decodeInventoryContext } from '../utils/canonicalStockReads';

export const useInventoryScope = () => {
  const [context, setContext] = useState<InventoryContext | null>(null);
  const [branchId, setBranchIdState] = useState('');
  const [locationId, setLocationIdState] = useState('');
  const [loadingScope, setLoadingScope] = useState(true);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const loadContext = useCallback(async () => {
    setLoadingScope(true);
    setScopeError(null);
    try {
      const decoded = decodeInventoryContext((await canonicalInventoryReadsApi.context()).data);
      if (decoded.branches.length === 0) {
        throw new Error('No accessible inventory branch is configured.');
      }
      setContext(decoded);
      setBranchIdState(current => (
        decoded.branches.some(branch => branch.branch_id === current)
          ? current : decoded.branches[0].branch_id
      ));
    } catch (error) {
      setContext(null);
      setScopeError(error instanceof Error ? error.message : 'Unable to load inventory scope.');
    } finally {
      setLoadingScope(false);
    }
  }, []);

  useEffect(() => { void loadContext(); }, [loadContext]);

  const setBranchId = useCallback((next: string) => {
    setBranchIdState(next);
    setLocationIdState('');
  }, []);

  return {
    context, branchId, locationId, setBranchId, setLocationId: setLocationIdState,
    loadingScope, scopeError, reloadScope: loadContext,
  };
};
