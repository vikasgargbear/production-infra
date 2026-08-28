import React from 'react';
import { DocumentFooter } from '../../../global';
import type { EditableDecimalValue } from '../../../../utils/exactDecimal';

interface InvoiceItemsFooterProps {
    totalItems: number;
    totalAmount?: EditableDecimalValue;
    continueDisabled: boolean;
    onReset: () => void;
    onContinue: () => void;
}

const InvoiceItemsFooter: React.FC<InvoiceItemsFooterProps> = ({
    totalItems,
    totalAmount,
    continueDisabled,
    onReset,
    onContinue,
}) => (
    <DocumentFooter
        totalItems={totalItems}
        totalAmount={totalAmount}
        onCancel={onReset}
        onContinue={onContinue}
        cancelLabel="Reset"
        continueLabel="Continue"
        continueDisabled={continueDisabled}
        continueButtonColor="blue"
    />
);

export default InvoiceItemsFooter;
