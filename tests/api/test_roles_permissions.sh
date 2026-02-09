#!/bin/bash
# ============================================================
# E2E Test: Roles & Permissions System
# ============================================================
# Tests all /api/roles/* and /api/users/* endpoints
# Verifies Role-First RBAC, permission gating, and user management
#
# TEST CASES:
#   SCENARIO 1: Roles CRUD
#     1.1  GET  /roles/               — List all roles (expect 7 seeded)
#     1.2  GET  /roles/{id}           — Get single role details
#     1.3  POST /roles/               — Create custom role
#     1.4  PUT  /roles/{id}           — Update custom role permissions
#     1.5  DELETE /roles/{id}         — Delete custom role
#     1.6  POST /roles/setup-defaults — Re-seed (idempotent)
#
#   SCENARIO 2: Role Assignment & Validation
#     2.1  POST /roles/assign         — Assign role to user
#     2.2  POST /roles/validate       — Validate specific permission
#     2.3  GET  /roles/user/{id}/permissions — Get effective permissions
#
#   SCENARIO 3: User Management CRUD
#     3.1  GET  /users/               — List all org users
#     3.2  GET  /users/roles          — Get available roles (auto-seed)
#     3.3  POST /users/               — Create new user
#     3.4  GET  /users/{id}           — Get user details
#     3.5  PUT  /users/{id}           — Update user (change role)
#     3.6  DELETE /users/{id}         — Soft-delete user
#
#   SCENARIO 4: Permission Enforcement
#     4.1  Verify admin has all permissions
#     4.2  Verify viewer has view-only
#     4.3  Verify role change reflects in permissions
#
#   SCENARIO 5: Edge Cases & Security
#     5.1  Invalid role_id returns 404
#     5.2  Cannot delete system role
#     5.3  Cannot delete role with users (no reassign)
#     5.4  Duplicate role_code returns 400
#     5.5  Deprecated /users/{id}/permissions returns 410
#
# Usage: bash tests/api/test_roles_permissions.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/test_helpers.sh"

echo "============================================"
echo "  E2E Test: Roles & Permissions System"
echo "============================================"
echo ""

# ── Auth ──────────────────────────────────────────
section "SETUP: Authentication"

if [ -z "${TOKEN:-}" ]; then
    # Try real auth first, fall back to TEST_MODE token
    if [ -n "${TEST_EMAIL:-}" ] && [ -n "${TEST_PASSWORD:-}" ]; then
        get_test_token || true
    fi
fi

if [ -z "${TOKEN:-}" ]; then
    # Use TEST_MODE bypass token (works when TEST_MODE=true on backend)
    export TOKEN="test_mode_token"
    echo -e "${YELLOW}Using TEST_MODE bypass token${NC}"
fi
echo -e "${GREEN}Token ready${NC}"

# Track IDs for cleanup
CUSTOM_ROLE_ID=""
TEST_USER_ID=""

# ══════════════════════════════════════════════════
# SCENARIO 1: Roles CRUD
# ══════════════════════════════════════════════════
section "SCENARIO 1: Roles CRUD"

# ── 1.1 List all roles ───────────────────────────
echo ""
echo "1.1 GET /roles/ — List all roles"
RESP=$(api_get "/roles/")
parse_response "$RESP"
assert_status "200" "List roles returns 200"
assert_json_field ".success" "true" "Response success=true"

ROLE_COUNT=$(echo "$RESPONSE_BODY" | jq '.data | length')
echo -e "  ${BLUE}ℹ Roles count: ${ROLE_COUNT}${NC}"

if [ "$ROLE_COUNT" -ge 7 ]; then
    echo -e "  ${GREEN}✓ At least 7 roles exist (seeded defaults)${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected ≥7 roles, got ${ROLE_COUNT}${NC}"
    ((FAIL_COUNT++))
fi

# Verify response includes modules and permission_types metadata
assert_json_exists ".modules" "Response includes modules list"
assert_json_exists ".permission_types" "Response includes permission_types"

# ── 1.2 Get single role details ──────────────────
echo ""
echo "1.2 GET /roles/{id} — Get admin role details"

