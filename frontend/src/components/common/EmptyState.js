import React from 'react';
import { Package, FileX, Users, ShoppingCart, Building, FileText } from 'lucide-react';

/**
 * EmptyState Component
 * Consistent empty state display across the application
 */
const EmptyState = ({
  icon: CustomIcon,
  iconType = 'package',
  title,
  description,
  action,
  className = ''
}) => {
  // Default icons for common empty states
  const iconMap = {
    package: Package,
    file: FileX,
    fileText: FileText,
    users: Users,
    cart: ShoppingCart,
    building: Building
  };

  // Determine which icon to use
  let IconComponent;
  
  if (CustomIcon) {
    // If custom icon is provided, use it
    IconComponent = CustomIcon;
  } else if (iconType && iconMap[iconType]) {
    // If iconType is provided and valid, use mapped icon
    IconComponent = iconMap[iconType];
  } else {
    // Default to Package icon
    IconComponent = Package;
  }

  // Ensure we have a valid component
  if (!IconComponent || typeof IconComponent !== 'function') {
    console.error('EmptyState: Invalid icon component', IconComponent);
    IconComponent = Package; // Fallback to Package
  }

  return (
    <div className={`text-center py-12 ${className}`.trim()}>
      <div className="bg-gray-50 rounded-lg px-6 py-8">
        <div className="w-12 h-12 mx-auto mb-4 text-gray-400">
          <IconComponent className="w-full h-full" />
        </div>
        <p className="text-gray-600 font-medium">
          {title || 'No items added yet'}
        </p>
        {description && (
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            {description}
          </p>
        )}
        {action && (
          <div className="mt-6">
            {action}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmptyState;