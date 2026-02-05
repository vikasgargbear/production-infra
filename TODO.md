# Product Roadmap & TODO

## High Priority

### PDF Template System
**Status:** TODO  
**Added:** 2026-02-04

Implement multi-format PDF template selection for invoices, credit notes, and other documents.

**Approach:**
1. **Short-term:** Create React template components (Classic, Compact, Thermal)
2. **Long-term:** Server-side WeasyPrint with template selection from org settings

**Requirements:**
- [ ] Template selector in organization settings
- [ ] Classic A4 format (current)
- [ ] Compact format (less whitespace)
- [ ] Thermal receipt format (58mm/80mm)
- [ ] Backend WeasyPrint integration for native vector PDF
- [ ] Template preview before selection

**Why needed:** Current html2pdf.js produces rasterized text. WeasyPrint generates native vector PDFs with crisp text.

---

## Medium Priority

### Offline-First Enhancements
- [ ] Background sync queue management UI
- [ ] Conflict resolution improvements
- [ ] Offline data age indicators

### Reporting & Analytics
- [ ] Custom report builder
- [ ] Dashboard widgets customization
- [ ] Export to Excel with formatting

---

## Low Priority / Future

### UI/UX Improvements
- [ ] Dark mode support
- [ ] Keyboard shortcuts guide
- [ ] Bulk operations for lists

### Performance
- [ ] Lazy loading for large lists
- [ ] Image compression on upload
- [ ] Query optimization monitoring

---

## Completed
- [x] Restock indicators on return reasons (2026-02-04)
- [x] Test validation APIs for returns (2026-02-04)
- [x] Return reason label display fix (2026-02-04)
