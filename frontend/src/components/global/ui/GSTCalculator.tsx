import React, { useState, useEffect } from 'react';
import { AlertCircle, Info } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

interface StateCodes {
    [key: string]: string;
}

interface GSTResult {
    gstType: string | null;
    placeOfSupply: string | null;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    cessRate: number;
    cessAmount: number;
    taxableAmount: number;
    totalTax: number;
    finalAmount: number;
    complianceNotes: string[];
    errors: string[];
    warnings: string[];
}

interface CalculateGSTParams {
    sellerGSTIN: string;
    customerGSTIN?: string;
    billingState?: string | null;
    shippingState?: string | null;
    supplyType?: 'GOODS' | 'SERVICES';
    amount: number;
    gstRate: number;
    hsnCode?: string;
    customerType?: string;
    isExport?: boolean;
    isSEZ?: boolean;
    isReverseCharge?: boolean;
}

interface OrderData {
    sellerGSTIN?: string;
    customerGSTIN?: string;
    billingState?: string;
    shippingState?: string;
    billingPincode?: string;
    shippingPincode?: string;
    supplyType?: 'GOODS' | 'SERVICES';
    taxableAmount: number;
    gstRate?: number;
    hsnCode?: string;
    customerType?: string;
    isExport?: boolean;
    isSEZ?: boolean;
}

export interface GSTCalculatorComponentProps {
    orderData?: OrderData;
    onCalculationComplete?: (result: GSTResult) => void;
    showDetails?: boolean;
}

// ==================== STATE CODES ====================

const STATE_CODES: StateCodes = {
    "01": "Jammu and Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra and Nagar Haveli",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "36": "Telangana",
    "37": "Andhra Pradesh"
};

const PINCODE_STATE_MAP: StateCodes = {
    '11': '07', // Delhi
    '12': '06', // Haryana (Gurgaon)
    '13': '06', // Haryana  
    '14': '03', // Punjab
    '40': '27', // Maharashtra (Mumbai)
    '41': '27', // Maharashtra
    '56': '29', // Karnataka (Bangalore)
    '57': '29', // Karnataka
    '60': '33', // Tamil Nadu (Chennai)
};

// ==================== GST CALCULATOR CLASS ====================

class GSTCalculator {
    private B2C_INTERSTATE_THRESHOLD = 250000;

    calculateGST({
        sellerGSTIN,
        customerGSTIN,
        billingState,
        shippingState,
        supplyType = 'GOODS',
        amount,
        gstRate,
        customerType,
        isExport = false,
        isSEZ = false,
        isReverseCharge = false
    }: CalculateGSTParams): GSTResult {
        const result: GSTResult = {
            gstType: null,
            placeOfSupply: null,
            cgstRate: 0,
            sgstRate: 0,
            igstRate: 0,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 0,
            cessRate: 0,
            cessAmount: 0,
            taxableAmount: amount,
            totalTax: 0,
            finalAmount: 0,
            complianceNotes: [],
            errors: [],
            warnings: []
        };

        const validation = this.validateInputs(sellerGSTIN, customerGSTIN, billingState, shippingState);
        if (!validation.isValid) {
            result.errors = validation.errors;
            return result;
        }

        if (!customerType) {
            customerType = this.determineCustomerType(customerGSTIN, isExport, isSEZ);
        }

        const placeOfSupply = this.determinePlaceOfSupply(supplyType, billingState || '', shippingState || '', isExport);
        result.placeOfSupply = placeOfSupply;

        if (isExport || customerType === 'EXPORT') {
            result.gstType = 'IGST';
            result.igstRate = 0;
            result.complianceNotes.push('Export supply - Zero rated IGST');
            result.finalAmount = amount;
            return result;
        }

        if (isSEZ || customerType === 'SEZ') {
            result.gstType = 'IGST';
            result.igstRate = 0;
            result.complianceNotes.push('SEZ supply - Zero rated IGST');
            result.finalAmount = amount;
            return result;
        }

        const sellerState = this.extractStateCode(sellerGSTIN);

        if (customerType === 'B2C') {
            this.calculateB2CGST(sellerState, placeOfSupply, amount, gstRate, result);
        } else if (customerType === 'COMPOSITION') {
            result.gstType = 'NIL_RATED';
            result.complianceNotes.push('Supply to composition dealer - No GST charged');
            if (isReverseCharge) {
                result.complianceNotes.push('Reverse charge applicable');
            }
        } else {
            this.calculateB2BGST(sellerState, placeOfSupply, gstRate, result);
        }

        if (result.cgstRate > 0) {
            result.cgstAmount = (amount * result.cgstRate) / 100;
            result.sgstAmount = (amount * result.sgstRate) / 100;
        } else if (result.igstRate > 0) {
            result.igstAmount = (amount * result.igstRate) / 100;
        }

        result.totalTax = result.cgstAmount + result.sgstAmount + result.igstAmount + result.cessAmount;
        result.finalAmount = amount + result.totalTax;

        this.addComplianceNotes(result, customerType, isReverseCharge);

        return result;
    }

