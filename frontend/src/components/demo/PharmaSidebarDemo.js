import React, { useState } from 'react';
import { EnhancedSidebar } from '../global/navigation';

/**
 * Pharma Sidebar Demo Component
 * Demonstrates all the enhanced pharma-friendly features
 */
const PharmaSidebarDemo = () => {
  const [activeTab, setActiveTab] = useState('home');

  // Demo content for different tabs
  const renderTabContent = () => {
    const contentMap = {
      'home': (
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Medical Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-teal-500 to-cyan-500 p-6 rounded-xl text-white">
              <h3 className="text-lg font-semibold mb-2">Today's Prescriptions</h3>
              <p className="text-3xl font-bold">47</p>
              <p className="text-sm opacity-90">+12% from yesterday</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-6 rounded-xl text-white">
              <h3 className="text-lg font-semibold mb-2">Active Patients</h3>
              <p className="text-3xl font-bold">1,234</p>
              <p className="text-sm opacity-90">Regular customers</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-6 rounded-xl text-white">
              <h3 className="text-lg font-semibold mb-2">Revenue Today</h3>
              <p className="text-3xl font-bold">₹1.2L</p>
              <p className="text-sm opacity-90">+8% from average</p>
            </div>
          </div>
        </div>
      ),
      'quick-prescription': (
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Quick Prescription Entry</h1>
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Patient Name</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Enter patient name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Drug Search</label>
                <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Search for medicines..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Quantity</label>
                  <input type="number" className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="10" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Duration</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2">
                    <option>7 days</option>
                    <option>14 days</option>
                    <option>30 days</option>
                  </select>
                </div>
              </div>
              <button className="w-full bg-gradient-to-r from-teal-500 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-teal-600 hover:to-blue-700 transition-all">
                Process Prescription
              </button>
            </div>
          </div>
        </div>
      ),
      'drug-interaction': (
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Drug Interaction Checker</h1>
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl">
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h3 className="text-green-800 font-semibold mb-2">✓ No Interactions Found</h3>
                <p className="text-green-700 text-sm">Current drug combination is safe to dispense.</p>
              </div>
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-900">Current Medications:</h4>
                <div className="space-y-2">
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <span className="font-medium">Paracetamol 500mg</span>
                    <span className="text-sm text-gray-600 ml-2">- Pain reliever</span>
                  </div>
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <span className="font-medium">Amoxicillin 250mg</span>
                    <span className="text-sm text-gray-600 ml-2">- Antibiotic</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ),
      'products': (
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Drug Catalog</h1>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Medicine Inventory</h3>
                <span className="bg-teal-100 text-teal-800 px-3 py-1 rounded-full text-sm font-medium">2,456 Products</span>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {[
                { name: 'Paracetamol 500mg', stock: 245, expiry: '2025-03-15', batch: 'PCM001' },
                { name: 'Amoxicillin 250mg', stock: 89, expiry: '2024-12-20', batch: 'AMX002' },
                { name: 'Insulin Pen', stock: 34, expiry: '2024-11-10', batch: 'INS003' },
                { name: 'Metformin 500mg', stock: 156, expiry: '2025-01-25', batch: 'MET004' }
              ].map((drug, index) => (
                <div key={index} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{drug.name}</h4>
                      <p className="text-sm text-gray-600">Batch: {drug.batch} | Exp: {drug.expiry}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${drug.stock > 100 ? 'text-green-600' : drug.stock > 50 ? 'text-amber-600' : 'text-red-600'}`}>
                        {drug.stock} units
                      </p>
                      <p className="text-xs text-gray-500">In stock</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
      'customers': (
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Patient Database</h1>
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Patient Records</h3>
                <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">1,234 Patients</span>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {[
                { name: 'Rajesh Kumar', age: 45, lastVisit: '2024-08-20', condition: 'Diabetes' },
                { name: 'Priya Sharma', age: 32, lastVisit: '2024-08-19', condition: 'Hypertension' },
                { name: 'Amit Patel', age: 58, lastVisit: '2024-08-18', condition: 'Arthritis' },
                { name: 'Sunita Devi', age: 39, lastVisit: '2024-08-17', condition: 'Migraine' }
              ].map((patient, index) => (
                <div key={index} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-900">{patient.name}</h4>
                      <p className="text-sm text-gray-600">Age: {patient.age} | Condition: {patient.condition}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">Last Visit</p>
                      <p className="text-xs text-gray-500">{patient.lastVisit}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    };

    return contentMap[activeTab] || (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          {activeTab.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
        </h1>
        <div className="bg-white rounded-xl shadow-lg p-6">
          <p className="text-gray-600">
            This is a demo page for the {activeTab} module. The enhanced pharma sidebar provides 
            easy access to all pharmaceutical management features.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Enhanced Pharma Sidebar */}
      <EnhancedSidebar 
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PharmaSidebarDemo;