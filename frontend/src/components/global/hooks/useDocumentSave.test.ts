import { isRecoverableOfflineFailure } from './documentSaveFailure';

describe('document save failure classification', () => {
    it.each([400, 401, 403, 409, 422])(
        'does not hide an HTTP %s business failure in the offline queue',
        status => {
            expect(isRecoverableOfflineFailure({ response: { status } })).toBe(false);
        },
    );

    it.each([500, 502, 503])('allows an HTTP %s outage to use offline fallback', status => {
        expect(isRecoverableOfflineFailure({ response: { status } })).toBe(true);
    });

    it.each(['ERR_NETWORK', 'ECONNABORTED'])('allows %s to use offline fallback', code => {
        expect(isRecoverableOfflineFailure({ code })).toBe(true);
    });
});