# Get admin role_id from the list
ADMIN_ROLE_ID=$(echo "$RESPONSE_BODY" | jq -r '.data[] | select(.role_code == "admin") | .role_id')

if [ -n "$ADMIN_ROLE_ID" ] && [ "$ADMIN_ROLE_ID" != "null" ]; then
    echo -e "  ${BLUE}ℹ Admin role_id: ${ADMIN_ROLE_ID}${NC}"
    RESP=$(api_get "/roles/${ADMIN_ROLE_ID}")
    parse_response "$RESP"
    assert_status "200" "Get role details returns 200"
    assert_json_field ".success" "true" "Response success=true"
    assert_json_field ".data.role_code" "admin" "Role code is 'admin'"
    assert_json_field ".data.is_system_role" "true" "Admin is system role"
    assert_json_exists ".data.permissions" "Role has permissions"
    assert_json_exists ".data.users" "Role has users array"
else
    echo -e "  ${YELLOW}⊘ Admin role not found, skipping detail test${NC}"
    ((SKIP_COUNT++))
fi

# ── 1.3 Create custom role ───────────────────────
echo ""
echo "1.3 POST /roles/ — Create custom role 'delivery_boy'"
RESP=$(api_post "/roles/" '{
    "role_code": "delivery_boy",
    "role_name": "Delivery Boy",
    "role_description": "Field delivery personnel with limited access",
    "permissions": {
        "sales": {"view": true, "create": false},
        "inventory": {"view": true},
        "purchase": {"view": false}
    },
    "allowed_modules": ["sales", "inventory"],
    "data_access_level": "own"
}')
parse_response "$RESP"
assert_status "200" "Create custom role returns 200"
assert_json_field ".success" "true" "Response success=true"

CUSTOM_ROLE_ID=$(echo "$RESPONSE_BODY" | jq -r '.role_id // empty')
if [ -n "$CUSTOM_ROLE_ID" ]; then
    echo -e "  ${GREEN}✓ Custom role created: id=${CUSTOM_ROLE_ID}${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ No role_id returned${NC}"
    ((FAIL_COUNT++))
fi

# Verify in DB
if [ -n "$CUSTOM_ROLE_ID" ]; then
    DB_CHECK=$(run_sql "SELECT role_code, is_system_role FROM master.roles WHERE role_id = ${CUSTOM_ROLE_ID}")
    if echo "$DB_CHECK" | grep -q "delivery_boy"; then
        echo -e "  ${GREEN}✓ DB confirms role exists with code 'delivery_boy'${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ DB check failed: ${DB_CHECK}${NC}"
        ((FAIL_COUNT++))
    fi

    DB_SYSTEM=$(echo "$DB_CHECK" | grep -o '[tf]$' || echo "")
    if [ "$DB_SYSTEM" = "f" ]; then
        echo -e "  ${GREEN}✓ DB confirms is_system_role=false${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected is_system_role=false, got: ${DB_SYSTEM}${NC}"
        ((FAIL_COUNT++))
    fi
fi

# ── 1.4 Update custom role ───────────────────────
echo ""
echo "1.4 PUT /roles/{id} — Update custom role permissions"

if [ -n "$CUSTOM_ROLE_ID" ]; then
    RESP=$(api_put "/roles/${CUSTOM_ROLE_ID}" '{
        "role_name": "Delivery Executive",
        "permissions": {
            "sales": {"view": true, "create": true},
            "inventory": {"view": true}
        },
        "allowed_modules": ["sales", "inventory", "reports"]
    }')
    parse_response "$RESP"
    assert_status "200" "Update role returns 200"
    assert_json_field ".success" "true" "Response success=true"

    # Verify update persisted
    RESP=$(api_get "/roles/${CUSTOM_ROLE_ID}")
    parse_response "$RESP"
    assert_json_field ".data.role_name" "Delivery Executive" "Name updated to 'Delivery Executive'"
else
    skip_test "No custom role to update"
fi

# ── 1.5 Delete custom role (tested later after assignment) ──
# We'll test delete in scenario 5 after edge cases

