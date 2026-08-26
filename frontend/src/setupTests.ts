import { webcrypto } from 'node:crypto';


// jsdom does not expose the secure browser UUID authority supplied in production.
Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
});
