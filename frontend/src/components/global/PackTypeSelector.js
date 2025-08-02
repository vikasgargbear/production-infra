import React, { useState, useEffect } from 'react';
import { Package, Calculator, Info } from 'lucide-react';

const PackTypeSelector = ({ 
  productType = 'Tablet',
  packData = {},
  onChange = () => {},
  className = '',
  compact = false
}) => {
  const [localPackData, setLocalPackData] = useState({
    sale_unit: '', // Now optional
    qty_per_strip: 10,
    strips_per_box: 10,
    use_boxes: true,
    unit_type: '', // Can be ML, Gm, or container like Bottle
    ...packData
  });
  const [packTypeInput, setPackTypeInput] = useState('');

  // Get base unit from product type - always use measurement units
  const getBaseUnit = (type) => {
    const baseUnitMap = {
      'Tablet': 'Tablet',     // Count-based
      'Capsule': 'Capsule',   // Count-based
      'Syrup': 'ML',          // Volume
      'Injection': 'ML',      // Volume
      'Cream': 'Gm',          // Weight
      'Drops': 'ML',          // Volume
      'Powder': 'Gm',         // Weight
      'Other': 'Unit'         // Generic
    };
    return baseUnitMap[type] || 'Unit';
  };

  // Unit options based on product type
  const getSaleUnitOptions = (type) => {
    const saleUnitMap = {
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

  // Parse pack type input like "10*10" or "1*200ML"
  const parsePackType = (input) => {
    if (!input) return null;
    
    // Match patterns like "10*10", "1*200ML", "10*5Gm"
    const match = input.match(/^(\d+)\s*\*\s*(\d+)\s*([A-Za-z]+)?$/i);
    if (!match) return null;
    
    const firstPart = parseInt(match[1]) || 1;
    const secondPart = parseInt(match[2]);
    let unitSuffix = match[3]?.toUpperCase(); // Changed from const to let
    
    // Determine meaning based on unit suffix
    let qtyPerUnit = firstPart;
    let unitsPerBox = null;
    let packSize = null;
    
    if (unitSuffix) {
      // If there's a suffix, it's container*size format (e.g., 1*200ML = 1 bottle of 200ML)
      // First part is number of containers, second part is size per container
      packSize = secondPart;
      qtyPerUnit = secondPart; // The actual quantity is the size
      unitsPerBox = firstPart; // Number of containers
      
      // Normalize unit suffix to standard format
      let normalizedUnit = unitSuffix.toUpperCase();
      
      // Handle common variations
      const unitMap = {
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
      
      normalizedUnit = unitMap[normalizedUnit] || normalizedUnit;
      
      // Validate normalized unit
      if (!['ML', 'GM', 'MG', 'L', 'KG'].includes(normalizedUnit)) {
        return null;
      }
      
      unitSuffix = normalizedUnit; // Use normalized unit
    } else {
      // No suffix means tablets/strips format (e.g., 10*10 = 10 tablets per strip, 10 strips per box)
      qtyPerUnit = firstPart;
      unitsPerBox = secondPart;
    }
    
    return { qtyPerUnit, unitsPerBox, packSize, unitSuffix };
  };

  // Handle pack type direct input
  const handlePackTypeInput = (value) => {
    setPackTypeInput(value);
    const parsed = parsePackType(value);
    
    if (parsed) {
      const newData = {
        ...localPackData,
        qty_per_strip: parsed.qtyPerUnit,
        strips_per_box: parsed.unitsPerBox || localPackData.strips_per_box,
        use_boxes: !!parsed.unitsPerBox,
        pack_size: parsed.packSize,
        pack_unit: parsed.unitSuffix,
        pack_type_input: value, // Store the raw input
        unit_type: parsed.unitSuffix || localPackData.unit_type // Update unit type if suffix present
      };
      setLocalPackData(newData);
      console.log('PackTypeSelector - Parsed pack data:', newData);
      onChange(newData);
    }
  };

  // Update sale unit when product type changes (only if not already set)
  useEffect(() => {
    const saleOptions = getSaleUnitOptions(productType);
    setLocalPackData(prev => ({
      ...prev,
      sale_unit: prev.sale_unit || '' // Keep empty if not set
    }));
  }, [productType]);

  // Initialize pack type input
  useEffect(() => {
    if (localPackData.qty_per_strip && localPackData.strips_per_box && localPackData.use_boxes) {
      setPackTypeInput(`${localPackData.qty_per_strip}*${localPackData.strips_per_box}`);
    } else if (localPackData.qty_per_strip) {
      setPackTypeInput(`${localPackData.qty_per_strip}`);
    }
  }, []);

  // Calculate totals
  const calculateTotals = () => {
    const { qty_per_strip, strips_per_box, use_boxes, unit_type } = localPackData;
    const baseUnit = unit_type || getBaseUnit(productType);
    
    // Get proper unit name (singular/plural)
    const getUnitLabel = (unit, count) => {
      // For measurement units, don't pluralize
      if (['ML', 'Gm', 'Mg', 'L', 'Kg'].includes(unit.toUpperCase())) {
        return unit;
      }
      
      if (count === 1) return unit;
      
      const pluralMap = {
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
    
    if (!use_boxes || !strips_per_box) {
      return {
        total_per_box: qty_per_strip,
        display_text: `${qty_per_strip} ${getUnitLabel(baseUnit, qty_per_strip)}${localPackData.sale_unit ? ` per ${localPackData.sale_unit}` : ''}`
      };
    }
    
    const total = qty_per_strip * strips_per_box;
    const saleUnitLabel = localPackData.sale_unit ? localPackData.sale_unit.toLowerCase() : 'unit';
    
    return {
      total_per_box: total,
      display_text: localPackData.sale_unit 
        ? `${qty_per_strip} ${getUnitLabel(baseUnit, qty_per_strip)} per ${saleUnitLabel}, ${strips_per_box} ${getUnitLabel(saleUnitLabel, strips_per_box)} per box (${total} ${getUnitLabel(baseUnit, total)} total)`
        : `${qty_per_strip} ${getUnitLabel(baseUnit, qty_per_strip)} × ${strips_per_box} = ${total} ${getUnitLabel(baseUnit, total)} total`
    };
  };

  const handleChange = (field, value) => {
    const newData = { 
      ...localPackData, 
      [field]: value,
      base_unit: getBaseUnit(productType) // Always sync base unit
    };
    
    // Update pack_type_input when advanced fields change
    if (field === 'qty_per_strip' || field === 'strips_per_box' || field === 'use_boxes') {
      if (newData.use_boxes && newData.strips_per_box) {
        newData.pack_type_input = `${newData.qty_per_strip}*${newData.strips_per_box}`;
        setPackTypeInput(newData.pack_type_input);
      } else {
        newData.pack_type_input = `${newData.qty_per_strip}`;
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
    // Compact inline version for integration into product form
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
              onChange={(e) => handlePackTypeInput(e.target.value)}
              className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
              placeholder="10*10"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sale Unit
            </label>
            <select
              value={localPackData.sale_unit}
              onChange={(e) => handleChange('sale_unit', e.target.value)}
              className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
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
                  value={localPackData.qty_per_strip}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
                    handleChange('qty_per_strip', val);
                    // Update pack type input
                    if (val && localPackData.strips_per_box) {
                      setPackTypeInput(`${val}*${localPackData.strips_per_box}`);
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === '' || parseInt(e.target.value) === 0) {
                      handleChange('qty_per_strip', 1);
                    }
                  }}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                  onChange={(e) => handleChange('unit_type', e.target.value)}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  placeholder={baseUnit}
                  list="unit-suggestions"
                />
                <datalist id="unit-suggestions">
                  <option value={baseUnit} />
                  <option value="ML" />
                  <option value="Gm" />
                  <option value="Mg" />
                  <option value={localPackData.sale_unit} />
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
                  value={localPackData.strips_per_box}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '') {
                      handleChange('strips_per_box', '');
                      handleChange('use_boxes', false);
                      setPackTypeInput(localPackData.qty_per_strip.toString());
                    } else {
                      const numValue = parseInt(value) || 0;
                      handleChange('strips_per_box', numValue);
                      handleChange('use_boxes', numValue > 0);
                      if (localPackData.qty_per_strip && numValue > 0) {
                        setPackTypeInput(`${localPackData.qty_per_strip}*${numValue}`);
                      }
                    }
                  }}
                  className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  placeholder="10"
                />
              </div>
            </div>
          </div>
        </details>

        {/* Pack info display */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700">{totals.display_text}</span>
          </div>
        </div>
      </div>
    );
  }

  // Full version (keep for standalone use if needed)
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
          value={localPackData.sale_unit}
          onChange={(e) => handleChange('sale_unit', e.target.value)}
          className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
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
            value={localPackData.qty_per_strip}
            onChange={(e) => handleChange('qty_per_strip', e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
            onBlur={(e) => {
              if (e.target.value === '' || parseInt(e.target.value) === 0) {
                handleChange('qty_per_strip', 1);
              }
            }}
            className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
            value={localPackData.use_boxes ? localPackData.strips_per_box : ''}
            onChange={(e) => {
              const value = e.target.value === '' ? '' : parseInt(e.target.value) || 0;
              if (typeof value === 'number') {
                handleChange('strips_per_box', value);
                handleChange('use_boxes', value > 0);
              } else {
                handleChange('strips_per_box', value);
              }
            }}
            onBlur={(e) => {
              if (e.target.value === '') {
                handleChange('strips_per_box', 0);
                handleChange('use_boxes', false);
              }
            }}
            className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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