# 🧪 Testing Documentation

## Overview
Comprehensive testing documentation for all modules in the Pharma ERP system.

## 📂 Test Suites by Module

### 1. [Sales Invoice](./sales-invoice/)
Complete testing suite for Sales Invoice creation flow
- Status: 📝 Documented, 🔧 In Development
- Test Cases: 15
- Coverage: Frontend, Backend, Database, Triggers

### 2. Sales Order (Coming Soon)
- Status: 📅 Planned
- Test Cases: TBD

### 3. Delivery Challan (Coming Soon)
- Status: 📅 Planned
- Test Cases: TBD

### 4. Inventory Management (Coming Soon)
- Status: 📅 Planned
- Test Cases: TBD

### 5. Customer Management (Coming Soon)
- Status: 📅 Planned
- Test Cases: TBD

---

## 🎯 Testing Standards

### Test Case Format
All test cases follow the Given-When-Then format:
```
GIVEN [initial context]
WHEN [action performed]
THEN [expected outcome]
```

### Test Categories
1. **Unit Tests** - Individual functions/methods
2. **Integration Tests** - API endpoints
3. **E2E Tests** - Complete user flows
4. **Database Tests** - Data integrity, triggers
5. **Performance Tests** - Load and response times

### Test Environments
- **Local** - Developer machines
- **Staging** - Railway staging environment
- **Production** - Railway production (read-only tests)

---

## 📊 Test Coverage Matrix

| Module | Frontend | Backend | Database | Triggers | E2E |
|--------|----------|---------|----------|----------|-----|
| Sales Invoice | 🟡 Partial | 🟡 Partial | 🟢 Good | 🟢 Good | 🔴 Issues |
| Sales Order | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None |
| Challan | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None |
| Inventory | 🔴 None | 🔴 None | 🔴 None | 🔴 None | 🔴 None |

**Legend:**
- 🟢 Good (>80% coverage)
- 🟡 Partial (40-80% coverage)
- 🔴 None/Issues (<40% coverage)

---

## 🔧 Testing Tools

### Frontend Testing
- Browser DevTools Console
- Network Tab for API monitoring
- React Developer Tools

### Backend Testing
```bash
# Direct API testing
curl -X POST [endpoint] -d '{...}'

# Railway logs
railway logs --service pharma-backend

# Python test scripts
python test_[module].py
```

### Database Testing
```sql
-- Verification queries
SELECT * FROM [table] WHERE created_at > NOW() - INTERVAL '1 minute';

-- Trigger verification
SELECT trigger_name FROM information_schema.triggers WHERE event_object_schema = 'sales';
```

---

## 📝 Test Execution Checklist

### Before Testing
- [ ] Clear browser cache
- [ ] Check Railway deployment status
- [ ] Verify database connectivity
- [ ] Enable console logging

### During Testing
- [ ] Document all errors with screenshots
- [ ] Note exact steps to reproduce
- [ ] Check browser console for errors
- [ ] Monitor network requests

### After Testing
- [ ] Update test results in documentation
- [ ] Create Linear tickets for bugs
- [ ] Update status matrix
- [ ] Commit test artifacts

---

## 🐛 Bug Reporting Template

```markdown
### Bug Title
[Clear, concise description]

### Environment
- Module: [e.g., Sales Invoice]
- Environment: [Local/Staging/Production]
- Browser: [Chrome/Firefox/Safari]
- Date/Time: [When occurred]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [...]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happened]

### Screenshots/Logs
[Attach any relevant screenshots or error logs]

### Additional Context
[Any other relevant information]
```

---

## 📈 Testing Metrics

### Current Sprint
- **Total Test Cases:** 15
- **Automated:** 0
- **Manual:** 15
- **Pass Rate:** ~40%
- **Critical Issues:** 3

### Goals
- Achieve 80% pass rate for Sales Invoice
- Automate 50% of test cases
- Document all remaining modules
- Zero critical issues in production

---

## 🔗 Quick Links

- [Sales Invoice Test Suite](./sales-invoice/)
- [API Documentation](/docs/api/)
- [Database Schema](/database/schema-docs/)
- [Bug Tracker (Linear)](https://linear.app/)

---

**Last Updated:** August 4, 2024
**Maintained By:** Development Team
**Next Review:** End of Sprint