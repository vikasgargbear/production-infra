/**
 * Jest Setup File
 * Configure Jest for React component testing
 */

// Import testing libraries
import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Configure testing library
configure({ 
  testIdAttribute: 'data-testid',
  asyncUtilTimeout: 5000 
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.sessionStorage = sessionStorageMock;

// Suppress console errors during tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});

// Global test utilities
global.testUtils = {
  // Wait for async updates
  waitForAsync: () => new Promise(resolve => setTimeout(resolve, 0)),
  
  // Format currency for tests
  formatCurrency: (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
  },
  
  // Mock API response
  mockApiResponse: (data, status = 200) => {
    return Promise.resolve({
      status,
      data,
      headers: {},
      config: {}
    });
  },
  
  // Mock API error
  mockApiError: (message, status = 500) => {
    const error = new Error(message);
    error.response = {
      status,
      data: { detail: message }
    };
    return Promise.reject(error);
  }
};