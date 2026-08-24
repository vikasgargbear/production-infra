import { useEffect, useState } from 'react';
import { canonicalBusinessContextApi } from '../services/api/modules/org/canonicalBusinessContext.api';
import type { CalendarDate } from '../utils/calendarDate';

interface CanonicalBusinessDateState {
  businessDate: CalendarDate;
  organizationTimezone: string;
  loading: boolean;
  error: string;
}

const initialState: CanonicalBusinessDateState = {
  businessDate: '',
  organizationTimezone: '',
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
        loading: false,
        error: '',
      });
    }).catch(error => {
      if (!active) return;
      setState({
        businessDate: '',
        organizationTimezone: '',
        loading: false,
        error: error instanceof Error ? error.message : 'Unable to load the organization business date.',
      });
    });
    return () => { active = false; };
  }, []);

  return state;
}
