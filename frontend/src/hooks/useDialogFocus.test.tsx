import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import useDialogFocus from './useDialogFocus';

const DialogHarness = ({ open }: { open: boolean }) => {
    const dialogRef = useDialogFocus<HTMLDivElement>(open);
    if (!open) return null;
    return (
        <div ref={dialogRef} role="dialog" tabIndex={-1} aria-label="Test dialog">
            <button type="button">First</button>
            <button type="button">Last</button>
        </div>
    );
};

test('traps Tab focus inside a dialog and restores the invoking control', () => {
    const { rerender } = render(
        <>
            <button type="button">Open dialog</button>
            <DialogHarness open={false} />
        </>,
    );
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();

    rerender(
        <>
            <button type="button">Open dialog</button>
            <DialogHarness open />
        </>,
    );
    const first = screen.getByRole('button', { name: 'First' });
    const last = screen.getByRole('button', { name: 'Last' });
    expect(first).toHaveFocus();

    last.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(first).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();

    rerender(
        <>
            <button type="button">Open dialog</button>
            <DialogHarness open={false} />
        </>,
    );
    expect(screen.getByRole('button', { name: 'Open dialog' })).toHaveFocus();
});
