import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Select from './Select';

describe('Select keyboard and combobox semantics', () => {
    it('exposes state and selects an option with the keyboard', () => {
        const onChange = jest.fn();
        render(
            <Select
                label="Return reason"
                value=""
                onChange={onChange}
                options={[
                    { value: 'DAMAGED', label: 'Damaged Product' },
                    { value: 'EXPIRED', label: 'Expired Product' },
                ]}
            />,
        );

        const trigger = screen.getByRole('combobox', { name: 'Return reason' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('listbox')).not.toBeNull();
        fireEvent.keyDown(trigger, { key: 'ArrowDown' });
        fireEvent.keyDown(trigger, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith('EXPIRED');
    });

    it('closes on Escape and returns focus to its trigger', () => {
        render(<Select placeholder="Select reason" value="" onChange={jest.fn()} options={[
            { value: 'DAMAGED', label: 'Damaged Product' },
        ]} />);
        const trigger = screen.getByRole('combobox', { name: 'Select reason' });
        fireEvent.click(trigger);
        fireEvent.keyDown(trigger, { key: 'Escape' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
    });
});
