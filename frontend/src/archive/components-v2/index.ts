/**
 * Components v2 Index
 * Central export for all TypeScript v2 components
 */

// Search Components
export { CustomerSearch } from './customers/CustomerSearch';
export type { CustomerSearchRef } from './customers/CustomerSearch';

export { ProductSearch } from './products/ProductSearch';
export type { ProductSearchRef } from './products/ProductSearch';

// Common UI Components
export { Button } from './common/Button';
export type { ButtonProps } from './common/Button';

export { Input } from './common/Input';
export type { InputProps } from './common/Input';

export { Select } from './common/Select';
export type { SelectProps, SelectOption } from './common/Select';

export { NumberInput } from './common/NumberInput';
export type { NumberInputProps } from './common/NumberInput';

export { CurrencyInput } from './common/CurrencyInput';
export type { CurrencyInputProps } from './common/CurrencyInput';

export { Checkbox } from './common/Checkbox';
export type { CheckboxProps } from './common/Checkbox';

export { Switch } from './common/Switch';
export type { SwitchProps } from './common/Switch';

export { TextArea } from './common/TextArea';
export type { TextAreaProps } from './common/TextArea';

export { Card, CardHeader } from './common/Card';
export type { CardProps, CardHeaderProps } from './common/Card';

export { Radio, RadioGroup } from './common/Radio';
export type { RadioProps, RadioGroupProps, RadioOption } from './common/Radio';

export { DatePicker } from './common/DatePicker';
export type { DatePickerProps } from './common/DatePicker';

export { Modal, ConfirmModal } from './common/Modal';
export type { ModalProps, ConfirmModalProps } from './common/Modal';

export { Alert, Toast } from './common/Alert';
export type { AlertProps, ToastProps } from './common/Alert';

export { Spinner, LoadingOverlay, Skeleton } from './common/Spinner';
export type { SpinnerProps, LoadingOverlayProps, SkeletonProps } from './common/Spinner';

export { Tabs, TabPanel } from './common/Tabs';
export type { TabsProps, Tab, TabPanelProps } from './common/Tabs';

export { Dropdown, ActionMenu, MultiSelectDropdown } from './common/Dropdown';
export type { DropdownProps, DropdownItem, ActionMenuProps, MultiSelectDropdownProps, MultiSelectOption } from './common/Dropdown';

export { Badge, NotificationBadge } from './common/Badge';
export type { BadgeProps, NotificationBadgeProps } from './common/Badge';

export { Progress, CircularProgress, StepsProgress } from './common/Progress';
export type { ProgressProps, CircularProgressProps, StepsProgressProps, Step } from './common/Progress';

export { Tooltip, Popover } from './common/Tooltip';
export type { TooltipProps, PopoverProps } from './common/Tooltip';

// export { TimePicker } from './common/TimePicker';

// Data Display Components
export { DataTable } from './data/DataTable';
export type { DataTableProps, Column } from './data/DataTable';

export { StatusBadge, getStatusColor, getStatusIcon } from './data/StatusBadge';
export type { StatusBadgeProps, StatusType } from './data/StatusBadge';

// export { List } from './data/List';
// export { Tree } from './data/Tree';
// export { Timeline } from './data/Timeline';
// export { SummaryCard } from './data/SummaryCard';

// Layout Components (to be implemented)
// export { Header } from './layout/Header';
// export { Sidebar } from './layout/Sidebar';
// export { Footer } from './layout/Footer';
// export { PageHeader } from './layout/PageHeader';
// export { PageContainer } from './layout/PageContainer';
// export { Section } from './layout/Section';

// Form Components (to be implemented)
// export { Form } from './forms/Form';
// export { FormField } from './forms/FormField';
// export { FormSection } from './forms/FormSection';
// export { FormActions } from './forms/FormActions';
// export { ValidationSummary } from './forms/ValidationSummary';