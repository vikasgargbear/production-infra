import { useEffect, useState } from 'react';
import { canonicalBusinessContextApi } from '../services/api/modules/org/canonicalBusinessContext.api';
import type { CanonicalDocumentPolicy } from '../services/api/modules/org/canonicalBusinessContext.api';
import type { CalendarDate } from '../utils/calendarDate';

interface CanonicalBusinessDateState {
  businessDate: CalendarDate;
  organizationTimezone: string;
  documentPolicy: CanonicalDocumentPolicy | null;
  loading: boolean;
  error: string;
}

const initialState: CanonicalBusinessDateState = {
  businessDate: '',
  organizationTimezone: '',
  documentPolicy: null,
  loading: true,
  error: '',
};

export function useCanonicalBusinessDate(): CanonicalBusinessDateState {
  const [state, setState] = useState<CanonicalBusinessDateState>(initialState);

  useEffect(() => {
    let active = true;
    void canonicalBusinessContextApi.get().then(context => {
      if (!active) return;
      setState({
        businessDate: context.business_date,
        organizationTimezone: context.organization_timezone,
        documentPolicy: context.document_policy,
        loading: false,
        error: '',
      });
    }).catch(error => {
      if (!active) return;
      setState({
        businessDate: '',
        organizationTimezone: '',
        documentPolicy: null,
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load the organization business date.',
      });
    });
    return () => { active = false; };
  }, []);

  return state;
}
