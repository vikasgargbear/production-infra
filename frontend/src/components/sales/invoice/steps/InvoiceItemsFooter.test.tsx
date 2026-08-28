import { fireEvent, render, screen } from '@testing-library/react';
import InvoiceItemsFooter from './InvoiceItemsFooter';

jest.mock('../../../global', () => ({
    DocumentFooter: ({ onCancel, onContinue, cancelLabel, continueLabel, continueDisabled }: any) => (
        <div>
            <button onClick={onCancel}>{cancelLabel}</button>
            <button onClick={onContinue} disabled={continueDisabled}>{continueLabel}</button>
        </div>
    ),
}));

describe('InvoiceItemsFooter', () => {
    it('maps Reset to the reset handler without closing the Sales flow', () => {
        const onReset = jest.fn();
        const onContinue = jest.fn();
        render(
            <InvoiceItemsFooter
                totalItems={1}
                totalAmount={150}
                continueDisabled={false}
                onReset={onReset}
                onContinue={onContinue}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
        expect(onReset).toHaveBeenCalledTimes(1);
        expect(onContinue).not.toHaveBeenCalled();
    });
});
