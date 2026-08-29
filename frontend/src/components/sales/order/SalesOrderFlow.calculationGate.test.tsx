import { fireEvent, render, screen } from '@testing-library/react';
import SalesOrderFlow from './SalesOrderFlow';
import { useSalesOrderLogic } from './hooks/useSalesOrderLogic';

jest.mock('../../../hooks/usePermissions', () => ({
    usePermissions: () => ({ hasCapability: () => true }),
}));

jest.mock('./hooks/useSalesOrderLogic', () => ({
    useSalesOrderLogic: jest.fn(),
}));
jest.mock('../../global', () => ({
    ModuleHeader: () => <div />,
    GenericSuccessModal: () => null,
    ProductCreationModal: () => null,
    DocumentFooter: (props: any) => props.onContinue
        ? <button type="button" disabled={props.continueDisabled} onClick={props.onContinue}>Continue</button>
        : null,
}));
jest.mock('../../global/creation/CustomerCreation', () => () => null);
jest.mock('../../global/modals', () => ({ DocumentImportModal: () => null }));
jest.mock('./steps/OrderItemsStep', () => () => <div>Order items</div>);
jest.mock('./steps/OrderReviewStep', () => () => <div>Order review</div>);
jest.mock('../CanonicalSalesCommandReview', () => () => null);
jest.mock('react-toastify', () => ({ toast: { info: jest.fn() } }));

const mockedLogic = useSalesOrderLogic as jest.MockedFunction<typeof useSalesOrderLogic>;
const validOrder = {
    customer_id: '10000000-0000-7000-8000-000000000001',
    order_date: '2026-08-29', expected_delivery_date: '2026-08-29',
    shipping_address_data: {
        address_id: '10000000-0000-7000-8000-000000000002', row_version: '1',
    },
    items: [{ product_id: '10000000-0000-7000-8000-000000000003' }],
    total_amount: '112.00',
} as any;

const logic = (status: 'pending' | 'authoritative') => ({
    order: validOrder,
    setOrder: jest.fn(),
    documentPolicy: null,
    businessDate: '2026-08-29',
    selectedCustomer: null,
    sameAsBilling: true,
    setSameAsBilling: jest.fn(),
    saving: false,
    submissionUnavailableReason: '',
    calculationStatus: status,
    calculationUnavailableReason: status === 'pending'
        ? 'Calculating authoritative tax and totals for your latest changes…'
        : '',
    preparedPreview: null,
    reviewOpen: false,
    message: '', messageType: '',
    selectedBankAccount: null, setSelectedBankAccount: jest.fn(),
    createdOrderData: null, showSuccessModal: false, setShowSuccessModal: jest.fn(),
    showCustomerModal: false, setShowCustomerModal: jest.fn(),
    showProductModal: false, setShowProductModal: jest.fn(),
    showImportModal: false, setShowImportModal: jest.fn(),
    newProductName: '', setNewProductName: jest.fn(),
    handleCustomerSelect: jest.fn(), handleProductSelect: jest.fn(), handleImport: jest.fn(),
    updateItem: jest.fn(), removeItem: jest.fn(), saveOrder: jest.fn(),
    confirmPreparedOrder: jest.fn(), closeOrderReview: jest.fn(),
    printOrder: jest.fn(), shareOnWhatsApp: jest.fn(), resetOrder: jest.fn(),
    companyInfo: {},
} as any);

test('immediate Continue stays disabled until the current preview is authoritative', () => {
    mockedLogic.mockReturnValue(logic('pending'));
    const { rerender } = render(<SalesOrderFlow onClose={jest.fn()} />);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toMatch(/calculating authoritative/i);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Order review')).toBeNull();

    mockedLogic.mockReturnValue(logic('authoritative'));
    rerender(<SalesOrderFlow onClose={jest.fn()} />);
    expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Order review')).toBeTruthy();
});
