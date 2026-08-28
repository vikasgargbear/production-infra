import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import GlobalDocumentFlow from './GlobalDocumentFlow';

jest.mock('../ui/ModuleHeader', () => () => <div data-testid="module-header" />);
jest.mock('../ui/display/DocumentFooter', () => (props: any) => (
    <div>
        {props.onContinue && (
            <button onClick={props.onContinue} disabled={props.continueDisabled}>Continue</button>
        )}
        {props.onSave && <button onClick={props.onSave} disabled={props.saveDisabled}>{props.saveLabel || 'Save'}</button>}
    </div>
));
jest.mock('../ui/feedback/Toast', () => ({ useToast: () => ({ error: jest.fn() }) }));

describe('GlobalDocumentFlow authoritative review gate', () => {
    it('awaits successful backend preparation before showing review', async () => {
        let resolvePrepare!: (value: boolean) => void;
        const prepare = jest.fn(() => new Promise<boolean>(resolve => {
            resolvePrepare = resolve;
        }));
        render(
            <GlobalDocumentFlow
                createContent={<div>Create content</div>}
                reviewContent={<div>Canonical review</div>}
                canProceedToReview={() => true}
                onProceedToReview={prepare}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        expect(prepare).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Create content')).not.toBeNull();
        expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);

        await act(async () => resolvePrepare(true));
        expect(screen.getByText('Canonical review')).not.toBeNull();
    });

    it('stays on edit when canonical preparation fails closed', async () => {
        render(
            <GlobalDocumentFlow
                createContent={<div>Create content</div>}
                reviewContent={<div>Canonical review</div>}
                canProceedToReview={() => true}
                onProceedToReview={async () => false}
            />,
        );
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await act(async () => Promise.resolve());
        expect(screen.getByText('Create content')).not.toBeNull();
        expect(screen.queryByText('Canonical review')).toBeNull();
    });

    it('uses the workflow-specific final CTA label over the generic document label', () => {
        render(
            <GlobalDocumentFlow
                documentType="purchase-order"
                currentStep={2}
                createContent={<div>Create content</div>}
                reviewContent={<div>Canonical review</div>}
                onSave={jest.fn()}
                saveLabel="Approve & Create PO"
            />,
        );

        expect(screen.getByRole('button', { name: 'Approve & Create PO' })).not.toBeNull();
        expect(screen.queryByRole('button', { name: 'Create PO' })).toBeNull();
    });

    it('fails closed when the final write requires an independent approval', () => {
        const save = jest.fn();
        render(
            <GlobalDocumentFlow
                documentType="stock-adjustment"
                currentStep={2}
                createContent={<div>Create content</div>}
                reviewContent={<div>Canonical review</div>}
                onSave={save}
                saveLabel="Execute Approved Count"
                saveDisabled
            />,
        );

        const action = screen.getByRole('button', { name: 'Execute Approved Count' }) as HTMLButtonElement;
        expect(action.disabled).toBe(true);
        fireEvent.keyDown(window, { key: 's', ctrlKey: true });
        expect(save).not.toHaveBeenCalled();
    });
});
