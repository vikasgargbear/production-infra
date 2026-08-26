/** Generate a cryptographically secure browser UUID for command identity. */
export function clientUuid(): string {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID !== 'function') {
        throw new Error('Secure UUID generation is unavailable in this browser.');
    }
    return cryptoApi.randomUUID();
}
