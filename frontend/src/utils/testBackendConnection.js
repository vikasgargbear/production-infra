/**
 * Test Backend Connection Utility
 * Checks if the backend API is reachable and responsive
 */

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app/api';

const testBackendConnection = async () => {
  try {
    console.log('🔄 Testing backend connection...');
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
      console.log(`✅ Backend connection successful! (${responseTime}ms)`);
      console.log(`📡 Connected to: ${API_BASE_URL}`);
      return { success: true, responseTime, url: API_BASE_URL };
    } else {
      console.warn(`⚠️ Backend responded with status: ${response.status}`);
      return { success: false, status: response.status, url: API_BASE_URL };
    }
  } catch (error) {
    console.error('❌ Backend connection failed:', error.message);
    console.error(`🔗 Attempted URL: ${API_BASE_URL}`);
    
    // Additional debugging info
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('💡 This might be a CORS issue or network connectivity problem');
    }
    
    return { 
      success: false, 
      error: error.message, 
      url: API_BASE_URL,
      type: error.name 
    };
  }
};

export default testBackendConnection;