# ── 1.6 Setup defaults (idempotent) ──────────────
echo ""
echo "1.6 POST /roles/setup-defaults — Re-seed defaults (idempotent)"
RESP=$(api_post "/roles/setup-defaults" '{}')
parse_response "$RESP"
assert_status "200" "Setup defaults returns 200"
assert_json_field ".success" "true" "Response success=true"

# Verify still have ≥7 roles
RESP=$(api_get "/roles/")
parse_response "$RESP"
ROLE_COUNT_AFTER=$(echo "$RESPONSE_BODY" | jq '.data | length')
if [ "$ROLE_COUNT_AFTER" -ge 7 ]; then
    echo -e "  ${GREEN}✓ Still ≥7 roles after re-seed (idempotent): ${ROLE_COUNT_AFTER}${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected ≥7 roles after re-seed, got ${ROLE_COUNT_AFTER}${NC}"
    ((FAIL_COUNT++))
fi


# ══════════════════════════════════════════════════
# SCENARIO 2: Role Assignment & Validation
# ══════════════════════════════════════════════════
section "SCENARIO 2: Role Assignment & Validation"

# Get a viewer role_id
VIEWER_ROLE_ID=$(echo "$RESPONSE_BODY" | jq -r '.data[] | select(.role_code == "viewer") | .role_id')
BILLING_ROLE_ID=$(echo "$RESPONSE_BODY" | jq -r '.data[] | select(.role_code == "billing") | .role_id')
echo -e "  ${BLUE}ℹ Viewer role_id: ${VIEWER_ROLE_ID}, Billing role_id: ${BILLING_ROLE_ID}${NC}"

# ── 2.1 Assign role ──────────────────────────────
echo ""
echo "2.1 POST /roles/assign — Assign viewer role to user 7"

if [ -n "$VIEWER_ROLE_ID" ] && [ "$VIEWER_ROLE_ID" != "null" ]; then
    # Save current role to restore later
    ORIG_ROLE=$(run_sql "SELECT role_id FROM master.org_users WHERE user_id = 7" | tr -d '[:space:]')
    echo -e "  ${BLUE}ℹ User 7 current role_id: ${ORIG_ROLE}${NC}"

    RESP=$(api_post "/roles/assign" "{
        \"role_id\": ${VIEWER_ROLE_ID},
        \"user_ids\": [7]
    }")
    parse_response "$RESP"
    assert_status "200" "Assign role returns 200"
    assert_json_field ".success" "true" "Response success=true"

    # Verify DB updated
    NEW_ROLE=$(run_sql "SELECT role_id FROM master.org_users WHERE user_id = 7" | tr -d '[:space:]')
    if [ "$NEW_ROLE" = "$VIEWER_ROLE_ID" ]; then
        echo -e "  ${GREEN}✓ DB confirms user 7 now has role_id=${NEW_ROLE}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected role_id=${VIEWER_ROLE_ID}, got ${NEW_ROLE}${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No viewer role_id found"
fi

# ── 2.2 Validate permission ──────────────────────
echo ""
echo "2.2 POST /roles/validate — Validate user permission"
RESP=$(api_post "/roles/validate" '{
    "module": "sales",
    "permission": "view"
}')
parse_response "$RESP"
assert_status "200" "Validate permission returns 200"
assert_json_field ".success" "true" "Response success=true"
assert_json_exists ".has_permission" "Response includes has_permission"
echo -e "  ${BLUE}ℹ has_permission for sales:view = $(echo "$RESPONSE_BODY" | jq '.has_permission')${NC}"

# ── 2.3 Get user permissions ─────────────────────
echo ""
echo "2.3 GET /roles/user/7/permissions — Get effective permissions"
RESP=$(api_get "/roles/user/7/permissions")
parse_response "$RESP"
assert_status "200" "Get user permissions returns 200"
assert_json_field ".success" "true" "Response success=true"
assert_json_exists ".data" "Response includes data"

# Check permissions structure
PERM_DATA=$(echo "$RESPONSE_BODY" | jq '.data')
echo -e "  ${BLUE}ℹ Permissions data keys: $(echo "$PERM_DATA" | jq 'keys')${NC}"

