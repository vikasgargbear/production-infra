import React from 'react';

interface ReturnBusinessDateGateProps {
  loading: boolean;
  error: string;
  onRetry: () => void;
  children: React.ReactNode;
}

const ReturnBusinessDateGate: React.FC<ReturnBusinessDateGateProps> = ({
  loading,
  error,
  onRetry,
  children,
}) => {
  if (loading) {
    return (
      <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        Loading the authoritative organization date before invoice selection…
      </p>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 min-h-11 rounded-lg border border-red-300 bg-white px-4 font-medium text-red-800 hover:bg-red-100"
        >
          Retry organization date
        </button>
      </div>
    );
  }
  return <>{children}</>;
};

export default ReturnBusinessDateGate;
