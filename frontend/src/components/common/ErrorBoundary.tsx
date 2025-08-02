/**
 * Enhanced Error Boundary Component
 * Provides user-friendly error handling with recovery options
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      showDetails: false,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      errorInfo,
    });
    
    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
    
    // Send error to monitoring service (e.g., Sentry)
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails,
    }));
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      const { error, errorInfo, showDetails } = this.state;
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full">
            <div className="bg-white rounded-lg shadow-lg p-6">
              {/* Error Icon and Title */}
              <div className="flex items-center justify-center mb-4">
                <div className="bg-red-100 rounded-full p-3">
                  <AlertTriangle className="h-8 w-8 text-red-600" />
                </div>
              </div>
              
              <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">
                Oops! Something went wrong
              </h1>
              
              <p className="text-gray-600 text-center mb-6">
                We're sorry for the inconvenience. The application encountered an unexpected error.
              </p>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                  <p className="text-sm text-red-800 font-mono">
                    {error.message || 'An unexpected error occurred'}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={this.handleReset}
                  className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Try Again
                </button>
                
                <button
                  onClick={this.handleReload}
                  className="w-full flex items-center justify-center px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reload Page
                </button>
                
                <button
                  onClick={this.handleGoHome}
                  className="w-full flex items-center justify-center px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                >
                  <Home className="h-4 w-4 mr-2" />
                  Go to Homepage
                </button>
              </div>

              {/* Technical Details (Development/Debug) */}
              {isDevelopment && errorInfo && (
                <div className="mt-6">
                  <button
                    onClick={this.toggleDetails}
                    className="flex items-center text-sm text-gray-600 hover:text-gray-800"
                  >
                    {showDetails ? (
                      <ChevronUp className="h-4 w-4 mr-1" />
                    ) : (
                      <ChevronDown className="h-4 w-4 mr-1" />
                    )}
                    {showDetails ? 'Hide' : 'Show'} Technical Details
                  </button>
                  
                  {showDetails && (
                    <div className="mt-4 space-y-4">
                      {/* Stack Trace */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">
                          Stack Trace:
                        </h3>
                        <pre className="bg-gray-100 p-3 rounded-md text-xs overflow-x-auto">
                          {error?.stack}
                        </pre>
                      </div>
                      
                      {/* Component Stack */}
                      <div>
                        <h3 className="text-sm font-medium text-gray-700 mb-1">
                          Component Stack:
                        </h3>
                        <pre className="bg-gray-100 p-3 rounded-md text-xs overflow-x-auto">
                          {errorInfo.componentStack}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Help Text */}
              <p className="text-xs text-gray-500 text-center mt-6">
                If this problem persists, please contact support with error code: 
                <span className="font-mono ml-1">
                  {error?.name || 'UNKNOWN_ERROR'}
                </span>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component for error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onError?: (error: Error, errorInfo: ErrorInfo) => void
) {
  return (props: P) => (
    <ErrorBoundary fallback={fallback} onError={onError}>
      <Component {...props} />
    </ErrorBoundary>
  );
}

/**
 * Hook for error handling (to be used with React Query)
 */
export function useErrorHandler() {
  return (error: Error) => {
    console.error('Error caught by useErrorHandler:', error);
    
    // You can add custom error handling logic here
    // For example, show a toast notification
    if (window.showErrorToast) {
      window.showErrorToast(error.message);
    }
    
    // Re-throw to let Error Boundary catch it if needed
    throw error;
  };
}