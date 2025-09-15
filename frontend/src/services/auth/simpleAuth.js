/**
 * Simple auth bypass for testing
 * Uses hardcoded test token to bypass auth issues
 */

class SimpleAuth {
  constructor() {
    // Hardcoded test token that works
    this.TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjo5LCJlbWFpbCI6InRlc3RAcGhhcm1hLmNvbSIsIm9yZ19pZCI6IjhjODllNGQxLTA3NzctNGE5YS05ZDI5LWRjNWM2NTRkODA5NCIsInJvbGUiOm51bGwsImJyYW5jaF9pZCI6NywiZXhwIjoxNzU3OTY3OTQwfQ.3jGBJLJTHEhD-8U9zKxJP5Gso7NZDvVUV-H7IcxJXQU";
    this.TEST_ORG_ID = "8c89e4d1-0777-4a9a-9d29-dc5c654d8094";
  }

  setupTestAuth() {
    // Set up test authentication
    localStorage.setItem('authToken', this.TEST_TOKEN);
    localStorage.setItem('pharma_org_id', this.TEST_ORG_ID);
    localStorage.setItem('org_id', this.TEST_ORG_ID);
    sessionStorage.setItem('pharma_org_id', this.TEST_ORG_ID);
    sessionStorage.setItem('org_id', this.TEST_ORG_ID);
    
    // Set test user data
    const testUser = {
      id: 9,
      email: 'test@pharma.com',
      name: 'Test User',
      org_id: this.TEST_ORG_ID,
      org_name: 'Test Pharma Company'
    };
    
    localStorage.setItem('pharma_user', JSON.stringify(testUser));
    
    return true;
  }

  isAuthenticated() {
    const token = localStorage.getItem('authToken');
    return token === this.TEST_TOKEN;
  }

  login() {
    this.setupTestAuth();
    return { success: true };
  }

  logout() {
    localStorage.clear();
    sessionStorage.clear();
  }
}

export default new SimpleAuth();