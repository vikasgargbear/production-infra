import React, { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react';
import apiClient from '../services/api/apiClient';
import authService from '../services/auth';

const AuthDiagnostic = () => {
  const [diagnostics, setDiagnostics] = useState({
    localStorage: {},
    tokenInfo: null,
    apiTest: null,
    isLoading: false,
    error: null
  });

  const runDiagnostics = async () => {
    setDiagnostics(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // 1. Check localStorage
      const storageData = {
        authToken: localStorage.getItem('authToken'),
        auth_token: localStorage.getItem('auth_token'),
        token: localStorage.getItem('token'),
        user: localStorage.getItem('user'),
        org_id: localStorage.getItem('org_id'),
        companyName: localStorage.getItem('companyName')
      };

      // 2. Parse token if exists
      let tokenInfo = null;
      const token = storageData.authToken || storageData.auth_token || storageData.token;
      
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const expiry = new Date(payload.exp * 1000);
            const now = new Date();
            
            tokenInfo = {
              valid: true,
              payload: payload,
              expiresAt: expiry.toISOString(),
              isExpired: now > expiry,
              timeLeft: expiry > now ? Math.floor((expiry - now) / 1000 / 60) + ' minutes' : 'EXPIRED',
              tokenLength: token.length,
              tokenPreview: token.substring(0, 50) + '...'
            };
          }
        } catch (e) {
          tokenInfo = { valid: false, error: e.message };
        }
      } else {
        tokenInfo = { valid: false, error: 'No token found in localStorage' };
      }

      // 3. Test API call
      let apiTest = { status: 'pending' };
      try {
        const response = await apiClient.get('/users/');
        apiTest = {
          status: 'success',
          statusCode: response.status,
          dataReceived: !!response.data,
          userCount: Array.isArray(response.data) ? response.data.length : 'N/A'
        };
      } catch (error) {
        apiTest = {
          status: 'failed',
          statusCode: error.response?.status,
          message: error.response?.data?.detail || error.message,
          headers: error.config?.headers
        };
      }

      setDiagnostics({
        localStorage: storageData,
        tokenInfo,
        apiTest,
        isLoading: false,
        error: null
      });
    } catch (error) {
      setDiagnostics(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
    }
  };

  const performLogin = async () => {
    try {
      const result = await authService.login('admin@pharma.com', 'admin123');
      if (result.success) {
        alert('Login successful! Refresh diagnostics to see new token.');
        runDiagnostics();
      } else {
        alert('Login failed: ' + result.error);
      }
    } catch (error) {
      alert('Login error: ' + error.message);
    }
  };

  const clearStorage = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('org_id');
    alert('Storage cleared! Refresh diagnostics.');
    runDiagnostics();
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const StatusIcon = ({ status }) => {
    if (status === 'success' || status === true) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else if (status === 'failed' || status === false) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    } else {
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Shield className="w-8 h-8 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-800">Authentication Diagnostic</h2>
          </div>
          <button
            onClick={runDiagnostics}
            disabled={diagnostics.isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${diagnostics.isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {diagnostics.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
            Error: {diagnostics.error}
          </div>
        )}

        {/* LocalStorage Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">LocalStorage Contents</h3>
          <div className="bg-gray-50 rounded p-4">
            {Object.entries(diagnostics.localStorage).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="font-mono text-sm">{key}:</span>
                <div className="flex items-center space-x-2">
                  <StatusIcon status={!!value} />
                  <span className="text-sm text-gray-600">
                    {value ? (value.length > 50 ? value.substring(0, 50) + '...' : value) : 'Not found'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Token Info Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">Token Information</h3>
          <div className="bg-gray-50 rounded p-4">
            {diagnostics.tokenInfo?.valid ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <div className="flex items-center space-x-2">
                    <StatusIcon status={!diagnostics.tokenInfo.isExpired} />
                    <span className={diagnostics.tokenInfo.isExpired ? 'text-red-600' : 'text-green-600'}>
                      {diagnostics.tokenInfo.isExpired ? 'EXPIRED' : 'Valid'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span>Time Left:</span>
                  <span className="font-mono text-sm">{diagnostics.tokenInfo.timeLeft}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>User ID:</span>
                  <span className="font-mono text-sm">{diagnostics.tokenInfo.payload?.user_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Email:</span>
                  <span className="font-mono text-sm">{diagnostics.tokenInfo.payload?.email}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Org ID:</span>
                  <span className="font-mono text-sm text-xs">{diagnostics.tokenInfo.payload?.org_id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Role:</span>
                  <span className="font-mono text-sm">{diagnostics.tokenInfo.payload?.role_id}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-red-600">
                <XCircle className="w-5 h-5" />
                <span>{diagnostics.tokenInfo?.error || 'No valid token found'}</span>
              </div>
            )}
          </div>
        </div>

        {/* API Test Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-700">API Test (/users/)</h3>
          <div className="bg-gray-50 rounded p-4">
            {diagnostics.apiTest && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <div className="flex items-center space-x-2">
                    <StatusIcon status={diagnostics.apiTest.status === 'success'} />
                    <span className={diagnostics.apiTest.status === 'success' ? 'text-green-600' : 'text-red-600'}>
                      {diagnostics.apiTest.status === 'success' ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span>HTTP Status:</span>
                  <span className="font-mono text-sm">{diagnostics.apiTest.statusCode || 'N/A'}</span>
                </div>
                {diagnostics.apiTest.message && (
                  <div className="flex items-center justify-between">
                    <span>Message:</span>
                    <span className="text-sm text-red-600">{diagnostics.apiTest.message}</span>
                  </div>
                )}
                {diagnostics.apiTest.userCount !== undefined && (
                  <div className="flex items-center justify-between">
                    <span>Users Found:</span>
                    <span className="font-mono text-sm">{diagnostics.apiTest.userCount}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <button
            onClick={performLogin}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Quick Login (admin@pharma.com)
          </button>
          <button
            onClick={clearStorage}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Clear Storage
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthDiagnostic;