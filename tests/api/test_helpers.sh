#!/bin/bash
# ============================================================
# Test Helpers - Common functions for API testing
# ============================================================
# Usage: source this file from test scripts
# Requires: curl, jq, railway CLI (for DB access)
#
# Auth: Uses Supabase JWT token. Set TOKEN env var or call get_test_token.
# ============================================================

# --- Configuration ---
export API_BASE="https://pharma-backend-production-0c09.up.railway.app/api"
export SUPABASE_URL="https://jfrairkkzxwkhbtqejnz.supabase.co"
export ORG_ID="e78d6777-35f6-4b19-994f-caaede2f021a"
export BRANCH_ID=5

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# --- Auth ---
get_test_token() {
    # Get Supabase anon key from Railway
    local ANON_KEY
    ANON_KEY=$(railway variables --json | python3 -c "import json, sys; print(json.load(sys.stdin).get('SUPABASE_ANON_KEY', ''))")

    if [ -z "$TEST_EMAIL" ] || [ -z "$TEST_PASSWORD" ]; then
        echo -e "${RED}Set TEST_EMAIL and TEST_PASSWORD env vars${NC}"
        return 1
    fi

    local RESPONSE
    RESPONSE=$(curl -s "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
        -H "apikey: ${ANON_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")

    TOKEN=$(echo "$RESPONSE" | jq -r '.access_token // empty')
    if [ -z "$TOKEN" ]; then
        echo -e "${RED}Auth failed: $(echo "$RESPONSE" | jq -r '.error_description // .msg // "unknown error"')${NC}"
        return 1
    fi
    export TOKEN
    echo -e "${GREEN}Authenticated as ${TEST_EMAIL}${NC}"
}

# --- API Helpers ---
api_get() {
    local endpoint="$1"
    curl -s -w "\n%{http_code}" "${API_BASE}${endpoint}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json"
}

api_post() {
    local endpoint="$1"
    local data="$2"
    curl -s -w "\n%{http_code}" "${API_BASE}${endpoint}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

api_put() {
    local endpoint="$1"
    local data="$2"
    curl -s -w "\n%{http_code}" "${API_BASE}${endpoint}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$data"
}

# Parse response: splits body and HTTP status code
parse_response() {
    local full_response="$1"
    local total_lines
    total_lines=$(echo "$full_response" | wc -l | tr -d '[:space:]')
    if [ "$total_lines" -gt 1 ]; then
        RESPONSE_BODY=$(echo "$full_response" | sed '$d')
        HTTP_STATUS=$(echo "$full_response" | tail -1)
    else
        RESPONSE_BODY=""
        HTTP_STATUS="$full_response"
    fi
}

# --- DB Helpers ---
run_sql() {
    local sql="$1"
    psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -t -A -c "$sql"
}

run_sql_json() {
    local sql="$1"
    psql "$(railway variables --json | python3 -c "import json, sys; data = json.load(sys.stdin); print(data.get('DATABASE_URL', ''))")" -t -A -c "SELECT json_agg(t) FROM ($sql) t"
}

# --- Assertions ---
assert_status() {
    local expected="$1"
    local actual="$HTTP_STATUS"
    local test_name="${2:-HTTP Status}"

    if [ "$actual" = "$expected" ]; then
        echo -e "  ${GREEN}✓ ${test_name}: ${actual}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${test_name}: expected ${expected}, got ${actual}${NC}"
        echo -e "  ${RED}  Response: $(echo "$RESPONSE_BODY" | head -c 200)${NC}"
        ((FAIL_COUNT++))
    fi
}

assert_json_field() {
    local field="$1"
    local expected="$2"
    local test_name="${3:-JSON field ${field}}"

    local actual
    actual=$(echo "$RESPONSE_BODY" | jq -r "$field // empty")

    if [ "$actual" = "$expected" ]; then
        echo -e "  ${GREEN}✓ ${test_name}: ${actual}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${test_name}: expected '${expected}', got '${actual}'${NC}"
        ((FAIL_COUNT++))
    fi
}

assert_json_exists() {
    local field="$1"
    local test_name="${2:-JSON field ${field} exists}"

    local actual
    actual=$(echo "$RESPONSE_BODY" | jq -r "$field // empty")

    if [ -n "$actual" ] && [ "$actual" != "null" ]; then
        echo -e "  ${GREEN}✓ ${test_name}: ${actual}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${test_name}: field is empty/null${NC}"
        ((FAIL_COUNT++))
    fi
}

assert_db_count() {
    local table="$1"
    local where_clause="$2"
    local expected="$3"
    local test_name="${4:-DB count ${table}}"

    local actual
    actual=$(run_sql "SELECT COUNT(*) FROM ${table} WHERE ${where_clause}")
    actual=$(echo "$actual" | tr -d '[:space:]')

    if [ "$actual" = "$expected" ]; then
        echo -e "  ${GREEN}✓ ${test_name}: ${actual}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${test_name}: expected ${expected}, got ${actual}${NC}"
        ((FAIL_COUNT++))
    fi
}

assert_db_gt() {
    local table="$1"
    local where_clause="$2"
    local min_val="$3"
    local test_name="${4:-DB check ${table}}"

    local actual
    actual=$(run_sql "SELECT COUNT(*) FROM ${table} WHERE ${where_clause}")
    actual=$(echo "$actual" | tr -d '[:space:]')

    if [ "$actual" -gt "$min_val" ] 2>/dev/null; then
        echo -e "  ${GREEN}✓ ${test_name}: ${actual} (> ${min_val})${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ ${test_name}: expected > ${min_val}, got ${actual}${NC}"
        ((FAIL_COUNT++))
    fi
}

# --- Summary ---
print_summary() {
    echo ""
    echo "=================================="
    local TOTAL=$((PASS_COUNT + FAIL_COUNT + SKIP_COUNT))
    if [ "$FAIL_COUNT" -eq 0 ]; then
        echo -e "${GREEN}ALL TESTS PASSED: ${PASS_COUNT}/${TOTAL}${NC}"
    else
        echo -e "${RED}FAILURES: ${FAIL_COUNT}/${TOTAL}${NC}"
        echo -e "${GREEN}Passed: ${PASS_COUNT}${NC}"
        echo -e "${YELLOW}Skipped: ${SKIP_COUNT}${NC}"
    fi
    echo "=================================="
    return "$FAIL_COUNT"
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1 ━━━${NC}"
}

skip_test() {
    echo -e "  ${YELLOW}⊘ SKIPPED: $1${NC}"
    ((SKIP_COUNT++))
}
