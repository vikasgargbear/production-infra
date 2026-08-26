import { clientUuid } from './clientUuid';


describe('clientUuid', () => {
    it('uses the secure runtime configured for browser tests', () => {
        expect(clientUuid()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    it('uses the browser secure UUID authority', () => {
        const randomUUID = jest.fn(() => '10000000-0000-4000-8000-000000000001');

        expect(clientUuid({ randomUUID })).toBe('10000000-0000-4000-8000-000000000001');
        expect(randomUUID).toHaveBeenCalledTimes(1);
    });

    it('uses secure random bytes when randomUUID is unavailable', () => {
        const getRandomValues = jest.fn((bytes: Uint8Array) => {
            bytes.set(Array.from({ length: 16 }, (_unused, index) => index));
            return bytes;
        }) as Crypto['getRandomValues'];

        expect(clientUuid({ getRandomValues })).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
        expect(getRandomValues).toHaveBeenCalledTimes(1);
    });

    it('fails closed when secure UUID generation is unavailable', () => {
        expect(() => clientUuid(null)).toThrow(/secure UUID generation is unavailable/i);
        expect(() => clientUuid({})).toThrow(/secure UUID generation is unavailable/i);
    });
});
