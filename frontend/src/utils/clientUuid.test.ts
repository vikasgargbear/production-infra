import { clientUuid } from './clientUuid';

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

afterEach(() => {
    if (originalCryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
    } else {
        delete (globalThis as { crypto?: Crypto }).crypto;
    }
});

test('returns the browser cryptographic UUID without rewriting it', () => {
    const randomUUID = jest.fn(() => '10000000-0000-4000-8000-000000000001');
    Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { randomUUID },
    });

    expect(clientUuid()).toBe('10000000-0000-4000-8000-000000000001');
    expect(randomUUID).toHaveBeenCalledTimes(1);
});

test('fails closed when secure UUID generation is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: {},
    });

    expect(() => clientUuid()).toThrow('Secure UUID generation is unavailable');
});