    private validateInputs(
        sellerGSTIN?: string,
        customerGSTIN?: string,
        billingState?: string | null,
        shippingState?: string | null
    ): { isValid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!this.validateGSTIN(sellerGSTIN)) {
            errors.push(`Invalid seller GSTIN: ${sellerGSTIN}`);
        }

        if (customerGSTIN && !this.validateGSTIN(customerGSTIN)) {
            errors.push(`Invalid customer GSTIN: ${customerGSTIN}`);
        }

        if (billingState && !STATE_CODES[billingState]) {
            errors.push(`Invalid billing state: ${billingState}`);
        }

        if (shippingState && !STATE_CODES[shippingState]) {
            errors.push(`Invalid shipping state: ${shippingState}`);
        }

        return { isValid: errors.length === 0, errors };
    }

    private validateGSTIN(gstin?: string): boolean {
        if (!gstin) return false;
        if (gstin.length !== 15) return false;

        const stateCode = gstin.substring(0, 2);
        if (!STATE_CODES[stateCode]) return false;

        const pan = gstin.substring(2, 12);
        if (!/^[A-Z0-9]+$/.test(pan)) return false;

        return true;
    }

    private extractStateCode(gstin?: string): string | null {
        return gstin ? gstin.substring(0, 2) : null;
    }

    private determineCustomerType(customerGSTIN?: string, isExport?: boolean, isSEZ?: boolean): string {
        if (isExport) return 'EXPORT';
        if (isSEZ) return 'SEZ';
        if (customerGSTIN) return 'B2B';
        return 'B2C';
    }

    private determinePlaceOfSupply(supplyType: string, billingState: string, shippingState: string, isExport?: boolean): string {
        if (isExport) return '97';
        return supplyType === 'GOODS' ? shippingState : billingState;
    }

    private calculateB2CGST(sellerState: string | null, placeOfSupply: string, amount: number, gstRate: number, result: GSTResult): void {
        if (sellerState === placeOfSupply) {
            result.gstType = 'CGST/SGST';
            result.cgstRate = gstRate / 2;
            result.sgstRate = gstRate / 2;
            result.complianceNotes.push('Intrastate B2C supply');
        } else {
            if (amount > this.B2C_INTERSTATE_THRESHOLD) {
                result.gstType = 'IGST';
                result.igstRate = gstRate;
                result.complianceNotes.push('Interstate B2C exceeding Rs. 2.5L threshold');
                result.warnings.push('IGST mandatory for interstate B2C above threshold');
            } else {
                result.gstType = 'CGST/SGST';
                result.cgstRate = gstRate / 2;
                result.sgstRate = gstRate / 2;
                result.complianceNotes.push('Interstate B2C below threshold - Tax in seller state');
            }
        }
    }

    private calculateB2BGST(sellerState: string | null, placeOfSupply: string, gstRate: number, result: GSTResult): void {
        if (sellerState === placeOfSupply) {
            result.gstType = 'CGST/SGST';
            result.cgstRate = gstRate / 2;
            result.sgstRate = gstRate / 2;
            result.complianceNotes.push('Intrastate B2B supply');
        } else {
            result.gstType = 'IGST';
            result.igstRate = gstRate;
            result.complianceNotes.push('Interstate B2B supply');
        }
    }

    private addComplianceNotes(result: GSTResult, customerType: string, isReverseCharge?: boolean): void {
        if (customerType === 'B2B') {
            result.complianceNotes.push('Report in GSTR-1: B2B invoices');
        } else if (customerType === 'B2C') {
            if (result.igstRate > 0) {
                result.complianceNotes.push('Report in GSTR-1: B2C Large');
            } else {
                result.complianceNotes.push('Report in GSTR-1: B2C Small');
            }
        } else if (customerType === 'EXPORT') {
            result.complianceNotes.push('Report in GSTR-1: Export invoices');
        }

        if (isReverseCharge) {
            result.complianceNotes.push('Reverse charge mechanism applicable');
        }
    }

    getStateFromPincode(pincode?: string): string | null {
        if (!pincode || pincode.length < 2) return null;
        const prefix = pincode.substring(0, 2);
        return PINCODE_STATE_MAP[prefix] || null;
    }
}

// ==================== REACT COMPONENT ====================

