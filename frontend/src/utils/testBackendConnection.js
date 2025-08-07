// Test backend connection utility
import axios from 'axios';

const testBackendConnection = async () => {
  const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000';
  
  console.log('Testing backend connection...');
  console.log('Environment API URL:', process.env.REACT_APP_API_BASE_URL);
  console.log('Using API URL:', API_BASE_URL);
  
  try {
    // Try to fetch from the health endpoint or root
    const response = await axios.get(`${API_BASE_URL}/health`, {
      timeout: 5000
    });
    
    console.log('✅ Backend is connected!', response.data);
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Backend is not running or not accessible at:', API_BASE_URL);
    } else if (error.response) {
      // The backend responded but with an error status
      console.log('⚠️ Backend responded with status:', error.response.status);
      console.log('This means backend is reachable but endpoint might not exist');
      return true; // Backend is reachable
    } else {
      console.error('❌ Backend connection error:', error.message);
    }
    return false;
  }
};

// Auto-run when imported in development
if (process.env.NODE_ENV === 'development') {
  testBackendConnection();
}

export default testBackendConnection;