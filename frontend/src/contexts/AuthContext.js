import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';
import { hasPermission, hasModuleAccess } from '../config/userRoles.config';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load user from localStorage on mount
  useEffect(() => {
    const loadUser = () => {
      try {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.error('Error loading user:', err);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  // Login function
  const login = async (credentials) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await authApi.login(credentials);
      
      if (response.data?.user) {
        const userData = {
          ...response.data.user,
          modules: response.data.user.modules || [],
          permissions: response.data.user.permissions || {}
        };
        
        setUser(userData);
        localStorage.setItem('currentUser', JSON.stringify(userData));
        
        return { success: true };
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      localStorage.removeItem('currentUser');
      localStorage.removeItem('authToken');
    }
  };

  // Check if user has permission for a specific module and action
  const checkPermission = (module, permission) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin has all permissions
    
    return hasPermission(user.permissions, module, permission);
  };

  // Check if user has access to a module
  const checkModuleAccess = (module) => {
    if (!user) return false;
    if (user.role === 'admin') return true; // Admin has access to all modules
    
    return hasModuleAccess(user.modules, module);
  };

  // Update user data (after profile update, etc.)
  const updateUser = (userData) => {
    const updatedUser = { ...user, ...userData };
    setUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
  };

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    checkPermission,
    checkModuleAccess,
    updateUser,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;