import React from 'react';

/**
 * KeyboardShortcut Component
 * Displays keyboard shortcuts in a consistent, subtle manner
 */
const KeyboardShortcut = ({ 
  shortcut, 
  position = 'bottom-right',
  size = 'sm',
  className = '' 
}) => {
  // Position classes
  const positionMap = {
    'bottom-right': 'absolute bottom-2 right-2',
    'top-right': 'absolute top-2 right-2',
    'inline': '',
    'bottom-left': 'absolute bottom-2 left-2',
    'top-left': 'absolute top-2 left-2'
  };

  // Size classes
  const sizeMap = {
    xs: 'text-xs px-1.5 py-0.5',
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-2.5 py-1'
  };

  const shortcutClasses = `
    ${sizeMap[size]}
    ${positionMap[position]}
    font-mono
    text-gray-400
    bg-gray-50
    border border-gray-200
    rounded
    ${className}
  `.trim();

  if (!shortcut) return null;

  // Format keyboard shortcuts (e.g., "Ctrl+S" -> ["Ctrl", "S"])
  const formatShortcut = (sc) => {
    const keys = sc.split('+').map(key => key.trim());
    return keys;
  };

  const keys = formatShortcut(shortcut);

  return (
    <span className={shortcutClasses}>
      {keys.map((key, index) => (
        <React.Fragment key={index}>
          <kbd className="font-mono">{key}</kbd>
          {index < keys.length - 1 && <span className="mx-0.5">+</span>}
        </React.Fragment>
      ))}
    </span>
  );
};

// Keyboard shortcut hint for inline display
export const KeyboardHint = ({ children, shortcut, className = '' }) => (
  <span className={`inline-flex items-center gap-2 ${className}`.trim()}>
    {children}
    {shortcut && (
      <KeyboardShortcut shortcut={shortcut} position="inline" size="xs" />
    )}
  </span>
);

// Keyboard shortcuts panel for displaying multiple shortcuts
export const KeyboardShortcutsPanel = ({ shortcuts = [], className = '' }) => {
  if (shortcuts.length === 0) return null;

  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${className}`.trim()}>
      <h4 className="text-sm font-medium text-gray-700 mb-3">Keyboard Shortcuts</h4>
      <div className="space-y-2">
        {shortcuts.map((item, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{item.description}</span>
            <KeyboardShortcut shortcut={item.shortcut} position="inline" size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyboardShortcut;