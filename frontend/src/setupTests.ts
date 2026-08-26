import { randomUUID } from 'crypto';


// jsdom does not publish Web Crypto randomUUID. Tests use Node's cryptographic
// implementation; production code continues to fail closed without browser
// Web Crypto support.
if (typeof globalThis.crypto?.randomUUID !== 'function') {
    Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: {
            ...globalThis.crypto,
            randomUUID,
        },
    });
}
