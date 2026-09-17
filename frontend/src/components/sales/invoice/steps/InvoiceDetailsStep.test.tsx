import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import InvoiceDetailsStep from './InvoiceDetailsStep';
import { createInitialInvoice } from '../hooks/useInvoiceLogic';

jest.mock('../../../global', () => ({
    ModuleHeader: () => null,
    AddressForm: () => null,
    DocumentFooter: (props: any) => <button disabled={props.continueDisabled} onClick={props.onContinue}>
        {props.continueLabel}
    </button>,
}));

it('allows requesting a validated preview when no previous total is available', () => {
    const onContinue = jest.fn();
    render(<InvoiceDetailsStep invoice={createInitialInvoice()} setInvoice={jest.fn()}
        selectedCustomer={null} documentPolicy={null} onClose={jest.fn()} onContinue={onContinue}
        onBack={jest.fn()} onSaveDraft={jest.fn()} onOpenDrafts={jest.fn()} draftSaving={false}
        deliveryTypeRef={React.createRef()} transportRef={React.createRef()}
        vehicleRef={React.createRef()} deliveryChargesRef={React.createRef()} />);
    const continueButton = screen.getByRole('button', { name: 'Continue to Preview' });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledTimes(1);
});
