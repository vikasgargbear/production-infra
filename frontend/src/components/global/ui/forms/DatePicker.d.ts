export interface DatePickerProps {
  value?: Date | string | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  label?: string;
  required?: boolean;
  minDate?: Date | string;
  maxDate?: Date | string;
  format?: string;
  showTime?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

declare const DatePicker: React.FC<DatePickerProps>;
export default DatePicker;