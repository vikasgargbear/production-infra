// Simple debounce utility
export function debounce<T extends (...args: any[]) => any>(func: T, delay: number) {
    let timeoutId: NodeJS.Timeout | undefined;

    return function debounced(this: any, ...args: Parameters<T>) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
