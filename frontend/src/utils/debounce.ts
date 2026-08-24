// Simple debounce utility
export type DebouncedFunction<T extends (...args: any[]) => any> = (
    (...args: Parameters<T>) => void
) & { cancel: () => void };

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number,
): DebouncedFunction<T> {
    let timeoutId: NodeJS.Timeout | undefined;

    const debounced = function debounced(this: any, ...args: Parameters<T>) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            timeoutId = undefined;
            func.apply(this, args);
        }, delay);
    } as DebouncedFunction<T>;
    debounced.cancel = () => {
        clearTimeout(timeoutId);
        timeoutId = undefined;
    };
    return debounced;
}
