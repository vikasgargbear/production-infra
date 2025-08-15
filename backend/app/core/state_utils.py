"""
Indian State to GST State Code Mapping Utility
Automatically maps state names to their GST state codes
"""

# Official GST State Code mapping as per Indian GST law
GST_STATE_CODES = {
    # States
    'ANDHRA PRADESH': '37',
    'ARUNACHAL PRADESH': '12', 
    'ASSAM': '18',
    'BIHAR': '10',
    'CHHATTISGARH': '22',
    'GOA': '30',
    'GUJARAT': '24',
    'HARYANA': '06',
    'HIMACHAL PRADESH': '02',
    'JHARKHAND': '20',
    'KARNATAKA': '29',
    'KERALA': '32',
    'MADHYA PRADESH': '23',
    'MAHARASHTRA': '27',
    'MANIPUR': '14',
    'MEGHALAYA': '17',
    'MIZORAM': '15',
    'NAGALAND': '13',
    'ODISHA': '21',
    'PUNJAB': '03',
    'RAJASTHAN': '08',
    'SIKKIM': '11',
    'TAMIL NADU': '33',
    'TELANGANA': '36',
    'TRIPURA': '16',
    'UTTAR PRADESH': '09',
    'UTTARAKHAND': '05',
    'WEST BENGAL': '19',
    
    # Union Territories
    'ANDAMAN AND NICOBAR ISLANDS': '35',
    'CHANDIGARH': '04',
    'DADRA AND NAGAR HAVELI': '26',
    'DAMAN AND DIU': '25',
    'DELHI': '07',
    'JAMMU AND KASHMIR': '01',
    'LADAKH': '38',
    'LAKSHADWEEP': '31',
    'PUDUCHERRY': '34'
}

def get_state_code(state_name: str) -> str:
    """
    Get GST state code for a given state name
    
    Args:
        state_name: Name of the state (case insensitive)
        
    Returns:
        GST state code (2 digits) or '00' if not found
    """
    if not state_name:
        return '00'
    
    # Normalize state name for lookup
    normalized_name = state_name.strip().upper()
    
    # Direct lookup
    if normalized_name in GST_STATE_CODES:
        return GST_STATE_CODES[normalized_name]
    
    # Try partial matching for common variations
    for state, code in GST_STATE_CODES.items():
        if normalized_name in state or state in normalized_name:
            return code
    
    # Default for unrecognized states
    return '00'

def get_state_name_and_code(state_input: str) -> tuple[str, str]:
    """
    Get both state name and code from input
    
    Args:
        state_input: State name input
        
    Returns:
        Tuple of (state_name, state_code)
    """
    if not state_input:
        return "", "00"
    
    state_name = state_input.strip()
    state_code = get_state_code(state_name)
    
    return state_name, state_code

def validate_state_code(state_code: str) -> bool:
    """
    Validate if a state code is valid
    
    Args:
        state_code: 2-digit state code
        
    Returns:
        True if valid, False otherwise
    """
    return state_code in GST_STATE_CODES.values()