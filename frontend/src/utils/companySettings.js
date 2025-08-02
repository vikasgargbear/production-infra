// Company Settings Helper
export const companySettings = {
  // Default Maharashtra GSTIN for AASO Pharmaceuticals
  DEFAULT_GSTIN: '27AABCU9603R1ZM',
  
  // Initialize company settings
  initialize() {
    if (!localStorage.getItem('companyGST')) {
      localStorage.setItem('companyGST', this.DEFAULT_GSTIN);
    }
    
    if (!localStorage.getItem('companyName')) {
      localStorage.setItem('companyName', 'AASO Pharmaceuticals');
    }
    
    if (!localStorage.getItem('companyAddress')) {
      localStorage.setItem('companyAddress', 'Gangapur City, Rajasthan');
    }
    
    if (!localStorage.getItem('companyState')) {
      localStorage.setItem('companyState', 'Maharashtra');
    }
  },
  
  // Get company GSTIN
  getGSTIN() {
    return localStorage.getItem('companyGST') || this.DEFAULT_GSTIN;
  },
  
  // Get company state code
  getStateCode() {
    const gstin = this.getGSTIN();
    return gstin ? gstin.substring(0, 2) : '27';
  },
  
  // Update company GSTIN
  setGSTIN(gstin) {
    if (gstin && gstin.length === 15) {
      localStorage.setItem('companyGST', gstin);
      // Update state based on GSTIN
      const stateCode = gstin.substring(0, 2);
      const stateName = this.getStateName(stateCode);
      if (stateName) {
        localStorage.setItem('companyState', stateName);
      }
    }
  },
  
  // State code to name mapping
  getStateName(code) {
    const states = {
      '01': 'Jammu and Kashmir',
      '02': 'Himachal Pradesh',
      '03': 'Punjab',
      '04': 'Chandigarh',
      '05': 'Uttarakhand',
      '06': 'Haryana',
      '07': 'Delhi',
      '08': 'Rajasthan',
      '09': 'Uttar Pradesh',
      '10': 'Bihar',
      '11': 'Sikkim',
      '12': 'Arunachal Pradesh',
      '13': 'Nagaland',
      '14': 'Manipur',
      '15': 'Mizoram',
      '16': 'Tripura',
      '17': 'Meghalaya',
      '18': 'Assam',
      '19': 'West Bengal',
      '20': 'Jharkhand',
      '21': 'Odisha',
      '22': 'Chhattisgarh',
      '23': 'Madhya Pradesh',
      '24': 'Gujarat',
      '25': 'Daman and Diu',
      '26': 'Dadra and Nagar Haveli',
      '27': 'Maharashtra',
      '28': 'Andhra Pradesh',
      '29': 'Karnataka',
      '30': 'Goa',
      '31': 'Lakshadweep',
      '32': 'Kerala',
      '33': 'Tamil Nadu',
      '34': 'Puducherry',
      '35': 'Andaman and Nicobar Islands',
      '36': 'Telangana',
      '37': 'Andhra Pradesh (New)',
      '38': 'Ladakh'
    };
    
    return states[code] || null;
  }
};

// Initialize settings on import
companySettings.initialize();