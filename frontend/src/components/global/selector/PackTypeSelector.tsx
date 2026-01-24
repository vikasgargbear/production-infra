import React, { useState, useEffect, ChangeEvent, FocusEvent } from 'react';
import { Package, Calculator } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

/**
 * PackData interface - uses backend-standard variable names
 * @property units_per_pack - Number of units in one pack (e.g., 10 tablets per strip)
 * @property packages_per_box - Number of packs in one box (e.g., 10 strips per box)
 */
interface PackData {
    sale_unit?: string;
    units_per_pack?: number | string;  // Backend standard: units in one pack
    packages_per_box?: number | string;  // Backend standard: packs in one box
    use_boxes?: boolean;
    unit_type?: string;
    pack_size?: number;
    pack_unit?: string;
    pack_type_input?: string;
    base_unit?: string;
}

export interface PackTypeSelectorProps {
    productType?: string;
    packData?: PackData;
    onChange?: (data: PackData) => void;
    className?: string;
    compact?: boolean;
}

type ProductType = 'Tablet' | 'Capsule' | 'Syrup' | 'Injection' | 'Cream' | 'Drops' | 'Powder' | 'Other';

interface ParsedPackType {
    unitsPerPack: number;
    packagesPerBox: number | null;
    packSize: number | null;
    unitSuffix: string | null;
}

interface TotalsResult {
    total_per_box: number;
    display_text: string;
}

// ==================== COMPONENT ====================

