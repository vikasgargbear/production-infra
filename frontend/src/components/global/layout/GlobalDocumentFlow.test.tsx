import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import GlobalDocumentFlow from './GlobalDocumentFlow';

jest.mock('../ui/ModuleHeader', () => () => <div data-testid="module-header" />);
jest.mock('../ui/display/DocumentFooter', () => (props: any) => (
    <div>
        {props.onContinue && (
            <button onClick={props.onContinue} disabled={props.continueDisabled}>Continue</button>
        )}
        {props.onSave && <button onClick={props.onSave}>Save</button>}
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
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
        });
        expect(screen.getByText('Create content')).not.toBeNull();
        expect(screen.queryByText('Canonical review')).toBeNull();
    });
});
