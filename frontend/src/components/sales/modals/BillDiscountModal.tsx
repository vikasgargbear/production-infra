import React, { useState, useEffect, useRef } from 'react';
import { X, Percent, DollarSign } from 'lucide-react';
import useEscapeKey from '../../../hooks/useEscapeKey';
import useDialogFocus from '../../../hooks/useDialogFocus';

interface BillDiscountModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentDiscount?: number;
    billAmount?: number;
    onApply: (discount: number, discountType: 'percentage' | 'amount', discountValue: number) => void;
}

const BillDiscountModal: React.FC<BillDiscountModalProps> = ({
    isOpen,
    onClose,
    currentDiscount = 0,
    billAmount = 0,
    onApply
}) => {
    const [discountType, setDiscountType] = useState<'percentage' | 'amount'>('percentage');
    const [discountValue, setDiscountValue] = useState<number>(currentDiscount);
    const [calculatedAmount, setCalculatedAmount] = useState<number>(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useDialogFocus<HTMLDivElement>(isOpen, inputRef);

    useEscapeKey(() => onClose(), isOpen, 'BillDiscountModal');

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isOpen]);

    useEffect(() => {
        if (discountType === 'percentage') {
            setCalculatedAmount((billAmount * discountValue) / 100);
        } else {
            setCalculatedAmount(discountValue);
        }
    }, [discountType, discountValue, billAmount]);

    const handleApply = (): void => {
        const finalDiscount = discountType === 'percentage'
            ? (billAmount * discountValue) / 100
            : discountValue;
        onApply(finalDiscount, discountType, discountValue);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleApply();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bill-discount-title" tabIndex={-1} className="bg-white rounded-lg shadow-xl p-6 w-96">
                <div className="flex justify-between items-center mb-4">
                    <h3 id="bill-discount-title" className="text-lg font-semibold text-gray-900">Bill Discount (F4)</h3>
                    <button type="button" onClick={onClose} className="min-h-11 min-w-11 text-gray-400 hover:text-gray-600" aria-label="Close bill discount">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Bill Amount */}
                    <div className="bg-blue-50 p-3 rounded">
                        <div className="text-sm text-gray-600">Bill Amount</div>
                        <div className="text-xl font-bold text-gray-900">₹{billAmount.toFixed(2)}</div>
                    </div>

                    {/* Discount Type */}
                    <div className="flex gap-2">
                        <button
                            onClick={() => setDiscountType('percentage')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded border ${discountType === 'percentage'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <Percent size={16} />
                            Percentage
                        </button>
                        <button
                            onClick={() => setDiscountType('amount')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded border ${discountType === 'amount'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                        >
                            <DollarSign size={16} />
                            Amount
                        </button>
                    </div>

                    {/* Discount Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Discount {discountType === 'percentage' ? '(%)' : '(₹)'}
                        </label>
                        <input
                            ref={inputRef}
                            type="number"
                            step="0.01"
                            min="0"
                            max={discountType === 'percentage' ? 100 : billAmount}
                            value={discountValue}
                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                            onKeyDown={handleKeyDown}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Calculated Discount */}
                    <div className="bg-green-50 p-3 rounded">
                        <div className="text-sm text-gray-600">Discount Amount</div>
                        <div className="text-xl font-bold text-green-600">- ₹{calculatedAmount.toFixed(2)}</div>
                    </div>

                    {/* Final Amount */}
                    <div className="bg-gray-50 p-3 rounded border-2 border-gray-300">
                        <div className="text-sm text-gray-600">Final Bill Amount</div>
                        <div className="text-2xl font-bold text-gray-900">
                            ₹{(billAmount - calculatedAmount).toFixed(2)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                        <button
                            onClick={handleApply}
                            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            Apply Discount (Enter)
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 focus:outline-none"
                        >
                            Cancel (Esc)
                        </button>
                    </div>
                </div>

                <div className="mt-4 text-xs text-gray-500 text-center">
                    Press <kbd className="px-2 py-1 bg-gray-100 rounded">Enter</kbd> to apply •
                    <kbd className="px-2 py-1 bg-gray-100 rounded ml-1">Esc</kbd> to cancel
                </div>
            </div>
        </div>
    );
};

export default BillDiscountModal;
