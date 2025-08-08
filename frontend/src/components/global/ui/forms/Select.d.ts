export interface SelectOption {
  value: string | number;
  label: string;
  group?: string;
  disabled?: boolean;
}

export interface SelectProps {
  options?: SelectOption[];
  value?: any;
  onChange?: (value: any) => void;
  placeholder?: string;
  searchable?: boolean;
  multiple?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  renderOption?: (option: SelectOption) => React.ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

declare const Select: React.FC<SelectProps>;
export default Select;