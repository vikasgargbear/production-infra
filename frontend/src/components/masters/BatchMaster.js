import React from 'react';

const BatchMaster = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-2xl">
        <h2 className="text-xl font-semibold mb-4">Batch Master</h2>
        <p className="text-gray-600">Batch management coming soon...</p>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-200 rounded">Close</button>
      </div>
    </div>
  );
};

export default BatchMaster;