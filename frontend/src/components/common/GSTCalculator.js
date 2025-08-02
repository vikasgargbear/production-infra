import React, { useState } from 'react';
import { Calculator, X } from 'lucide-react';

const GSTCalculator = ({ isOpen, onClose }) => {
  const [sellingPrice, setSellingPrice] = useState('');
  const [gstPercent, setGstPercent] = useState('12');
  const [calculatedPrice, setCalculatedPrice] = useState(null);

  const calculatePreGSTPrice = () => {
    const selling = parseFloat(sellingPrice);
    const gst = parseFloat(gstPercent);
    
    if (selling && gst >= 0) {
      // Pre-GST Price = Selling Price / (1 + GST%)
      const preGstPrice = selling / (1 + gst / 100);
      const gstAmount = selling - preGstPrice;
      
      setCalculatedPrice({
        preGstPrice: preGstPrice.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        sellingPrice: selling.toFixed(2),
        gstPercent: gst
      });
    }
  };

  const calculateSellingPrice = () => {
    const preGst = parseFloat(sellingPrice);
    const gst = parseFloat(gstPercent);
    
    if (preGst && gst >= 0) {
      // Selling Price = Pre-GST Price * (1 + GST%)
      const sellingPriceCalc = preGst * (1 + gst / 100);
      const gstAmount = sellingPriceCalc - preGst;
      
      setCalculatedPrice({
        preGstPrice: preGst.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        sellingPrice: sellingPriceCalc.toFixed(2),
        gstPercent: gst
      });
    }
  };

  const reset = () => {
    setSellingPrice('');
    setGstPercent('12');
    setCalculatedPrice(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md m-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">GST Calculator</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Input Fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Enter Amount (₹)
            </label>
            <input
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GST Percentage (%)
            </label>
            <select
              value={gstPercent}
              onChange={(e) => setGstPercent(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="0">0% (No GST)</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={calculatePreGSTPrice}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <div className="text-xs">Remove GST from price</div>
              <div className="text-xs opacity-80">(Find base price)</div>
            </button>
            <button
              onClick={calculateSellingPrice}
              className="px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              <div className="text-xs">Add GST to price</div>
              <div className="text-xs opacity-80">(Find final price)</div>
            </button>
          </div>
        </div>

        {/* Results */}
        {calculatedPrice && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Calculation Results</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Base Price (without GST):</span>
                <span className="font-semibold text-gray-900">₹{calculatedPrice.preGstPrice}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">GST Tax Amount ({calculatedPrice.gstPercent}%):</span>
                <span className="font-semibold text-gray-900">+ ₹{calculatedPrice.gstAmount}</span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm">
                <span className="text-gray-700 font-medium">Final Price (with GST):</span>
                <span className="font-bold text-gray-900">₹{calculatedPrice.sellingPrice}</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 flex justify-between">
          <button
            onClick={reset}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium"
          >
            Clear
          </button>
          <p className="text-xs text-gray-500 self-center">
            Enter amount to calculate pre/post GST prices
          </p>
        </div>
      </div>
    </div>
  );
};

export default GSTCalculator;