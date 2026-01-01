import React, { useState, useEffect, useRef } from 'react';
import { X, Calculator, ArrowRight } from 'lucide-react';
import useEscapeKey from '../../../hooks/useEscapeKey';

interface CashCalculatorModalProps {
    isOpen: boolean;
    onClose: () => void;
    billAmount?: number;
}

const CashCalculatorModal: React.FC<CashCalculatorModalProps> = ({ isOpen, onClose, billAmount = 0 }) => {
    const [receivedAmount, setReceivedAmount] = useState<string>('');
    const [returnAmount, setReturnAmount] = useState<number>(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useEscapeKey(() => onClose(), isOpen, 'CashCalculatorModal');

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isOpen]);

    useEffect(() => {
        const received = parseFloat(receivedAmount) || 0;
        setReturnAmount(received - billAmount);
    }, [receivedAmount, billAmount]);

    const handleQuickAmount = (amount: number): void => {
        setReceivedAmount(amount.toString());
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'Enter') {
            e.preventDefault();
            onClose();
        }
    };

    if (!isOpen) return null;

    const quickAmounts = [500, 1000, 2000, 5000];
    const suggestedAmount = Math.ceil(billAmount / 100) * 100;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Calculator size={20} />
                        Cash Calculator (F11)
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-4">
                    {/* Bill Amount */}
                    <div className="bg-blue-50 p-4 rounded-lg">
                        <div className="text-sm text-gray-600 mb-1">Bill Amount</div>
                        <div className="text-3xl font-bold text-gray-900">₹{billAmount.toFixed(2)}</div>
                    </div>

                    {/* Cash Received */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cash Received
                        </label>
                        <input
                            ref={inputRef}
                            type="number"
                            step="0.01"
                            min="0"
                            value={receivedAmount}
                            onChange={(e) => setReceivedAmount(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Enter amount..."
                            className="w-full px-4 py-3 text-2xl border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>

                    {/* Quick Amount Buttons */}
                    <div>
                        <div className="text-sm text-gray-600 mb-2">Quick Select</div>
                        <div className="grid grid-cols-4 gap-2">
                            {quickAmounts.map(amount => (
                                <button
                                    key={amount}
                                    onClick={() => handleQuickAmount(amount)}
                                    className="py-2 px-3 bg-gray-100 hover:bg-gray-200 rounded text-sm font-medium"
                                >
                                    ₹{amount}
                                </button>
                            ))}
                        </div>
                        {suggestedAmount > billAmount && (
                            <button
                                onClick={() => handleQuickAmount(suggestedAmount)}
                                className="w-full mt-2 py-2 px-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded text-sm font-medium text-blue-700"
                            >
                                Suggested: ₹{suggestedAmount}
                            </button>
                        )}
                    </div>

                    {/* Return Amount */}
                    {receivedAmount && parseFloat(receivedAmount) >= billAmount ? (
                        <div className={`p-4 rounded-lg ${returnAmount >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-gray-600">Return Cash</div>
                                    <div className={`text-3xl font-bold ${returnAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        ₹{Math.abs(returnAmount).toFixed(2)}
                                    </div>
                                </div>
                                <ArrowRight size={32} className={returnAmount >= 0 ? 'text-green-600' : 'text-red-600'} />
                            </div>
                        </div>
                    ) : receivedAmount ? (
                        <div className="p-4 rounded-lg bg-red-50">
                            <div className="text-sm text-red-600">Insufficient amount</div>
                            <div className="text-xl font-bold text-red-600">
                                Short by ₹{(billAmount - parseFloat(receivedAmount)).toFixed(2)}
                            </div>
                        </div>
                    ) : null}

                    {/* Actions */}
                    <button
                        onClick={onClose}
                        className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                        Done (Enter / Esc)
                    </button>
                </div>

                <div className="mt-4 text-xs text-gray-500 text-center">
                    Press <kbd className="px-2 py-1 bg-gray-100 rounded">Enter</kbd> or
                    <kbd className="px-2 py-1 bg-gray-100 rounded ml-1">Esc</kbd> to close
                </div>
            </div>
        </div>
    );
};

export default CashCalculatorModal;
