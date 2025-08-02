// Global type declarations
interface Window {
  Sentry?: {
    captureException: (error: Error, context?: any) => void;
  };
  showErrorToast?: (message: string) => void;
}