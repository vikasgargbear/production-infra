#!/bin/bash

# Professional Development Testing Script
# Run this before EVERY commit

set -e  # Exit on any error

echo "================================================"
echo "🔍 PROFESSIONAL TESTING CHECKLIST"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Backend Imports
echo "📦 Test 1: Backend imports..."
cd backend
python -c "from app.main import app; print('✓ Backend imports OK')" && echo -e "${GREEN}✓ PASS${NC}" || (echo -e "${RED}✗ FAIL${NC}" && exit 1)

# Test 2: Start Backend
echo ""
echo "🚀 Test 2: Starting backend..."
uvicorn app.main:app --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!
sleep 5

# Test 3: Health Check
echo ""
echo "💚 Test 3: Health check..."
HEALTH=$(curl -s http://localhost:8001/ | grep -o "Pharma ERP" || echo "FAIL")
if [ "$HEALTH" == "Pharma ERP" ]; then
    echo -e "${GREEN}✓ PASS - Backend is healthy${NC}"
else
    echo -e "${RED}✗ FAIL - Backend health check failed${NC}"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Test 4: API with org_id
echo ""
echo "🔑 Test 4: API with X-Org-Id header..."
API_RESPONSE=$(curl -s -H "X-Org-Id: 1" http://localhost:8001/api/employees/?limit=1)
if echo "$API_RESPONSE" | grep -q "success"; then
    echo -e "${GREEN}✓ PASS - API responds with org_id${NC}"
else
    echo -e "${RED}✗ FAIL - API failed${NC}"
    echo "Response: $API_RESPONSE"
    kill $BACKEND_PID 2>/dev/null
    exit 1
fi

# Clean up
echo ""
echo "🧹 Cleaning up..."
kill $BACKEND_PID 2>/dev/null
cd ..

# Test 5: Frontend Compiles
echo ""
echo "⚛️  Test 5: Frontend compiles..."
cd frontend
npm run build > /dev/null 2>&1 && echo -e "${GREEN}✓ PASS - Frontend builds${NC}" || (echo -e "${RED}✗ FAIL - Frontend build failed${NC}" && exit 1)
cd ..

echo ""
echo "================================================"
echo -e "${GREEN}✓ ALL TESTS PASSED${NC}"
echo "================================================"
echo ""
echo "You can now safely commit and push:"
echo "  git add -A"
echo "  git commit -m 'Your message'"
echo "  git push"
echo ""
