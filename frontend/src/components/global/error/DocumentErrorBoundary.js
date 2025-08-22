import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class DocumentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Document Error Boundary caught:', error, errorInfo);
    }
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
      retryCount: this.state.retryCount + 1
    });
    
    // TODO: Send error to logging service in production
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null,
      errorInfo: null,
      retryCount: 0 
    });
    
    // Call onReset if provided
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleGoHome = () => {
    // Navigate to home or close the document
    if (this.props.onClose) {
      this.props.onClose();
    } else {
      window.location.href = '/';
    }
  };

  render() {
    if (this.state.hasError) {
      const { documentType = 'Document', fallback } = this.props;
      
      // Use custom fallback if provided
      if (fallback) {
        return fallback(this.state.error, this.handleReset);
      }
      
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            
            <h2 className="text-xl font-semibold text-center text-gray-900 mb-2">
              {documentType} Error
            </h2>
            
            <p className="text-sm text-gray-600 text-center mb-6">
              We encountered an error while loading the {documentType.toLowerCase()}. 
              This might be a temporary issue.
            </p>
            
            {/* Error details in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mb-4 p-3 bg-gray-100 rounded text-xs">
                <p className="font-medium text-gray-700 mb-1">Error Details:</p>
                <p className="text-gray-600 break-all">{this.state.error.toString()}</p>
                {this.state.retryCount > 1 && (
                  <p className="text-orange-600 mt-2">
                    Retry attempts: {this.state.retryCount - 1}
                  </p>
                )}
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Back
              </button>
            </div>
            
            {this.state.retryCount > 2 && (
              <p className="text-xs text-gray-500 text-center mt-4">
                If this problem persists, please contact support.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default DocumentErrorBoundary;