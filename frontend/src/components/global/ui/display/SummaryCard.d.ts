export interface SummaryItem {
  label: string;
  value: string | number;
  isTotal?: boolean;
  isBold?: boolean;
  color?: string;
}

export interface SummaryCardProps {
  items?: SummaryItem[];
  title?: string;
  variant?: 'default' | 'compact' | 'detailed';
  showCurrency?: boolean;
  currency?: string;
  className?: string;
  footerContent?: React.ReactNode;
  headerContent?: React.ReactNode;
}

declare const SummaryCard: React.FC<SummaryCardProps>;
export default SummaryCard;