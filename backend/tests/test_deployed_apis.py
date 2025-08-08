"""
Test the deployed API fixes
"""
import requests
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "https://pharma-backend-production-0c09.up.railway.app/api"
HEADERS = {"Content-Type": "application/json"}

def test_apis():
    logger.info("Testing deployed API fixes...\n")
    
    # Test 1: Sales Returns
    logger.info("1. Testing Sales Returns API:")
    response = requests.get(f"{BASE_URL}/sale-returns", headers=HEADERS)
    logger.info(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if isinstance(data, dict):
            logger.info(f"   ✅ Success! Response: {json.dumps(data, indent=2)[:200]}...")
        elif isinstance(data, list):
            logger.info(f"   ✅ Success! Found {len(data)} returns")
            if data:
                logger.info(f"   Sample: {json.dumps(data[0], indent=2)[:200]}...")
    else:
        logger.error(f"   ❌ Error: {response.text[:200]}")
    
    # Test 2: Party Ledger Balance
    logger.info("\n2. Testing Party Ledger API:")
    response = requests.get(
        f"{BASE_URL}/party-ledger/balance/13?party_type=customer", 
        headers=HEADERS
    )
    logger.info(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        logger.info(f"   ✅ Success! Balance data: {json.dumps(data, indent=2)}")
    else:
        logger.error(f"   ❌ Error: {response.text[:200]}")
    
    # Test 3: Stock Movements
    logger.info("\n3. Testing Stock Movements API:")
    response = requests.get(f"{BASE_URL}/stock-movements", headers=HEADERS)
    logger.info(f"   Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        if isinstance(data, dict):
            logger.info(f"   ✅ Success! Response: {json.dumps(data, indent=2)[:200]}...")
        elif isinstance(data, list):
            logger.info(f"   ✅ Success! Found {len(data)} movements")
            if data:
                logger.info(f"   Sample: {json.dumps(data[0], indent=2)[:200]}...")
    else:
        logger.error(f"   ❌ Error: {response.text[:200]}")
    
    # Test 4: Try other endpoints
    logger.info("\n4. Testing other endpoints:")
    
    # Customer ledger
    response = requests.get(f"{BASE_URL}/customers/13/ledger", headers=HEADERS)
    logger.info(f"   Customer ledger: {response.status_code}")
    
    # Stock movement summary
    response = requests.get(f"{BASE_URL}/stock-movements/summary", headers=HEADERS)
    logger.info(f"   Stock movement summary: {response.status_code}")
    
    # Sales return by invoice
    response = requests.get(f"{BASE_URL}/sale-returns/invoice/116", headers=HEADERS)
    logger.info(f"   Sales return by invoice: {response.status_code}")

if __name__ == "__main__":
    test_apis()