import React from 'react';

export interface SupplierSearchProps {
  value?: any;
  onChange?: (supplier: any) => void;
  onCreateNew?: () => void;
  displayMode?: 'inline' | 'compact';
  placeholder?: string;
  required?: boolean;
  clearable?: boolean;
  buttonLabel?: string;
  className?: string;
}

export interface SupplierSearchRef {
  focus: () => void;
  clearSearch: () => void;
}

declare const SupplierSearch: React.ForwardRefExoticComponent<SupplierSearchProps & React.RefAttributes<SupplierSearchRef>>;
export default SupplierSearch;