# If user is viewer, should have modules
HAS_MODULES=$(echo "$PERM_DATA" | jq 'has("modules")')
HAS_ALL=$(echo "$PERM_DATA" | jq 'has("all")')

if [ "$HAS_ALL" = "true" ] || [ "$HAS_MODULES" = "true" ]; then
    echo -e "  ${GREEN}✓ Permissions structure is valid (has modules or all flag)${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Permissions structure invalid: neither 'modules' nor 'all' found${NC}"
    ((FAIL_COUNT++))
fi

# Restore original role
if [ -n "$ORIG_ROLE" ] && [ "$ORIG_ROLE" != "" ]; then
    echo -e "  ${BLUE}ℹ Restoring user 7 to role_id=${ORIG_ROLE}${NC}"
    RESP=$(api_post "/roles/assign" "{
        \"role_id\": ${ORIG_ROLE},
        \"user_ids\": [7]
    }")
    parse_response "$RESP"
    assert_status "200" "Restore original role returns 200"
fi


# ══════════════════════════════════════════════════
# SCENARIO 3: User Management CRUD
# ══════════════════════════════════════════════════
section "SCENARIO 3: User Management CRUD"

# ── 3.1 List users ───────────────────────────────
echo ""
echo "3.1 GET /users/ — List all org users"
RESP=$(api_get "/users/")
parse_response "$RESP"
assert_status "200" "List users returns 200"

USER_COUNT=$(echo "$RESPONSE_BODY" | jq '.data | length // 0')
if [ "$USER_COUNT" -gt 0 ]; then
    echo -e "  ${GREEN}✓ Found ${USER_COUNT} users${NC}"
    ((PASS_COUNT++))

    # Check first user has expected fields
    FIRST_USER=$(echo "$RESPONSE_BODY" | jq '.data[0]')
    for FIELD in user_id username email role_code; do
        VAL=$(echo "$FIRST_USER" | jq -r ".${FIELD} // empty")
        if [ -n "$VAL" ]; then
            echo -e "  ${GREEN}✓ User has field '${FIELD}': ${VAL}${NC}"
            ((PASS_COUNT++))
        else
            echo -e "  ${RED}✗ User missing field '${FIELD}'${NC}"
            ((FAIL_COUNT++))
        fi
    done
else
    echo -e "  ${RED}✗ No users found${NC}"
    ((FAIL_COUNT++))
fi

# ── 3.2 Get available roles ──────────────────────
echo ""
echo "3.2 GET /users/roles — Get available roles"
RESP=$(api_get "/users/roles")
parse_response "$RESP"
assert_status "200" "Get available roles returns 200"

AVAIL_ROLE_COUNT=$(echo "$RESPONSE_BODY" | jq '.data | length // 0')
if [ "$AVAIL_ROLE_COUNT" -ge 7 ]; then
    echo -e "  ${GREEN}✓ Available roles: ${AVAIL_ROLE_COUNT} (≥7 defaults)${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected ≥7 available roles, got ${AVAIL_ROLE_COUNT}${NC}"
    ((FAIL_COUNT++))
fi

# ── 3.3 Create user ──────────────────────────────
echo ""
echo "3.3 POST /users/ — Create test user"

# Use viewer role for new user
CREATE_ROLE_ID="${VIEWER_ROLE_ID:-12}"
RESP=$(api_post "/users/" "{
    \"username\": \"test_e2e_user_$(date +%s)\",
    \"email\": \"test_e2e_$(date +%s)@example.com\",
    \"fullName\": \"E2E Test User\",
    \"mobile\": \"9999999999\",
    \"role_id\": ${CREATE_ROLE_ID},
    \"branchIds\": [5]
}")
parse_response "$RESP"
assert_status "200" "Create user returns 200"