const PackTypeSelector: React.FC<PackTypeSelectorProps> = ({
    productType = 'Tablet',
    packData = {},
    onChange = () => { },
    className = '',
    compact = false
}) => {
    const [localPackData, setLocalPackData] = useState<PackData>({
        sale_unit: '',
        units_per_pack: 10,
        packages_per_box: 10,
        use_boxes: true,
        unit_type: '',
        ...packData
    });
    const [packTypeInput, setPackTypeInput] = useState<string>('');

    const getBaseUnit = (type: string): string => {
        const baseUnitMap: Record<string, string> = {
            'Tablet': 'Tablet',
            'Capsule': 'Capsule',
            'Syrup': 'ML',
            'Injection': 'ML',
            'Cream': 'Gm',
            'Drops': 'ML',
            'Powder': 'Gm',
            'Other': 'Unit'
        };
        return baseUnitMap[type] || 'Unit';
    };

    const getSaleUnitOptions = (type: string): string[] => {
        const saleUnitMap: Record<string, string[]> = {
            'Tablet': ['Strip', 'Box'],
            'Capsule': ['Strip', 'Box'],
            'Syrup': ['Bottle'],
            'Injection': ['Vial'],
            'Cream': ['Tube'],
            'Drops': ['Bottle'],
            'Powder': ['Sachet'],
            'Other': ['Unit', 'Box']
        };
        return saleUnitMap[type] || ['Unit', 'Box'];
    };

    const parsePackType = (input: string): ParsedPackType | null => {
        if (!input) return null;

        const match = input.match(/^(\d+)\s*\*\s*(\d+)\s*([A-Za-z]+)?$/i);
        if (!match) return null;

        const firstPart = parseInt(match[1]) || 1;
        const secondPart = parseInt(match[2]);
        let unitSuffix: string | null = match[3]?.toUpperCase() || null;

        let unitsPerPack = firstPart;
        let packagesPerBox: number | null = null;
        let packSize: number | null = null;

        if (unitSuffix) {
            packSize = secondPart;
            unitsPerPack = secondPart;
            packagesPerBox = firstPart;

            const unitMap: Record<string, string> = {
                'GRAM': 'GM',
                'GRAMS': 'GM',
                'GMS': 'GM',
                'G': 'GM',
                'MG': 'MG',
                'MILLIGRAM': 'MG',
                'MILLIGRAMS': 'MG',
                'ML': 'ML',
                'MILLILITRE': 'ML',
                'MILLILITER': 'ML',
                'MILLILITRES': 'ML',
                'MILLILITERS': 'ML',
                'L': 'L',
                'LITRE': 'L',
                'LITER': 'L',
                'LITRES': 'L',
                'LITERS': 'L',
                'KG': 'KG',
                'KILOGRAM': 'KG',
                'KILOGRAMS': 'KG'
            };

            const normalizedUnit = unitMap[unitSuffix] || unitSuffix;

            if (!['ML', 'GM', 'MG', 'L', 'KG'].includes(normalizedUnit)) {
                return null;
            }

            unitSuffix = normalizedUnit;
        } else {
            unitsPerPack = firstPart;
            packagesPerBox = secondPart;
        }

        return { unitsPerPack, packagesPerBox, packSize, unitSuffix };
    };

    const handlePackTypeInput = (value: string): void => {
        setPackTypeInput(value);
        const parsed = parsePackType(value);

        if (parsed) {
            const newData: PackData = {
                ...localPackData,
                units_per_pack: parsed.unitsPerPack,
                packages_per_box: parsed.packagesPerBox || localPackData.packages_per_box,
                use_boxes: !!parsed.packagesPerBox,
                pack_size: parsed.packSize || undefined,
                pack_unit: parsed.unitSuffix || undefined,
                pack_type_input: value,
                unit_type: parsed.unitSuffix || localPackData.unit_type
            };
            setLocalPackData(newData);
            onChange(newData);
        }
    };

    useEffect(() => {
        setLocalPackData(prev => ({
            ...prev,
            sale_unit: prev.sale_unit || ''
        }));
    }, [productType]);

    useEffect(() => {
        if (localPackData.units_per_pack && localPackData.packages_per_box && localPackData.use_boxes) {
            setPackTypeInput(`${localPackData.units_per_pack}*${localPackData.packages_per_box}`);
        } else if (localPackData.units_per_pack) {
            setPackTypeInput(`${localPackData.units_per_pack}`);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const calculateTotals = (): TotalsResult => {
        const { units_per_pack, packages_per_box, use_boxes, unit_type } = localPackData;
        const baseUnit = unit_type || getBaseUnit(productType);

        const getUnitLabel = (unit: string, count: number): string => {
            if (['ML', 'Gm', 'Mg', 'L', 'Kg'].includes(unit.toUpperCase())) {
                return unit;
            }

            if (count === 1) return unit;

            const pluralMap: Record<string, string> = {
                'Tablet': 'Tablets',
                'Capsule': 'Capsules',
                'Bottle': 'Bottles',
                'Vial': 'Vials',
                'Sachet': 'Sachets',
                'Tube': 'Tubes',
                'Unit': 'Units'
            };
            return pluralMap[unit] || unit + 's';
        };

        const unitsNum = typeof units_per_pack === 'number' ? units_per_pack : parseInt(String(units_per_pack)) || 0;
        const packagesNum = typeof packages_per_box === 'number' ? packages_per_box : parseInt(String(packages_per_box)) || 0;

        if (!use_boxes || !packagesNum) {
            return {
                total_per_box: unitsNum,
                display_text: `${unitsNum} ${getUnitLabel(baseUnit, unitsNum)}${localPackData.sale_unit ? ` per ${localPackData.sale_unit}` : ''}`
            };
        }

        const total = unitsNum * packagesNum;
        const saleUnitLabel = localPackData.sale_unit ? localPackData.sale_unit.toLowerCase() : 'unit';

        return {
            total_per_box: total,
            display_text: localPackData.sale_unit
                ? `${unitsNum} ${getUnitLabel(baseUnit, unitsNum)} per ${saleUnitLabel}, ${packagesNum} ${getUnitLabel(saleUnitLabel, packagesNum)} per box (${total} ${getUnitLabel(baseUnit, total)} total)`
                : `${unitsNum} ${getUnitLabel(baseUnit, unitsNum)} × ${packagesNum} = ${total} ${getUnitLabel(baseUnit, total)} total`
        };
    };

    const handleChange = (field: keyof PackData, value: any): void => {
        const newData: PackData = {
            ...localPackData,
            [field]: value,
            base_unit: getBaseUnit(productType)
        };

        if (field === 'units_per_pack' || field === 'packages_per_box' || field === 'use_boxes') {
            if (newData.use_boxes && newData.packages_per_box) {
                newData.pack_type_input = `${newData.units_per_pack}*${newData.packages_per_box}`;
                setPackTypeInput(newData.pack_type_input);
            } else {
                newData.pack_type_input = `${newData.units_per_pack}`;
                setPackTypeInput(newData.pack_type_input);
            }
        }

        setLocalPackData(newData);
        onChange(newData);
    };

    const totals = calculateTotals();
    const saleOptions = getSaleUnitOptions(productType);
    const baseUnit = getBaseUnit(productType);

    if (compact) {
        return (
            <div className={`space-y-4 ${className}`}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Pack Type (e.g., 10*10, 1*200ML, 5*5Gm)
                        </label>
                        <input
                            type="text"
                            value={packTypeInput}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => handlePackTypeInput(e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                            placeholder="10*10"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Sale Unit
                        </label>
                        <select
                            value={localPackData.sale_unit || ''}
                            onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange('sale_unit', e.target.value)}
                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                        >
                            <option value="">Select Sale Unit</option>
                            {saleOptions.map(unit => (
                                <option key={unit} value={unit}>{unit}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <details className="group">
                    <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 flex items-center gap-2">
                        <span className="group-open:rotate-90 transition-transform">▶</span>
                        Advanced pack configuration
                    </summary>

                    <div className="mt-3 space-y-3 pl-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Quantity per {localPackData.sale_unit || 'Unit'} *
                                </label>
                                <input
                                    type="number"
                                    value={localPackData.units_per_pack}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        const val = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                                        handleChange('units_per_pack', val);
                                        if (val && localPackData.packages_per_box) {
                                            setPackTypeInput(`${val}*${localPackData.packages_per_box}`);
                                        }
                                    }}
                                    onBlur={(e: FocusEvent<HTMLInputElement>) => {
                                        if (e.target.value === '' || parseInt(e.target.value) === 0) {
                                            handleChange('units_per_pack', 1);
                                        }
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    placeholder="10"
                                    min="1"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Unit Type
                                </label>
                                <input
                                    type="text"
                                    value={localPackData.unit_type === undefined ? baseUnit : localPackData.unit_type}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('unit_type', e.target.value)}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    placeholder={baseUnit}
                                    list="unit-suggestions"
                                />
                                <datalist id="unit-suggestions">
                                    <option value={baseUnit} />
                                    <option value="ML" />
                                    <option value="Gm" />
                                    <option value="Mg" />
                                    <option value={localPackData.sale_unit || ''} />
                                    <option value="Unit" />
                                </datalist>
                                <p className="text-xs text-gray-500 mt-1">e.g., ML for syrup, Gm for powder</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    {localPackData.sale_unit || 'Units'} per Box
                                </label>
                                <input
                                    type="text"
                                    value={String(localPackData.packages_per_box || '')}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                        const value = e.target.value;
                                        if (value === '') {
                                            handleChange('packages_per_box', '');
                                            handleChange('use_boxes', false);
                                            setPackTypeInput(String(localPackData.units_per_pack));
                                        } else {
                                            const numValue = parseInt(value) || 0;
                                            handleChange('packages_per_box', numValue);
                                            handleChange('use_boxes', numValue > 0);
                                            if (localPackData.units_per_pack && numValue > 0) {
                                                setPackTypeInput(`${localPackData.units_per_pack}*${numValue}`);
                                            }
                                        }
                                    }}
                                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                                    placeholder="10"
                                />
                            </div>
                        </div>
                    </div>
                </details>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-blue-700">{totals.display_text}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-blue-600" />
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                    Pack Configuration
                </h4>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sale Unit
                </label>
                <select
                    value={localPackData.sale_unit || ''}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => handleChange('sale_unit', e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                >
                    <option value="">Select Sale Unit (Optional)</option>
                    {saleOptions.map(unit => (
                        <option key={unit} value={unit}>{unit}</option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Unit used in invoices (base: {baseUnit})</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quantity per {localPackData.sale_unit} *
                    </label>
                    <input
                        type="number"
                        value={localPackData.units_per_pack}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => handleChange('units_per_pack', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                        onBlur={(e: FocusEvent<HTMLInputElement>) => {
                            if (e.target.value === '' || parseInt(e.target.value) === 0) {
                                handleChange('units_per_pack', 1);
                            }
                        }}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="10"
                        min="1"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        {localPackData.sale_unit}s per Box
                    </label>
                    <input
                        type="number"
                        value={localPackData.use_boxes ? localPackData.packages_per_box : ''}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                            const value = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                            if (typeof value === 'number') {
                                handleChange('packages_per_box', value);
                                handleChange('use_boxes', value > 0);
                            } else {
                                handleChange('packages_per_box', value);
                            }
                        }}
                        onBlur={(e: FocusEvent<HTMLInputElement>) => {
                            if (e.target.value === '') {
                                handleChange('packages_per_box', 0);
                                handleChange('use_boxes', false);
                            }
                        }}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="Optional"
                        min="0"
                    />
                </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700">{totals.display_text}</span>
                </div>
            </div>
        </div>
    );
};

export default PackTypeSelector;
