"""
Quick test to verify API fixes
"""
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {"Content-Type": "application/json"}

def test_apis():
    # Test corrected endpoints
    tests = [
        ("GET", "/sale-returns", "Sale Returns (correct prefix)"),
        ("GET", "/party-ledger/balance/13?party_type=customer", "Party Ledger Balance"),
        ("GET", "/stock-movements", "Stock Movements"),
    ]
    
    for method, endpoint, description in tests:
        url = f"{BASE_URL}{endpoint}"
        
        if method == "GET":
            response = requests.get(url, headers=HEADERS)
        
        logger.info(f"{description}: {response.status_code}")
        
        if response.status_code == 200:
            logger.info(f"✅ {description} is working!")
        elif response.status_code == 500:
            logger.error(f"❌ {description} has server error: {response.text[:200]}")
        else:
            logger.warning(f"⚠️ {description} returned {response.status_code}")

if __name__ == "__main__":
    test_apis()