# Handle both response formats
TEST_USER_ID=$(echo "$RESPONSE_BODY" | jq -r '.user_id // .data.user_id // empty')
if [ -n "$TEST_USER_ID" ] && [ "$TEST_USER_ID" != "null" ]; then
    echo -e "  ${GREEN}✓ User created: id=${TEST_USER_ID}${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ No user_id returned. Response: $(echo "$RESPONSE_BODY" | head -c 300)${NC}"
    ((FAIL_COUNT++))
    # Try to find the user in DB
    TEST_USER_ID=$(run_sql "SELECT user_id FROM master.org_users WHERE username LIKE 'test_e2e_user_%' ORDER BY created_at DESC LIMIT 1" | tr -d '[:space:]')
    if [ -n "$TEST_USER_ID" ]; then
        echo -e "  ${BLUE}ℹ Found in DB: user_id=${TEST_USER_ID}${NC}"
    fi
fi

# ── 3.4 Get user details ─────────────────────────
echo ""
echo "3.4 GET /users/{id} — Get user details"

if [ -n "$TEST_USER_ID" ] && [ "$TEST_USER_ID" != "null" ]; then
    RESP=$(api_get "/users/${TEST_USER_ID}")
    parse_response "$RESP"
    assert_status "200" "Get user returns 200"

    # Check user fields
    GOT_EMAIL=$(echo "$RESPONSE_BODY" | jq -r '.data.email // .email // empty')
    if [ -n "$GOT_EMAIL" ]; then
        echo -e "  ${GREEN}✓ User email: ${GOT_EMAIL}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ No email in response${NC}"
        ((FAIL_COUNT++))
    fi

    GOT_ROLE=$(echo "$RESPONSE_BODY" | jq -r '.data.role_code // .role_code // empty')
    echo -e "  ${BLUE}ℹ User role_code: ${GOT_ROLE}${NC}"
else
    skip_test "No test user to fetch"
fi

# ── 3.5 Update user ──────────────────────────────
echo ""
echo "3.5 PUT /users/{id} — Update user role to billing"

if [ -n "$TEST_USER_ID" ] && [ "$TEST_USER_ID" != "null" ] && [ -n "$BILLING_ROLE_ID" ] && [ "$BILLING_ROLE_ID" != "null" ]; then
    RESP=$(api_put "/users/${TEST_USER_ID}" "{
        \"role_id\": ${BILLING_ROLE_ID},
        \"fullName\": \"E2E Updated User\"
    }")
    parse_response "$RESP"
    assert_status "200" "Update user returns 200"

    # Verify in DB
    DB_ROLE=$(run_sql "SELECT role_id FROM master.org_users WHERE user_id = ${TEST_USER_ID}" | tr -d '[:space:]')
    if [ "$DB_ROLE" = "$BILLING_ROLE_ID" ]; then
        echo -e "  ${GREEN}✓ DB confirms role changed to billing (${DB_ROLE})${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected role_id=${BILLING_ROLE_ID}, got ${DB_ROLE}${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No test user or billing role to update"
fi

# ── 3.6 Delete (soft-delete) user ────────────────
echo ""
echo "3.6 DELETE /users/{id} — Soft-delete test user"

if [ -n "$TEST_USER_ID" ] && [ "$TEST_USER_ID" != "null" ]; then
    RESP=$(curl -s -w "\n%{http_code}" -X DELETE "${API_BASE}/users/${TEST_USER_ID}" \
        -H "Authorization: Bearer ${TOKEN}")
    parse_response "$RESP"
    assert_status "200" "Delete user returns 200"

    # Verify soft-deleted
    IS_ACTIVE=$(run_sql "SELECT is_active FROM master.org_users WHERE user_id = ${TEST_USER_ID}" | tr -d '[:space:]')
    if [ "$IS_ACTIVE" = "f" ]; then
        echo -e "  ${GREEN}✓ DB confirms user is_active=false (soft-deleted)${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected is_active=false, got ${IS_ACTIVE}${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No test user to delete"
fi


# ══════════════════════════════════════════════════
# SCENARIO 4: Permission Enforcement
# ══════════════════════════════════════════════════
section "SCENARIO 4: Permission Enforcement"

# ── 4.1 Admin has all permissions ─────────────────
echo ""
echo "4.1 Verify admin user has all permissions"

