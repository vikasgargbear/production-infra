import { createRuntimeIdCounter } from './runtimeId';


describe('runtime identifier counter', () => {
    it('is unique and monotonic within its owning runtime', () => {
        const nextId = createRuntimeIdCounter();

        expect([nextId(), nextId(), nextId()]).toEqual([1, 2, 3]);
    });

    it('does not share state across independent owners', () => {
        const firstOwner = createRuntimeIdCounter();
        const secondOwner = createRuntimeIdCounter();

        expect(firstOwner()).toBe(1);
        expect(firstOwner()).toBe(2);
        expect(secondOwner()).toBe(1);
    });
});
