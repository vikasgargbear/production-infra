import { apiHelpers } from '../../apiClient';
import { companyApi } from './company.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

describe('canonical company mutation boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps profile, logo, and payment QR writes away from retired endpoints', async () => {
    await expect(companyApi.updateCompanyInfo({ org_name: 'Changed' }))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });
    await expect(companyApi.uploadLogo('data:image/png;base64,AAAA'))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });
    await expect(companyApi.uploadQRCode('data:image/png;base64,AAAA'))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });

    expect(apiHelpers.put).not.toHaveBeenCalled();
    expect(apiHelpers.post).not.toHaveBeenCalled();
  });
});
