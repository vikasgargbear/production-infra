/**
 * Keyboard Navigation Guide Component
 * Shows keyboard shortcuts to users
 */

import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';

export const KeyboardNavigationGuide: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (compact) {
    return (
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 p-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors z-50"
        title="Keyboard Shortcuts"
      >
        <Keyboard className="w-5 h-5" />
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
      >
        <Keyboard className="w-4 h-4" />
        <span>Keyboard Shortcuts</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Keyboard Shortcuts</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Navigation */}
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-3">Navigation</h3>
                  <div className="space-y-2">
                    <ShortcutRow keys={['Enter']} description="Move to next field or select highlighted item" />
                    <ShortcutRow keys={['Tab']} description="Move to next field (standard)" />
                    <ShortcutRow keys={['Shift', 'Tab']} description="Move to previous field" />
                    <ShortcutRow keys={['Escape']} description="Close modal or clear search" />
                  </div>
                </div>

                {/* Dropdowns */}
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-3">Dropdowns & Search</h3>
                  <div className="space-y-2">
                    <ShortcutRow keys={['↓']} description="Navigate to next item" />
                    <ShortcutRow keys={['↑']} description="Navigate to previous item" />
                    <ShortcutRow keys={['Enter']} description="Select highlighted item" />
                    <ShortcutRow keys={['Escape']} description="Close dropdown" />
                  </div>
                </div>

                {/* Forms */}
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-3">Forms</h3>
                  <div className="space-y-2">
                    <ShortcutRow keys={['Ctrl', 'S']} description="Save form (where supported)" />
                    <ShortcutRow keys={['Ctrl', 'Enter']} description="Submit form" />
                    <ShortcutRow keys={['Escape']} description="Cancel or close form" />
                  </div>
                </div>

                {/* Product/Customer Search */}
                <div>
                  <h3 className="font-semibold text-lg text-gray-900 mb-3">Search Components</h3>
                  <div className="space-y-2">
                    <ShortcutRow keys={['↓', '↑']} description="Navigate search results" />
                    <ShortcutRow keys={['Enter']} description="Select highlighted result" />
                    <ShortcutRow keys={['Tab']} description="Move to next field without selecting" />
                    <ShortcutRow keys={['Escape']} description="Clear search and close dropdown" />
                  </div>
                </div>

                {/* Tips */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">💡 Pro Tips</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Use <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs">Enter</kbd> to quickly navigate through forms</li>
                    <li>• Press <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs">↓</kbd> in search fields to see suggestions</li>
                    <li>• <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs">Tab</kbd> always moves forward, <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs">Shift+Tab</kbd> moves backward</li>
                    <li>• Press <kbd className="px-2 py-1 bg-white border border-blue-300 rounded text-xs">Escape</kbd> anytime to close modals or dropdowns</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ShortcutRow: React.FC<{ keys: string[]; description: string }> = ({ keys, description }) => (
  <div className="flex items-center justify-between py-2">
    <span className="text-gray-700">{description}</span>
    <div className="flex items-center gap-1">
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="text-gray-400 mx-1">+</span>}
          <kbd className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded text-sm font-mono">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </div>
  </div>
);
