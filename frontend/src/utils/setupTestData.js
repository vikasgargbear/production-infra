// Utility script to help set up initial test data
// This should ideally be done through a proper setup flow

export const createTestCustomer = async () => {
  try {
    // The API client will automatically add org_id from auth token
    const response = await fetch('/api/customers/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // org_id will be added by interceptor from auth token
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      },
      body: JSON.stringify({
        customer_name: "ABC Pharmacy",
        customer_type: "pharmacy", // lowercase as required by backend
        primary_phone: "9876543210",
        email: "abc@pharmacy.com",
        gstin: "27AABCU9603R1ZM",
        credit_limit: 50000,
        credit_days: 30,
        address: {
          street: "123 Main Street",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400001"
        }
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Failed to create customer:', error);
      return { success: false, error };
    }
    
    const data = await response.json();
    console.log('Customer created successfully:', data);
    return { success: true, data };
    
  } catch (error) {
    console.error('Error creating test customer:', error);
    return { success: false, error: error.message };
  }
};

// Helper to check if org exists
export const checkOrgSetup = async () => {
  try {
    const response = await fetch('/api/organizations/current', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Current organization:', data);
      return { hasOrg: true, org: data };
    }
    
    return { hasOrg: false };
    
  } catch (error) {
    console.error('Error checking org:', error);
    return { hasOrg: false, error: error.message };
  }
};

// Note: To use this, you would typically:
// 1. Ensure user is logged in (has authToken)
// 2. The auth token should contain org_id in its payload
// 3. The backend will validate the org_id exists
// 4. If org doesn't exist, user needs to go through setup flow

export default {
  createTestCustomer,
  checkOrgSetup
};