import { debounce } from './debounce';

describe('debounce cancellation', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('cancels an unmounted search before it can issue a duplicate request', () => {
        const search = jest.fn();
        const debounced = debounce(search, 100);
        debounced('carton');
        debounced.cancel();
        jest.advanceTimersByTime(100);
        expect(search).not.toHaveBeenCalled();
    });

    it('keeps only the latest mounted search query', () => {
        const search = jest.fn();
        const debounced = debounce(search, 100);
        debounced('car');
        debounced('carton');
        jest.advanceTimersByTime(100);
        expect(search).toHaveBeenCalledTimes(1);
        expect(search).toHaveBeenCalledWith('carton');
    });
});
