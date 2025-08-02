import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class PurchaseErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Purchase Module Error:', error);
      console.error('Error Info:', errorInfo);
    }

    // You can also log the error to an error reporting service here
    this.setState({
      error,
      errorInfo,
      errorCount: this.state.errorCount + 1
    });

    // Log to backend error tracking service (if available)
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error, errorInfo) => {
    // TODO: Implement error logging to backend service
    // Example:
    // errorReportingService.log({
    //   error: error.toString(),
    //   errorInfo: errorInfo.componentStack,
    //   timestamp: new Date().toISOString(),
    //   module: 'purchase',
    //   user: localStorage.getItem('userId')
    // });
  };

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null 
    });
    
    // Optionally reload the page if errors persist
    if (this.state.errorCount > 3) {
      window.location.reload();
    }
  };

  handleGoHome = () => {
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null 
    });
    
    // Navigate to home
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            {/* Error Icon */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
            </div>

            {/* Error Message */}
            <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
              Oops! Something went wrong
            </h2>
            <p className="text-gray-600 text-center mb-6">
              We encountered an error in the purchase module. Don't worry, your data is safe.
            </p>

            {/* Error Details (Development Only) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-6 p-4 bg-gray-100 rounded-lg">
                <p className="text-sm font-mono text-red-600 mb-2">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <details className="text-xs text-gray-600">
                    <summary className="cursor-pointer hover:text-gray-800">
                      View stack trace
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Try Again</span>
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span>Go Home</span>
              </button>
            </div>

            {/* Help Text */}
            <p className="text-sm text-gray-500 text-center mt-6">
              If this problem persists, please contact support with error code: 
              <span className="font-mono text-xs block mt-1">
                PERR-{Date.now().toString(36).toUpperCase()}
              </span>
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Error Fallback Component for Suspense
export const PurchaseErrorFallback = ({ error, resetErrorBoundary }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          </div>
        </div>
        
        <h2 className="text-xl font-semibold text-gray-900 text-center mb-2">
          Loading Error
        </h2>
        <p className="text-gray-600 text-center mb-6">
          Failed to load the purchase module. Please try again.
        </p>
        
        {error && process.env.NODE_ENV === 'development' && (
          <div className="mb-6 p-4 bg-gray-100 rounded-lg">
            <p className="text-sm font-mono text-red-600">
              {error.message || error.toString()}
            </p>
          </div>
        )}
        
        <button
          onClick={resetErrorBoundary}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry</span>
        </button>
      </div>
    </div>
  );
};

export default PurchaseErrorBoundary;