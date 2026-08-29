import React from 'react';
import { ShieldAlert } from 'lucide-react';

interface CapabilityDeniedNoticeProps {
  children: React.ReactNode;
  className?: string;
}

const CapabilityDeniedNotice: React.FC<CapabilityDeniedNoticeProps> = ({ children, className = '' }) => (
  <div
    role="alert"
    className={`flex min-h-11 items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ${className}`}
  >
    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

export default CapabilityDeniedNotice;
