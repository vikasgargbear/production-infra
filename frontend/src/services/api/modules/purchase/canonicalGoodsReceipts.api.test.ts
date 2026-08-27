import { apiHelpers } from '../../apiClient';
import { canonicalGoodsReceiptsApi } from './canonicalGoodsReceipts.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn() },
}));

const PO_ID = '10000000-0000-7000-8000-000000000001';
const GRN_ID = '10000000-0000-7000-8000-000000000002';

describe('canonical goods-receipt read transport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses the UUID-only purchase-order receipt context', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: { lines: [] } });
    await canonicalGoodsReceiptsApi.getPurchaseOrderContext(PO_ID);
    expect(apiHelpers.get).toHaveBeenCalledWith(
      `/canonical/goods-receipts/purchase-orders/${PO_ID}/context`,
      { preserveExactDecimals: true },
    );
  });

  it('reads detail by canonical goods-receipt UUID', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: { lines: [] } });
    await canonicalGoodsReceiptsApi.getDetail(GRN_ID);
    expect(apiHelpers.get).toHaveBeenCalledWith(
      `/canonical/goods-receipts/${GRN_ID}`,
      { preserveExactDecimals: true },
    );
  });

  it.each(['4', 'legacy-id', ''])('fails closed before a legacy identity request (%s)', id => {
    expect(() => canonicalGoodsReceiptsApi.getDetail(id)).toThrow(
      /canonical UUID/i,
    );
    expect(() => canonicalGoodsReceiptsApi.getPurchaseOrderContext(id)).toThrow(
      /canonical UUID/i,
    );
    expect(apiHelpers.get).not.toHaveBeenCalled();
  });
});
