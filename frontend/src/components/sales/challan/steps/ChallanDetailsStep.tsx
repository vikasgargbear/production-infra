import React, { RefObject } from 'react';
import { FileInput, Package, Truck } from 'lucide-react';
import {
    DocumentFooter,
    ModuleHeader,
    StandardDatePicker,
} from '../../../global';
import ImportFromInvoiceModal from '../ui/ImportFromInvoiceModal';
import type {
    Challan,
    CustomerDetails,
    Employee,
    ImportData,
} from '../types/challanTypes';
import {
    applyDispatchBatchChoice,
    eligibleDispatchBatchChoices,
} from '../utils/dispatchBatchChoice';

interface ChallanDetailsStepProps {
    challan: Challan;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    maximumDispatchDate: string;
    selectedCustomer: CustomerDetails | null;
    employees: Employee[];
    selectedMR: Employee | null;
    setSelectedMR: React.Dispatch<React.SetStateAction<Employee | null>>;
    showCreateCustomer: boolean;
    setShowCreateCustomer: React.Dispatch<React.SetStateAction<boolean>>;
    showCreateProduct: boolean;
    setShowCreateProduct: React.Dispatch<React.SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
    approvedOrderImportUnavailableReason: string | null;
    newProductName: string;
    setNewProductName: React.Dispatch<React.SetStateAction<string>>;
    handleCustomerSelect: (customer: CustomerDetails | null) => Promise<void>;
    handleProductSelect: (product: unknown) => void;
    handleImport: (importData: ImportData) => void;
    updateItem: (index: number, field: string, value: unknown) => void;
    removeItem: (itemId: number | string) => void;
    challanFormRef: RefObject<HTMLFormElement>;
    itemsTableRef: RefObject<unknown>;
    productSearchRef: RefObject<HTMLInputElement>;
    onClose?: () => void;
    onContinue: () => void;
}

/**
 * Canonical dispatch creation starts from an approved order. Customer, line,
 * branch, location and batch facts are read-only lineage; manual products and
 * invoice-style amount editing are intentionally unavailable.
 */
const ChallanDetailsStep: React.FC<ChallanDetailsStepProps> = ({
    challan,
    setChallan,
    maximumDispatchDate,
    showImportModal,
    setShowImportModal,
    approvedOrderImportUnavailableReason,
    handleImport,
    challanFormRef,
    onClose,
    onContinue,
}) => {
    const ready = Boolean(
        challan.challan_date
        && challan.source_order_id
        && challan.customer_id
        && challan.items.length > 0,
    );

    const selectBatch = (itemId: string | number, batchId: string) => {
        setChallan(previous => ({
            ...previous,
            items: applyDispatchBatchChoice(previous.items, itemId, batchId),
        }));
    };

    return (
        <div className="h-full bg-gray-50">
            <div className="flex h-full flex-col">
                <ModuleHeader
                    title="Delivery Challan"
                    documentNumber={challan.challan_number}
                    status={challan.status}
                    icon={Truck}
                    iconColor="text-blue-600"
                    onClose={onClose}
                    historyType="challan"
                />

                <div
                    className="flex-1 overflow-y-auto bg-gray-50"
                    ref={challanFormRef as unknown as React.RefObject<HTMLDivElement>}
                >
                    <div className="mx-auto max-w-6xl px-6 py-6">
                        <div className="mb-6 grid grid-cols-2 gap-4">
                            <StandardDatePicker
                                label="Dispatch date"
                                value={challan.challan_date}
                                onChange={(value: string) => setChallan(previous => ({
                                    ...previous,
                                    challan_date: value,
                                    source_order_id: undefined,
                                    reference_doc: '',
                                    items: [],
                                }))}
                                max={maximumDispatchDate || undefined}
                                size="sm"
                                required
                            />
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">
                                    Approved sales order
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setShowImportModal(true)}
                                    disabled={Boolean(approvedOrderImportUnavailableReason)}
                                    aria-describedby={approvedOrderImportUnavailableReason ? 'approved-order-import-status' : undefined}
                                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-500"
                                >
                                    <FileInput className="h-4 w-4" />
                                    Select approved order
                                </button>
                                {approvedOrderImportUnavailableReason && (
                                    <p id="approved-order-import-status" role="status" className="mt-2 text-xs text-amber-800">
                                        {approvedOrderImportUnavailableReason}
                                    </p>
                                )}
                            </div>
                        </div>

                        {!challan.source_order_id ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="status">
                                Select an approved sales order. Manual customer, product, price, tax, and batch entry cannot establish canonical dispatch lineage.
                            </div>
                        ) : (
                            <>
                                <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                                    <div className="text-xs font-semibold uppercase text-blue-700">Selected order</div>
                                    <div className="mt-1 font-medium text-blue-950">{challan.reference_doc}</div>
                                    <div className="text-sm text-blue-900">{challan.customer_name}</div>
                                    <div className="mt-1 break-all text-xs text-blue-700">{challan.source_order_id}</div>
                                </div>

                                <p className="mb-2 text-sm text-gray-600">
                                    FEFO batches are selected by default. If needed, choose another sufficiently stocked batch with the same expiry date.
                                </p>

                                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                    <table className="w-full">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-3 py-2 text-left text-xs uppercase text-gray-600">Product</th>
                                                <th className="px-3 py-2 text-left text-xs uppercase text-gray-600">Batch</th>
                                                <th className="px-3 py-2 text-right text-xs uppercase text-gray-600">Billed qty</th>
                                                <th className="px-3 py-2 text-right text-xs uppercase text-gray-600">Free qty</th>
                                                <th className="px-3 py-2 text-left text-xs uppercase text-gray-600">Unit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {challan.items.map((item, itemIndex) => {
                                                const choices = eligibleDispatchBatchChoices(item, challan.items);
                                                return (
                                                    <tr key={String(item.id)} className="border-t border-gray-200">
                                                        <td className="px-3 py-3 text-sm">
                                                            <div className="flex items-center gap-2 font-medium">
                                                                <Package className="h-4 w-4 text-gray-400" />
                                                                {item.product_name}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-3 text-sm">
                                                            {choices.length > 1 ? (
                                                                <select
                                                                    aria-label={`Batch for ${item.product_name}, allocation ${itemIndex + 1}`}
                                                                    value={String(item.batch_id)}
                                                                    onChange={event => selectBatch(item.id, event.target.value)}
                                                                    className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 py-2"
                                                                >
                                                                    {choices.map(candidate => (
                                                                        <option key={candidate.batch_id} value={candidate.batch_id}>
                                                                            {candidate.batch_number} · expires {candidate.expiry_date} · {candidate.available_quantity} available
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <div>
                                                                    <div>{item.batch_number}</div>
                                                                    <div className="text-xs text-gray-500">FEFO · expires {item.expiry_date}</div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-3 text-right text-sm">{item.quantity}</td>
                                                        <td className="px-3 py-3 text-right text-sm">{item.free_quantity}</td>
                                                        <td className="px-3 py-3 text-sm">{item.uom_code || item.unit}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <DocumentFooter
                    totalItems={challan.items.length}
                    onCancel={onClose}
                    onContinue={onContinue}
                    cancelLabel="Cancel"
                    continueLabel="Review dispatch"
                    continueDisabled={!ready}
                    continueButtonColor="blue"
                />
            </div>

            {showImportModal && (
                <ImportFromInvoiceModal
                    isOpen
                    onClose={() => setShowImportModal(false)}
                    onImport={handleImport}
                    dispatchDate={challan.challan_date}
                />
            )}
        </div>
    );
};

export default ChallanDetailsStep;
