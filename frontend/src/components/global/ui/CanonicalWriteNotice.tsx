import React from 'react';
import { Info } from 'lucide-react';

interface CanonicalWriteNoticeProps {
  action?: string;
  title?: string;
  description?: string;
  className?: string;
}

/** Makes intentionally unavailable writes clear without implying offline save. */
const CanonicalWriteNotice: React.FC<CanonicalWriteNoticeProps> = ({
  action,
  title = 'Read-only live API view',
  description,
  className = '',
}) => (
  <div
    role="status"
    className={`flex items-start gap-3 border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700 ${className}`}
  >
    <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
    <div>
      <p className="font-medium text-gray-900">{title}</p>
      <p>
        {description ?? `${action ?? 'This action'} is disabled until a canonical API command is available. Nothing will be saved on this device or queued for later.`}
      </p>
    </div>
  </div>
);

export default CanonicalWriteNotice;
