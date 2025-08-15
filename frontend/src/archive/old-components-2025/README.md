# Old Components Archive - 2025

## Components Moved to Archive

This folder contains components that were moved to archive to prevent confusion and maintain clean codebase:

### Files Archived:

1. **EnhancedLogin.original.js** - Original version of login component
2. **SalesEntryModalV2.js** - Old version using deprecated `productsApi`
3. **ProductManagementV2.js** - Old version using deprecated `productsApi`
4. **CustomerManagementV2.js** - Old version using deprecated APIs
5. **SettingsManagementV2.js** - Old version with outdated patterns
6. **DashboardV2.js** - Old version using deprecated APIs
7. **ReportsManagementV2.js** - Old version using deprecated `productsApi`
8. **SalesEntryPage.js** - Old page wrapper for SalesEntryModalV2
9. **DeliveryChallanPage.js** - Old page wrapper component
10. **DeliveryChallanPageV2.js** - Old delivery challan page

### Reason for Archival:

These components were using old API patterns and imports that have been replaced with:
- `productAPI` instead of `productsApi`
- Global components from `/components/global/`
- Modern TypeScript interfaces
- Enterprise-grade validation patterns

### Current Active Components:

- Use `/components/global/` for shared components
- Import `productAPI, customerAPI, etc.` from `/services/api/`
- Follow the enterprise component structure established

### Date Archived: 
August 15, 2025

### Notes:
- These components are kept for reference only
- Do not import or use these archived components
- Refer to active components in `/components/` directory