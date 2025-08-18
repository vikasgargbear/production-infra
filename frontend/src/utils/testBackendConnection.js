/**
 * Test Backend Connection Utility
 * Checks if the backend API is reachable and responsive
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app/api';

// Cache connection test result to avoid repeated calls
let connectionCache = null;
let lastTestTime = 0;
const CACHE_DURATION = 30000; // 30 seconds cache

const testBackendConnection = async (force = false) => {
  const now = Date.now();
  
  // Return cached result if recent and not forced
  if (!force && connectionCache && (now - lastTestTime) < CACHE_DURATION) {
    return connectionCache;
  }
  
  try {
    // Only log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Testing backend connection...');
    }
    
    const startTime = Date.now();
    
    // Test basic health endpoint
    const response = await fetch(`${API_BASE_URL}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.ok) {
      const result = { success: true, responseTime, url: API_BASE_URL };
      
      // Only log in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Backend connection successful! (${responseTime}ms)`);
        console.log(`📡 Connected to: ${API_BASE_URL}`);
      }
      
      // Cache successful result
      connectionCache = result;
      lastTestTime = now;
      return result;
    } else {
      const result = { success: false, status: response.status, url: API_BASE_URL };
      console.warn(`⚠️ Backend responded with status: ${response.status}`);
      
      // Cache failed result for shorter time
      connectionCache = result;
      lastTestTime = now - (CACHE_DURATION * 0.8); // Cache for less time on failure
      return result;
    }
  } catch (error) {
    console.error('❌ Backend connection failed:', error.message);
    console.error(`🔗 Attempted URL: ${API_BASE_URL}`);
    
    // Additional debugging info
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('💡 This might be a CORS issue or network connectivity problem');
    }
    
    const result = { 
      success: false, 
      error: error.message, 
      url: API_BASE_URL,
      type: error.name 
    };
    
    // Cache failed result for shorter time
    connectionCache = result;
    lastTestTime = now - (CACHE_DURATION * 0.8);
    return result;
  }
};

export default testBackendConnection;