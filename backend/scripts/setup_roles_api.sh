#!/bin/bash

# Setup Roles via API
# This script calls the role management API to setup default roles

API_URL="${API_URL:-https://production-infra-production.up.railway.app}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

echo "🚀 Role Setup via API"
echo "================================"
echo "API URL: $API_URL"
echo ""

# Function to setup roles
setup_roles() {
    echo "Setting up default roles..."
    
    response=$(curl -s -X POST \
        "$API_URL/api/roles/setup-defaults" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    
    if echo "$response" | grep -q '"success":true'; then
        echo "✅ Roles setup completed successfully!"
        echo "$response" | python -m json.tool 2>/dev/null || echo "$response"
    else
        echo "❌ Failed to setup roles"
        echo "$response"
    fi
}

# Function to list roles
list_roles() {
    echo "Fetching current roles..."
    
    response=$(curl -s -X GET \
        "$API_URL/api/roles" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    
    if echo "$response" | grep -q '"success":true'; then
        echo "✅ Roles fetched successfully!"
        echo "$response" | python -m json.tool 2>/dev/null || echo "$response"
    else
        echo "❌ Failed to fetch roles"
        echo "$response"
    fi
}

# Check if token is provided
if [ -z "$AUTH_TOKEN" ]; then
    echo "⚠️  Warning: No AUTH_TOKEN provided. You need to login first."
    echo ""
    echo "To get a token:"
    echo "1. Login via the frontend application"
    echo "2. Open browser developer tools (F12)"
    echo "3. Go to Application/Storage -> Local Storage"
    echo "4. Copy the 'token' value"
    echo "5. Run: export AUTH_TOKEN='your-token-here'"
    echo ""
    exit 1
fi

# Main menu
case "${1:-setup}" in
    setup)
        setup_roles
        ;;
    list)
        list_roles
        ;;
    *)
        echo "Usage: $0 [setup|list]"
        echo "  setup - Setup default roles"
        echo "  list  - List current roles"
        exit 1
        ;;
esac