import React from 'react';

/**
 * KeyboardShortcutBar Component
 * Displays keyboard shortcuts in a sophisticated single-line bar
 */
const KeyboardShortcutBar = ({ shortcuts = [], className = '' }) => {
  if (shortcuts.length === 0) return null;

  return (
    <div className={`bg-gradient-to-r from-blue-600 to-blue-700 border-t border-blue-800 px-6 py-3 ${className}`.trim()}>
      <div className="flex items-center text-sm">
        <span className="text-white font-medium mr-3">⌨️ Shortcuts:</span>
        <div className="flex items-center space-x-4">
          {shortcuts.map((shortcut, index) => (
            <div key={index} className="flex items-center">
              <kbd className="px-2.5 py-1 text-xs font-semibold bg-white/90 border border-blue-300 rounded shadow-sm text-blue-800">
                {shortcut.key}
              </kbd>
              <span className="ml-2 text-white font-medium">{shortcut.label}</span>
              {index < shortcuts.length - 1 && (
                <span className="ml-4 text-blue-300">•</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutBar;