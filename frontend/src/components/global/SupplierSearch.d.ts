export interface SupplierSearchProps {
  onSupplierSelect?: (supplier: any) => void;
  placeholder?: string;
  autoFocus?: boolean;
  showDetails?: boolean;
  className?: string;
}

export interface SupplierSearchRef {
  focus: () => void;
}

declare const SupplierSearch: React.ForwardRefExoticComponent<SupplierSearchProps & React.RefAttributes<SupplierSearchRef>>;
export default SupplierSearch;