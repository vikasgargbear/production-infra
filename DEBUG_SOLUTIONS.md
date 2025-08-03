# Debug Solutions Document

## API Consolidation - COMPLETED ✅
**All v1/v2 version references have been removed!**

### Current Status:
All endpoints now use simple `/api/*` prefix without version numbers:
- `/api/customers/` - Customer management
- `/api/products/` - Products management  
- `/api/orders/` - Order management
- `/api/inventory/` - Inventory management
- `/api/sales/` - Sales management
- `/api/purchases/` - Purchase management
- `/api/suppliers/` - Supplier management
- `/api/pg/*` - PostgreSQL function wrappers

### What Was Changed:

#### Backend (production-infra/backend/app/main.py):
- Removed `api_v1 = APIRouter(prefix="/api/v1")` 
- Removed `api_v2 = APIRouter(prefix="/api/v2")`
- Replaced with single `api = APIRouter(prefix="/api")`
- All routes now under `/api/` without version numbers

#### Frontend (production-infra/frontend/src/):
- `services/api/apiClientExports.js`: baseURL changed to `/api`
- `services/api/apiClient.ts`: baseURL changed to `/api`
- `config/api.config.ts`: API_VERSION set to `/api`
- `config/purchase.config.js`: All endpoints updated to `/api/`
- `services/api/partyLedgerApi.js`: BASE_URL changed to `/api/party-ledger`
- `services/invoiceApiService.js`: Updated to use `/api/`

### Next Steps:
1. Deploy backend changes to Railway
2. Test all endpoints work correctly
3. No more v1/v2 confusion!

## Customer Search Solution Pattern
**Working Solution**: Successfully implemented in `apiClientExports.js`

### Key Pattern:
```javascript
export const customerAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/customers/', {
      params: {
        search: query,
        customer_type: options.customerType,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    // Wrap response to match expected format
    return {
      success: true,
      data: response.data.customers || [],
      total: response.data.total,
      page: response.data.page,
      per_page: response.data.per_page
    };
  }
}
```

### Apply to Other Components:
1. **Product Search**: Use same pattern with `/api/v2/products/search`
2. **Supplier Search**: Use `/api/v2/pg/suppliers/search`
3. **Batch Search**: Use inventory endpoints

## Common Issues & Fixes

### 1. API Version Mismatch
- **Issue**: Frontend using `/api/v1/` but backend deployed with `/api/v2/`
- **Fix**: Update API_CONFIG or use version detection

### 2. Trailing Slash Issues
- **Issue**: FastAPI requires trailing slash for some endpoints
- **Fix**: Always include trailing slash for POST endpoints

### 3. Authentication Token
- **Current Token**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6InZpa2FzIiwiZXhwIjoxNzY5MzMxODc5fQ.aGNDXy0-v9B5KSsJ55YUx6A_Nrg5JiMEH0ER9Lp_1tc`
- **User**: vikas
- **Expiry**: Check and refresh if needed

### 4. Pack Configuration Structure
```javascript
pack_config: {
  base_uom: "Tablet",
  pack_size: 10,
  pack_unit: "Box", 
  box_size: 10
}
```

## Testing Checklist
- [x] Product Creation (Mock implementation working)
- [x] Product Search ✓ (Working with v2 endpoint)
- [ ] Batch Creation (Requires integer IDs, not string)
- [ ] Batch Picking
- [ ] Supplier Creation (POST endpoint not found)
- [ ] Purchase Add (POST endpoint not found)
- [x] Customer Creation ✓
- [x] Customer Search ✓

## Working Endpoints (Confirmed)
- GET `/api/v2/customers/` - Customer search ✓
- GET `/api/v2/products/search` - Product search ✓
- POST `/api/v2/customers/` - Customer creation ✓

## Missing/Not Deployed Endpoints
- POST `/api/v1/products/` - Product creation
- POST `/api/v2/pg/suppliers` - Supplier creation
- POST `/api/v2/purchases` - Purchase order creation

## Known Issues
1. **Product/Batch IDs**: Backend expects integer IDs, not strings
2. **Supplier POST**: Endpoint returns 404 despite being in code
3. **Purchase POST**: Endpoint returns 404

## Railway Deployment Commands
```bash
# Check logs
railway logs

# Deploy backend
cd pharma-backend
git add .
git commit -m "Fix message"
git push origin main
# Railway auto-deploys from GitHub

# Check deployment status
railway status
```

## Quick Test Scripts
Located in `/frontend/`:
- `test-product-api.js` - Test product creation
- `test-api-endpoints.js` - Test various endpoints
- `verify-customer-search.js` - Test customer search