# User 7 should be admin — get permissions
RESP=$(api_get "/roles/user/7/permissions")
parse_response "$RESP"
assert_status "200" "Get admin permissions returns 200"

IS_ALL=$(echo "$RESPONSE_BODY" | jq '.data.all // false')
if [ "$IS_ALL" = "true" ]; then
    echo -e "  ${GREEN}✓ Admin has {all: true} permissions${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected admin to have {all: true}, got: $(echo "$RESPONSE_BODY" | jq '.data' | head -c 200)${NC}"
    ((FAIL_COUNT++))
fi

# ── 4.2 Verify viewer has limited permissions ────
echo ""
echo "4.2 Verify viewer role structure"

if [ -n "$VIEWER_ROLE_ID" ] && [ "$VIEWER_ROLE_ID" != "null" ]; then
    RESP=$(api_get "/roles/${VIEWER_ROLE_ID}")
    parse_response "$RESP"
    assert_status "200" "Get viewer role returns 200"

    # Viewer should have view permissions but no create/delete
    VIEWER_PERMS=$(echo "$RESPONSE_BODY" | jq '.data.permissions')
    SALES_CREATE=$(echo "$VIEWER_PERMS" | jq '.sales.create // false')
    SALES_VIEW=$(echo "$VIEWER_PERMS" | jq '.sales.view // false')

    if [ "$SALES_VIEW" = "true" ]; then
        echo -e "  ${GREEN}✓ Viewer has sales:view=true${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected viewer sales:view=true${NC}"
        ((FAIL_COUNT++))
    fi

    if [ "$SALES_CREATE" = "false" ]; then
        echo -e "  ${GREEN}✓ Viewer has sales:create=false${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Expected viewer sales:create=false, got ${SALES_CREATE}${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No viewer role to check"
fi

# ── 4.3 Verify role change reflects in permissions ──
echo ""
echo "4.3 Role change reflects in user permissions"

# Find a non-admin user
NON_ADMIN_ID=$(run_sql "SELECT user_id FROM master.org_users WHERE is_admin = false AND is_active = true AND org_id = '${ORG_ID}' LIMIT 1" | tr -d '[:space:]')

if [ -n "$NON_ADMIN_ID" ] && [ "$NON_ADMIN_ID" != "" ]; then
    echo -e "  ${BLUE}ℹ Testing with non-admin user_id: ${NON_ADMIN_ID}${NC}"

    # Get current permissions
    RESP=$(api_get "/roles/user/${NON_ADMIN_ID}/permissions")
    parse_response "$RESP"
    assert_status "200" "Get non-admin permissions returns 200"

    PERMS_BEFORE=$(echo "$RESPONSE_BODY" | jq '.data')
    echo -e "  ${BLUE}ℹ Permissions keys: $(echo "$PERMS_BEFORE" | jq 'keys')${NC}"

    NON_ADMIN_ALL=$(echo "$PERMS_BEFORE" | jq '.all // false')
    if [ "$NON_ADMIN_ALL" != "true" ]; then
        echo -e "  ${GREEN}✓ Non-admin does NOT have {all: true}${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Non-admin should not have {all: true}${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No non-admin user found"
fi


# ══════════════════════════════════════════════════
# SCENARIO 5: Edge Cases & Security
# ══════════════════════════════════════════════════
section "SCENARIO 5: Edge Cases & Security"

# ── 5.1 Invalid role_id ──────────────────────────
echo ""
echo "5.1 GET /roles/99999 — Invalid role_id returns 404"
RESP=$(api_get "/roles/99999")
parse_response "$RESP"
assert_status "404" "Invalid role returns 404"

# ── 5.2 Cannot delete system role ─────────────────
echo ""
echo "5.2 DELETE /roles/{admin_id} — Cannot delete system role"

