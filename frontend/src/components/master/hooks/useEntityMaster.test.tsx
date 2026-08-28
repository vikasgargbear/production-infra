import { renderHook, waitFor } from '@testing-library/react';
import { useEntityMaster } from './useEntityMaster';

jest.mock('../../global/ui/feedback/Toast', () => ({
  useToast: () => ({
    created: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  }),
}));

interface TestEntity {
  entity_id: number;
  entity_name: string;
  is_active: boolean;
}

describe('useEntityMaster', () => {
  it('does not refetch forever when a component recreates the API wrapper object', async () => {
    const getAll = jest.fn().mockResolvedValue({ data: [] });
    const update = jest.fn().mockResolvedValue({ data: {} });

    const { rerender, result } = renderHook(({ renderNumber }) => {
      void renderNumber;
      return useEntityMaster<TestEntity>({
        entityName: 'entity',
        idField: 'entity_id',
        nameField: 'entity_name',
        api: { getAll, update },
        searchFields: ['entity_name'],
      });
    }, { initialProps: { renderNumber: 1 } });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getAll).toHaveBeenCalledTimes(1);

    rerender({ renderNumber: 2 });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(getAll).toHaveBeenCalledTimes(1);
  });
});
