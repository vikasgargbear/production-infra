import { CanonicalWriteUnavailableError, rejectCanonicalWrite } from './canonicalWritePolicy';

describe('canonicalWritePolicy', () => {
  it('rejects without invoking a transport or local persistence layer', async () => {
    await expect(rejectCanonicalWrite('Posting a payment')).rejects.toMatchObject({
      name: 'CanonicalWriteUnavailableError',
      code: 'CANONICAL_WRITE_UNAVAILABLE'
    });
  });

  it('provides a user-readable capability message', () => {
    expect(new CanonicalWriteUnavailableError('Editing a role').message).toBe(
      'Editing a role is read-only until a canonical API command is available.'
    );
  });
});
