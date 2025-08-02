import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, Lock, User, Building2, Shield, AlertCircle, Loader2 } from 'lucide-react';
import authService from '../services/auth';
import { Button } from './global';

interface Credentials {
  username: string;
  password: string;
}

interface DemoUser {
  role: string;
  username: string;
  password: string;
  color: string;
}

interface EnhancedLoginProps {
  onLogin: (success: boolean) => void;
}

const EnhancedLogin: React.FC<EnhancedLoginProps> = ({ onLogin }) => {
  const [credentials, setCredentials] = useState<Credentials>({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<string>('');

  // Demo users for different roles (remove in production)
  const demoUsers: DemoUser[] = [
    { role: 'Admin', username: 'admin', password: 'admin123', color: 'purple' },
    { role: 'Sales', username: 'sales', password: 'sales123', color: 'blue' },
    { role: 'Accounts', username: 'accounts', password: 'accounts123', color: 'green' },
    { role: 'Warehouse', username: 'warehouse', password: 'warehouse123', color: 'orange' }
  ];

  useEffect(() => {
    // Check for remembered username
    const remembered = localStorage.getItem('rememberedUsername');
    if (remembered) {
      setCredentials(prev => ({ ...prev, username: remembered }));
      setRememberMe(true);
    }

    // Check if already authenticated
    if (authService.isAuthenticated()) {
      onLogin(true);
    }
  }, [onLogin]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  const handleDemoLogin = (demoUser: DemoUser) => {
    setCredentials({
      username: demoUser.username,
      password: demoUser.password
    });
    setSelectedRole(demoUser.role);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!credentials.username || !credentials.password) {
      setError('Please enter both username and password');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // For demo purposes, use local validation
      // In production, this will call the actual API
      const isValidDemo = demoUsers.some(
        user => user.username === credentials.username && user.password === credentials.password
      );

      if (isValidDemo) {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Store mock JWT token
        const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImFkbWluIiwicm9sZSI6ImFkbWluIn0.mock';
        localStorage.setItem('authToken', mockToken);
        localStorage.setItem('user', JSON.stringify({
          username: credentials.username,
          role: demoUsers.find(u => u.username === credentials.username)?.role.toLowerCase() || 'user',
          name: `${credentials.username.charAt(0).toUpperCase() + credentials.username.slice(1)} User`
        }));

        // Remember username if checked
        if (rememberMe) {
          localStorage.setItem('rememberedUsername', credentials.username);
        } else {
          localStorage.removeItem('rememberedUsername');
        }

        onLogin(true);
      } else {
        // Try actual API login
        const result = await authService.login(credentials.username, credentials.password);
        
        if (result.success) {
          if (rememberMe) {
            localStorage.setItem('rememberedUsername', credentials.username);
          }
          onLogin(true);
        } else {
          setError(result.error || 'Invalid username or password');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Connection error. Please check your internet connection.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {localStorage.getItem('companyName') || 'AASO Pharmaceuticals'}
          </h1>
          <p className="text-gray-600">Wholesale Management System</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Username Field */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={credentials.username}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter your username"
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={credentials.password}
                  onChange={handleInputChange}
                  className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-700">
                  Remember me
                </label>
              </div>
              <a href="#" className="text-sm text-blue-600 hover:text-blue-500">
                Forgot password?
              </a>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center">
                <AlertCircle className="h-5 w-5 text-red-400 mr-2 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                  Logging in...
                </>
              ) : (
                <>
                  <Shield className="h-5 w-5 mr-2" />
                  Secure Login
                </>
              )}
            </Button>
          </form>

          {/* Demo Users Section */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-xs text-gray-500 text-center mb-4">Demo Accounts (Development Only)</p>
            <div className="grid grid-cols-2 gap-2">
              {demoUsers.map((user) => (
                <button
                  key={user.role}
                  onClick={() => handleDemoLogin(user)}
                  className={`text-xs py-2 px-3 rounded-lg border transition-all hover:shadow-md bg-${user.color}-50 border-${user.color}-200 hover:bg-${user.color}-100`}
                >
                  <div className="font-medium text-gray-700">{user.role}</div>
                  <div className="text-gray-500">{user.username}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            <Lock className="h-3 w-3 inline mr-1" />
            Secured with JWT authentication • Session timeout: 30 minutes
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnhancedLogin;
