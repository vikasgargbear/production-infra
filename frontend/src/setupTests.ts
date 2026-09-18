import { webcrypto } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';

// jsdom lacks browser encoding APIs used by the eagerly loaded PDF renderer.
Object.assign(globalThis, { TextEncoder, TextDecoder });

// jsdom does not expose the secure browser UUID authority supplied in production.
Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: webcrypto,
});
