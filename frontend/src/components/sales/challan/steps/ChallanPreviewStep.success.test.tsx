import { render, screen } from '@testing-library/react';

import ChallanPreviewStep from './ChallanPreviewStep';

jest.mock('../../../global', () => ({
    ModuleHeader: () => null,
    DocumentFooter: () => null,
    NotesSection: () => null,
    GenericSuccessModal: ({ title, documentId, documentType }: {
        title: string;
        documentId: string;
        documentType: string;
    }) => (
        <div data-testid="dispatch-success-evidence">
            <span>{title}</span>
            <span>{documentId}</span>
            <span>{documentType}</span>
        </div>
    ),
}));
jest.mock('../../../global/ui/KeyboardShortcuts', () => ({
    __esModule: true,
    default: () => null,
    SHORTCUT_SETS: { REVIEW: [] },
}));
jest.mock('../ui/ChallanPreview', () => () => null);
jest.mock('../../../../contexts/CompanyContext', () => ({
    useCompany: () => ({ companyInfo: null }),
}));
jest.mock('../../utils/canonicalSalesPreviewFacts', () => ({
    canonicalDispatchPreviewUnavailableReason: () => null,
}));

const dispatchId = '10000000-0000-7000-8000-000000000001';

test('shows the exact posted dispatch title and canonical resource identity', () => {
    render(<ChallanPreviewStep
        challan={{ items: [], notes: '' } as any}
        setChallan={jest.fn()}
        selectedCustomer={null}
        documentPolicy={null}
        saving={false}
        submissionUnavailableReason=""
        sameAsBilling
        setSameAsBilling={jest.fn()}
        showSuccessModal
        setShowSuccessModal={jest.fn()}
        createdChallanData={{
            challan_id: dispatchId,
            challan_number: 'DEMO-SD-1',
        } as any}
        saveChallan={jest.fn()}
        printChallan={jest.fn()}
        thermalPrintChallan={jest.fn()}
        shareOnWhatsApp={jest.fn()}
        onBack={jest.fn()}
    />);

    const evidence = screen.getByTestId('dispatch-success-evidence');
    expect(evidence.textContent).toContain('Challan Created Successfully!');
    expect(evidence.textContent).toContain(dispatchId);
    expect(evidence.textContent).toContain('challan');
});
