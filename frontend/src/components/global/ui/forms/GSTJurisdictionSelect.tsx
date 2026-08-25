import React, { useEffect, useState } from 'react';

import {
  CanonicalGSTJurisdiction,
  GSTJurisdictionUsage,
  gstJurisdictionsApi,
} from '../../../../services/api/modules/master/gstJurisdictions.api';

interface GSTJurisdictionSelectProps {
  id?: string;
  value: string;
  onChange: (code: string) => void;
  usage?: GSTJurisdictionUsage;
  effectiveOn?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
}

const GSTJurisdictionSelect: React.FC<GSTJurisdictionSelectProps> = ({
  id,
  value,
  onChange,
  usage = 'domestic_address',
  effectiveOn,
  className,
  disabled = false,
  required = false,
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
}) => {
  const [items, setItems] = useState<CanonicalGSTJurisdiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    gstJurisdictionsApi.list(usage, effectiveOn)
      .then((response) => {
        if (active) setItems(response.data);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [effectiveOn, usage]);

  return (
    <select
      id={id}
      value={items.some((item) => item.code === value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      className={className}
      disabled={disabled || loading || failed}
      required={required}
      aria-label={ariaLabel}
      aria-busy={loading}
      aria-invalid={failed || ariaInvalid || undefined}
    >
      <option value="">
        {loading ? 'Loading GST jurisdictions…' : failed ? 'GST jurisdictions unavailable' : 'Select GST jurisdiction'}
      </option>
      {items.map((item) => (
        <option key={item.code} value={item.code}>
          {item.code} — {item.display_name}
        </option>
      ))}
    </select>
  );
};

export default GSTJurisdictionSelect;