const GSTCalculatorComponent: React.FC<GSTCalculatorComponentProps> = ({
    orderData,
    onCalculationComplete,
    showDetails = true
}) => {
    const [gstResult, setGstResult] = useState<GSTResult | null>(null);
    const [loading, setLoading] = useState<boolean>(false);
    const calculator = new GSTCalculator();

    useEffect(() => {
        if (orderData) {
            calculateGST();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderData]);

    const calculateGST = (): void => {
        setLoading(true);

        try {
            const result = calculator.calculateGST({
                sellerGSTIN: orderData?.sellerGSTIN || localStorage.getItem('company_gstin') || '',
                customerGSTIN: orderData?.customerGSTIN,
                billingState: orderData?.billingState ||
                    calculator.getStateFromPincode(orderData?.billingPincode),
                shippingState: orderData?.shippingState ||
                    calculator.getStateFromPincode(orderData?.shippingPincode),
                supplyType: orderData?.supplyType || 'GOODS',
                amount: parseFloat(String(orderData?.taxableAmount || 0)),
                gstRate: parseFloat(String(orderData?.gstRate || 0)),
                hsnCode: orderData?.hsnCode,
                customerType: orderData?.customerType,
                isExport: orderData?.isExport || false,
                isSEZ: orderData?.isSEZ || false
            });

            setGstResult(result);

            if (onCalculationComplete) {
                onCalculationComplete(result);
            }
        } catch (error) {
            setGstResult({
                gstType: null,
                placeOfSupply: null,
                cgstRate: 0,
                sgstRate: 0,
                igstRate: 0,
                cgstAmount: 0,
                sgstAmount: 0,
                igstAmount: 0,
                cessRate: 0,
                cessAmount: 0,
                taxableAmount: 0,
                totalTax: 0,
                finalAmount: 0,
                complianceNotes: [],
                warnings: [],
                errors: [`Calculation failed: ${(error as Error).message}`]
            });
        } finally {
            setLoading(false);
        }
    };

    if (!showDetails) {
        return null;
    }

    return (
        <div className="bg-white rounded-lg shadow-sm p-4">
            <h3 className="text-lg font-semibold mb-4">GST Calculation</h3>

            {loading && (
                <div className="flex items-center justify-center p-4">
                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                </div>
            )}

            {gstResult && !loading && (
                <div className="space-y-4">
                    {gstResult.errors && gstResult.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                            <div className="flex items-start">
                                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2" />
                                <div>
                                    <p className="font-medium text-red-900">Errors:</p>
                                    <ul className="mt-1 text-sm text-red-700">
                                        {gstResult.errors.map((error, idx) => (
                                            <li key={idx}>• {error}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {gstResult.warnings && gstResult.warnings.length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <div className="flex items-start">
                                <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5 mr-2" />
                                <div>
                                    <p className="font-medium text-yellow-900">Warnings:</p>
                                    <ul className="mt-1 text-sm text-yellow-700">
                                        {gstResult.warnings.map((warning, idx) => (
                                            <li key={idx}>• {warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {!gstResult.errors || gstResult.errors.length === 0 ? (
                        <>
                            <div className="bg-blue-50 border border-blue-200 rounded p-3">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-sm text-gray-600">GST Type</p>
                                        <p className="font-semibold">{gstResult.gstType}</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-600">Place of Supply</p>
                                        <p className="font-semibold">
                                            {gstResult.placeOfSupply ? STATE_CODES[gstResult.placeOfSupply] || gstResult.placeOfSupply : '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="border rounded p-3">
                                <h4 className="font-medium mb-2">Tax Breakdown</h4>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span>Taxable Amount:</span>
                                        <span>₹{gstResult.taxableAmount?.toFixed(2)}</span>
                                    </div>

                                    {gstResult.cgstAmount > 0 && (
                                        <>
                                            <div className="flex justify-between">
                                                <span>CGST ({gstResult.cgstRate}%):</span>
                                                <span>₹{gstResult.cgstAmount.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>SGST ({gstResult.sgstRate}%):</span>
                                                <span>₹{gstResult.sgstAmount.toFixed(2)}</span>
                                            </div>
                                        </>
                                    )}

                                    {gstResult.igstAmount > 0 && (
                                        <div className="flex justify-between">
                                            <span>IGST ({gstResult.igstRate}%):</span>
                                            <span>₹{gstResult.igstAmount.toFixed(2)}</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between font-semibold pt-2 border-t">
                                        <span>Total Tax:</span>
                                        <span>₹{gstResult.totalTax?.toFixed(2)}</span>
                                    </div>

                                    <div className="flex justify-between font-bold text-base pt-1">
                                        <span>Final Amount:</span>
                                        <span>₹{gstResult.finalAmount?.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>

                            {gstResult.complianceNotes && gstResult.complianceNotes.length > 0 && (
                                <div className="bg-gray-50 border border-gray-200 rounded p-3">
                                    <div className="flex items-start">
                                        <Info className="h-5 w-5 text-gray-500 mt-0.5 mr-2" />
                                        <div>
                                            <p className="font-medium text-gray-900">Compliance Notes:</p>
                                            <ul className="mt-1 text-sm text-gray-700">
                                                {gstResult.complianceNotes.map((note, idx) => (
                                                    <li key={idx}>• {note}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    ) : null}
                </div>
            )}
        </div>
    );
};

export { GSTCalculator, GSTCalculatorComponent };
export default GSTCalculatorComponent;
