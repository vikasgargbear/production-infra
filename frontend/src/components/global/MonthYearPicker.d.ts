import React from 'react';

interface MonthYearPickerProps {
  value?: string;
  onChange?: (date: string) => void;
  placeholder?: string;
  className?: string;
  minDate?: Date | null | undefined;
  required?: boolean;
}

declare const MonthYearPicker: React.FC<MonthYearPickerProps>;

export default MonthYearPicker;