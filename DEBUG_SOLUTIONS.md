# Debug Solutions Document

## Product Creation Issue
**Problem**: Product creation failing with 404 error
**Root Cause**: Backend `/api/v1/products/` POST endpoint not deployed to Railway

### Solution Approaches:
1. **Backend Fix** (Requires deployment):
   - The endpoint exists in code at `/api/routers/products.py`
   - Router is included in main.py line 199
   - Need to push and redeploy backend

2. **Frontend Workaround**:
   - Use alternative endpoints if available
   - Create products through batch upload
   - Use direct database operations

### API Endpoint Mapping:
- **Deployed Endpoints** (from OpenAPI spec):
  - GET `/api/v2/products/search` - Product search
  - GET `/api/v2/products/{product_id}` - Get product details
  - No POST endpoint for product creation currently

- **Expected Endpoints** (in code):
  - POST `/api/v1/products/` - Create product
  - PUT `/api/v1/products/{product_id}` - Update product
  - DELETE `/api/v1/products/{product_id}` - Delete product

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