/** Create collision-free identifiers within one browser runtime. */
export function createRuntimeIdCounter(): () => number {
    let nextId = 0;

    return () => {
        if (nextId >= Number.MAX_SAFE_INTEGER) {
            throw new Error('Runtime identifier space exhausted.');
        }
        nextId += 1;
        return nextId;
    };
}
