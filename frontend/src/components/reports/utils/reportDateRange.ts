export function isValidReportDateRange(start: string, end: string): boolean {
  if (!start || !end) return false;
  return start <= end;
}