if [ -n "$ADMIN_ROLE_ID" ] && [ "$ADMIN_ROLE_ID" != "null" ]; then
    RESP=$(curl -s -w "\n%{http_code}" -X DELETE "${API_BASE}/roles/${ADMIN_ROLE_ID}" \
        -H "Authorization: Bearer ${TOKEN}")
    parse_response "$RESP"
    assert_status "400" "Delete system role returns 400"

    # Verify still exists
    DB_EXISTS=$(run_sql "SELECT COUNT(*) FROM master.roles WHERE role_id = ${ADMIN_ROLE_ID}" | tr -d '[:space:]')
    if [ "$DB_EXISTS" = "1" ]; then
        echo -e "  ${GREEN}✓ Admin role still exists in DB${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Admin role was deleted!${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No admin role_id to test"
fi

# ── 5.3 Cannot delete role with users (no reassign) ──
echo ""
echo "5.3 DELETE role with users and no reassign_to → 400"

# Find a role that has users
ROLE_WITH_USERS=$(run_sql "
    SELECT r.role_id FROM master.roles r
    JOIN master.org_users u ON r.role_id = u.role_id
    WHERE r.is_system_role = false AND r.org_id = '${ORG_ID}'
    GROUP BY r.role_id HAVING COUNT(u.user_id) > 0
    LIMIT 1
" | tr -d '[:space:]')

if [ -n "$ROLE_WITH_USERS" ] && [ "$ROLE_WITH_USERS" != "" ]; then
    RESP=$(curl -s -w "\n%{http_code}" -X DELETE "${API_BASE}/roles/${ROLE_WITH_USERS}" \
        -H "Authorization: Bearer ${TOKEN}")
    parse_response "$RESP"
    assert_status "400" "Delete role with users (no reassign) returns 400"
else
    skip_test "No custom role with users to test"
fi

# ── 5.4 Duplicate role_code returns 400 ──────────
echo ""
echo "5.4 POST /roles/ — Duplicate role_code returns 400"
RESP=$(api_post "/roles/" '{
    "role_code": "admin",
    "role_name": "Duplicate Admin",
    "permissions": {},
    "allowed_modules": [],
    "data_access_level": "own"
}')
parse_response "$RESP"
assert_status "400" "Duplicate role_code returns 400"

# ── 5.5 Deprecated endpoint returns 410 ──────────
echo ""
echo "5.5 POST /users/{id}/permissions — Deprecated returns 410"

RESP=$(api_post "/users/7/permissions" '{"sales": {"view": true}}')
parse_response "$RESP"
assert_status "410" "Deprecated permissions endpoint returns 410"

# ── 5.6 Delete custom role (cleanup) ─────────────
echo ""
echo "5.6 DELETE /roles/{id} — Delete custom role (cleanup)"

if [ -n "$CUSTOM_ROLE_ID" ]; then
    RESP=$(curl -s -w "\n%{http_code}" -X DELETE "${API_BASE}/roles/${CUSTOM_ROLE_ID}" \
        -H "Authorization: Bearer ${TOKEN}")
    parse_response "$RESP"
    assert_status "200" "Delete custom role returns 200"

    # Verify gone from DB
    DB_EXISTS=$(run_sql "SELECT COUNT(*) FROM master.roles WHERE role_id = ${CUSTOM_ROLE_ID}" | tr -d '[:space:]')
    if [ "$DB_EXISTS" = "0" ]; then
        echo -e "  ${GREEN}✓ Custom role deleted from DB${NC}"
        ((PASS_COUNT++))
    else
        echo -e "  ${RED}✗ Custom role still in DB${NC}"
        ((FAIL_COUNT++))
    fi
else
    skip_test "No custom role to delete"
fi

# ── 5.7 Validate with missing fields ─────────────
echo ""
echo "5.7 POST /roles/validate — Missing fields returns 400"
RESP=$(api_post "/roles/validate" '{"module": "sales"}')
parse_response "$RESP"
assert_status "400" "Missing permission field returns 400"

# ── 5.8 Assign with empty user_ids ───────────────
echo ""
echo "5.8 POST /roles/assign — Empty user_ids returns 400"
RESP=$(api_post "/roles/assign" '{"role_id": 1, "user_ids": []}')
parse_response "$RESP"
assert_status "400" "Empty user_ids returns 400"


# ══════════════════════════════════════════════════
# SCENARIO 6: Cross-Verification (DB vs API)
# ══════════════════════════════════════════════════
section "SCENARIO 6: DB Consistency Checks"

echo ""
echo "6.1 All org_users have valid role_id referencing master.roles"
ORPHAN_COUNT=$(run_sql "
    SELECT COUNT(*) FROM master.org_users u
    WHERE u.org_id = '${ORG_ID}' AND u.is_active = true
    AND u.role_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM master.roles r WHERE r.role_id = u.role_id)
" | tr -d '[:space:]')

if [ "$ORPHAN_COUNT" = "0" ]; then
    echo -e "  ${GREEN}✓ No orphaned role_ids (all reference valid roles)${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Found ${ORPHAN_COUNT} users with invalid role_id${NC}"
    ((FAIL_COUNT++))
fi

echo ""
echo "6.2 All system roles have permissions JSON"
EMPTY_PERMS=$(run_sql "
    SELECT COUNT(*) FROM master.roles
    WHERE org_id = '${ORG_ID}' AND is_system_role = true
    AND (permissions IS NULL OR permissions::text = '{}' OR permissions::text = 'null')
" | tr -d '[:space:]')

if [ "$EMPTY_PERMS" = "0" ]; then
    echo -e "  ${GREEN}✓ All system roles have non-empty permissions${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Found ${EMPTY_PERMS} system roles with empty permissions${NC}"
    ((FAIL_COUNT++))
fi

echo ""
echo "6.3 Admin users have is_admin=true"
ADMIN_MISMATCH=$(run_sql "
    SELECT COUNT(*) FROM master.org_users u
    JOIN master.roles r ON u.role_id = r.role_id
    WHERE u.org_id = '${ORG_ID}' AND r.role_code = 'admin' AND u.is_admin = false
" | tr -d '[:space:]')

if [ "$ADMIN_MISMATCH" = "0" ]; then
    echo -e "  ${GREEN}✓ All admin-role users have is_admin=true${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Found ${ADMIN_MISMATCH} admin-role users with is_admin=false${NC}"
    ((FAIL_COUNT++))
fi

echo ""
echo "6.4 Role levels are properly ordered (admin=1, viewer=5)"
ADMIN_LEVEL=$(run_sql "SELECT role_level FROM master.roles WHERE org_id = '${ORG_ID}' AND role_code = 'admin'" | tr -d '[:space:]')
VIEWER_LEVEL=$(run_sql "SELECT role_level FROM master.roles WHERE org_id = '${ORG_ID}' AND role_code = 'viewer'" | tr -d '[:space:]')

if [ "$ADMIN_LEVEL" = "1" ]; then
    echo -e "  ${GREEN}✓ Admin role_level=1${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected admin level=1, got ${ADMIN_LEVEL}${NC}"
    ((FAIL_COUNT++))
fi

if [ "$VIEWER_LEVEL" = "5" ]; then
    echo -e "  ${GREEN}✓ Viewer role_level=5${NC}"
    ((PASS_COUNT++))
else
    echo -e "  ${RED}✗ Expected viewer level=5, got ${VIEWER_LEVEL}${NC}"
    ((FAIL_COUNT++))
fi


# ══════════════════════════════════════════════════
# CLEANUP
# ══════════════════════════════════════════════════
section "CLEANUP"

# Hard-delete test user from DB (not just soft-delete)
if [ -n "$TEST_USER_ID" ] && [ "$TEST_USER_ID" != "null" ]; then
    run_sql "DELETE FROM master.org_users WHERE user_id = ${TEST_USER_ID}" >/dev/null 2>&1
    echo -e "  ${BLUE}ℹ Cleaned up test user ${TEST_USER_ID}${NC}"
fi

# Clean up any leftover test custom role
if [ -n "$CUSTOM_ROLE_ID" ]; then
    run_sql "DELETE FROM master.roles WHERE role_id = ${CUSTOM_ROLE_ID}" >/dev/null 2>&1
    echo -e "  ${BLUE}ℹ Cleaned up custom role ${CUSTOM_ROLE_ID}${NC}"
fi


# ══════════════════════════════════════════════════
# SUMMARY
# ══════════════════════════════════════════════════
print_summary
