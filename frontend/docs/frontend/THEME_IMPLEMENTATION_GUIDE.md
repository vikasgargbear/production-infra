# Theme-Based Implementation Guide for New Fields

**Using Existing Theme:** `/src/config/theme.config.js`  
**Date:** 2025-08-08  
**Purpose:** Implement all missing fields using existing theme components

---

## ✅ YES - Your Theme is Perfect for All Fields!

Your existing theme configuration provides everything needed:
- **Input styles** with error/success states
- **Card components** for sections
- **Badge styles** for status indicators
- **Form helpers** for validation
- **Color palette** for compliance warnings

---

## 1. Customer Master Implementation

### Drug License Section (CRITICAL)
```jsx
import { theme, classes } from '../../config/theme.config';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const CustomerComplianceSection = () => {
  const [licenseStatus, setLicenseStatus] = useState('pending');
  
  return (
    <div className={`${theme.components.card.base} ${theme.components.card.padding.md} mb-6`}>
      {/* Section Header with Warning */}
      <div className={`flex items-center mb-4 pb-3 border-b ${
        licenseStatus === 'expired' ? 'border-red-200' : 'border-gray-200'
      }`}>
        <AlertTriangle className={`w-5 h-5 mr-2 ${
          licenseStatus === 'expired' ? 'text-red-600' : 'text-amber-600'
        }`} />
        <h3 className={classes.sectionTitle}>
          Regulatory Compliance
          <span className="text-red-500 ml-1">*</span>
        </h3>
        {/* Status Badge using theme */}
        <span className={`ml-auto ${
          licenseStatus === 'valid' 
            ? theme.components.badge.variants.success
            : licenseStatus === 'expired'
            ? theme.components.badge.variants.danger
            : theme.components.badge.variants.warning
        }`}>
          {licenseStatus === 'valid' && <CheckCircle className="w-3 h-3 mr-1" />}
          {licenseStatus === 'expired' && <XCircle className="w-3 h-3 mr-1" />}
          License {licenseStatus}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Drug License Number - Using theme input styles */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Drug License Number
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="text"
            className={`${theme.components.input.base} ${
              errors.drug_license 
                ? theme.components.input.states.error 
                : ''
            }`}
            placeholder="DL-MH-12345"
            value={formData.drug_license_number}
            onChange={(e) => handleLicenseChange(e.target.value)}
          />
          {errors.drug_license && (
            <p className={classes.formErrorText}>
              {errors.drug_license}
            </p>
          )}
        </div>

        {/* License Expiry Date */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            License Expiry Date
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="date"
            className={`${theme.components.input.base} ${
              isExpiringSoon ? theme.components.input.states.error : ''
            }`}
            value={formData.drug_license_validity}
            min={today}
            onChange={handleExpiryChange}
          />
          {isExpiringSoon && (
            <p className={classes.formErrorText}>
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              License expires in {daysToExpiry} days
            </p>
          )}
        </div>

        {/* FSSAI Number - Optional */}
        <div className={`${classes.formGroup} md:col-span-2`}>
          <label className={classes.formLabel}>
            FSSAI Number
            <span className={classes.smallText}> (optional)</span>
          </label>
          <input
            type="text"
            className={theme.components.input.base}
            placeholder="12345678901234"
            value={formData.fssai_number}
            onChange={(e) => setFormData({...formData, fssai_number: e.target.value})}
          />
          <p className={classes.formHelperText}>
            Required for food & nutrition products
          </p>
        </div>
      </div>
    </div>
  );
};
```

### Business Critical Fields
```jsx
const CustomerBusinessSection = () => {
  return (
    <div className={`${theme.components.card.base} ${theme.components.card.padding.md} mb-6`}>
      <h3 className={`${classes.sectionTitle} mb-4`}>Business Information</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Credit Rating - Using theme colors */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Credit Rating
            <span className="text-red-500 ml-1">*</span>
          </label>
          <select 
            className={theme.components.input.base}
            value={formData.credit_rating}
            onChange={handleCreditRatingChange}
          >
            <option value="A">A - Excellent (45 days)</option>
            <option value="B">B - Good (30 days)</option>
            <option value="C">C - Average (15 days)</option>
            <option value="D">D - Poor (Cash only)</option>
          </select>
          {/* Dynamic credit limit display */}
          <div className={`mt-2 p-2 rounded-lg ${
            formData.credit_rating === 'A' ? 'bg-green-50 border border-green-200' :
            formData.credit_rating === 'B' ? 'bg-blue-50 border border-blue-200' :
            formData.credit_rating === 'C' ? 'bg-amber-50 border border-amber-200' :
            'bg-red-50 border border-red-200'
          }`}>
            <p className={classes.smallText}>
              Credit Limit: ₹{calculateCreditLimit(formData.credit_rating)}
            </p>
          </div>
        </div>

        {/* WhatsApp Number */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            WhatsApp Number
          </label>
          <div className="relative">
            <input
              type="tel"
              className={theme.components.input.base}
              placeholder="+91-9876543210"
              value={formData.whatsapp_number}
              onChange={(e) => setFormData({...formData, whatsapp_number: e.target.value})}
            />
            <button
              type="button"
              onClick={() => setFormData({...formData, whatsapp_number: formData.primary_phone})}
              className={`absolute right-2 top-1/2 -translate-y-1/2 ${theme.components.button.variants.link} text-xs`}
            >
              Copy from primary
            </button>
          </div>
        </div>

        {/* Assigned Salesperson */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Assigned Salesperson
            <span className="text-red-500 ml-1">*</span>
          </label>
          <select 
            className={theme.components.input.base}
            value={formData.assigned_salesperson_id}
            required
          >
            <option value="">Select Salesperson</option>
            {salespersons.map(sp => (
              <option key={sp.id} value={sp.id}>
                {sp.name} - {sp.territory}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Communication Preferences - Using theme badge styles */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <label className={`${classes.formLabel} mb-3 block`}>
          Communication Preferences
        </label>
        <div className="flex flex-wrap gap-3">
          {['SMS', 'Email', 'WhatsApp'].map(channel => (
            <label
              key={channel}
              className={`${theme.components.badge.base} ${
                formData[`prefer_${channel.toLowerCase()}`]
                  ? theme.components.badge.variants.primary
                  : 'bg-gray-100 text-gray-600 border border-gray-300'
              } cursor-pointer transition-colors`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={formData[`prefer_${channel.toLowerCase()}`]}
                onChange={(e) => setFormData({
                  ...formData,
                  [`prefer_${channel.toLowerCase()}`]: e.target.checked
                })}
              />
              <span className="select-none">{channel}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

## 2. Product Master - Schedule Drug Implementation

```jsx
const ProductScheduleSection = () => {
  const [isNarcotic, setIsNarcotic] = useState(false);
  
  return (
    <div className={`${theme.components.card.base} ${theme.components.card.padding.md} mb-6
      ${isNarcotic ? 'border-2 border-red-500' : ''}`}>
      
      {/* Alert for Narcotic Drugs */}
      {isNarcotic && (
        <div className={`${classes.statusError} p-4 rounded-lg mb-4 border`}>
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-800">
                Narcotic/Psychotropic Substance
              </h4>
              <ul className={`${classes.smallText} mt-2 space-y-1 text-red-700`}>
                <li>• Prescription mandatory for every sale</li>
                <li>• Daily stock reconciliation required</li>
                <li>• Separate narcotic register maintenance</li>
                <li>• Regular inspection by authorities</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Drug Schedule */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Drug Schedule
            <span className="text-red-500 ml-1">*</span>
          </label>
          <select
            className={theme.components.input.base}
            value={formData.schedule_type}
            onChange={(e) => {
              const schedule = e.target.value;
              setFormData({
                ...formData,
                schedule_type: schedule,
                prescription_required: ['H', 'H1', 'X'].includes(schedule),
                is_narcotic: schedule === 'X'
              });
              setIsNarcotic(schedule === 'X');
            }}
          >
            <option value="">OTC (Over the Counter)</option>
            <option value="H">Schedule H</option>
            <option value="H1">Schedule H1</option>
            <option value="X">Schedule X (Narcotic)</option>
            <option value="G">Schedule G</option>
            <option value="J">Schedule J</option>
          </select>
        </div>

        {/* Prescription Required - Auto-set */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Prescription Required
          </label>
          <div className={`${theme.components.input.base} ${
            formData.prescription_required 
              ? 'bg-red-50 border-red-300' 
              : 'bg-gray-50'
          } flex items-center`}>
            <input
              type="checkbox"
              checked={formData.prescription_required}
              disabled={['H', 'H1', 'X'].includes(formData.schedule_type)}
              onChange={(e) => setFormData({
                ...formData,
                prescription_required: e.target.checked
              })}
              className="mr-2"
            />
            <span className={classes.bodyText}>
              {['H', 'H1', 'X'].includes(formData.schedule_type)
                ? 'Required by law'
                : formData.prescription_required
                ? 'Prescription needed'
                : 'No prescription needed'}
            </span>
          </div>
        </div>

        {/* Storage Condition */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Storage Condition
          </label>
          <select className={theme.components.input.base}>
            <option value="room_temp">Room Temperature (15-25°C)</option>
            <option value="cool">Cool (8-15°C)</option>
            <option value="refrigerated">Refrigerated (2-8°C)</option>
            <option value="frozen">Frozen (-20°C)</option>
          </select>
        </div>
      </div>
    </div>
  );
};
```

---

## 3. Supplier Master - Banking Details

```jsx
const SupplierBankingSection = () => {
  const [ifscValid, setIfscValid] = useState(true);
  
  return (
    <div className={`${theme.components.card.base} ${theme.components.card.padding.md} 
      ${classes.statusInfo} border-2`}>
      <h3 className={`${classes.sectionTitle} mb-4 text-blue-800`}>
        Banking Details (Required for Payments)
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bank Name */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Bank Name
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="text"
            className={theme.components.input.base}
            placeholder="State Bank of India"
            required
          />
        </div>

        {/* Account Number */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Account Number
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="text"
            className={theme.components.input.base}
            placeholder="XXXXXXXXXXXX"
            required
          />
        </div>

        {/* IFSC Code with validation */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            IFSC Code
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="text"
            className={`${theme.components.input.base} ${
              !ifscValid ? theme.components.input.states.error : ''
            }`}
            placeholder="SBIN0001234"
            pattern="^[A-Z]{4}0[A-Z0-9]{6}$"
            onChange={(e) => {
              const value = e.target.value.toUpperCase();
              setIfscValid(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value));
            }}
            required
          />
          {!ifscValid && (
            <p className={classes.formErrorText}>
              Invalid IFSC format (e.g., SBIN0001234)
            </p>
          )}
        </div>

        {/* Account Holder Name */}
        <div className={classes.formGroup}>
          <label className={classes.formLabel}>
            Account Holder Name
            <span className="text-red-500 ml-1">*</span>
          </label>
          <input
            type="text"
            className={theme.components.input.base}
            required
          />
        </div>
      </div>

      {/* Supplier Ratings using theme colors */}
      <div className="mt-6 pt-4 border-t border-blue-200">
        <h4 className={`${classes.formLabel} mb-3`}>Performance Ratings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {['Quality', 'Delivery', 'Compliance'].map(metric => (
            <div key={metric} className={classes.formGroup}>
              <label className={classes.smallText}>{metric} Rating</label>
              <div className="flex items-center gap-1 mt-1">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    className={`text-2xl ${
                      star <= formData[`${metric.toLowerCase()}_rating`]
                        ? 'text-amber-500'
                        : 'text-gray-300'
                    } hover:text-amber-400 transition-colors`}
                    onClick={() => setFormData({
                      ...formData,
                      [`${metric.toLowerCase()}_rating`]: star
                    })}
                  >
                    ★
                  </button>
                ))}
                <span className={`ml-2 ${classes.smallText}`}>
                  {formData[`${metric.toLowerCase()}_rating`] || 0}/5
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

---

## 4. Invoice - Narcotic Sale Modal

```jsx
const NarcoticPrescriptionModal = ({ product, onComplete, onCancel }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={`${theme.components.card.base} ${theme.components.card.shadow.xl} 
        max-w-2xl w-full max-h-[90vh] overflow-y-auto m-4`}>
        
        {/* Header with danger theme */}
        <div className={`${theme.components.card.padding.md} 
          bg-red-600 text-white rounded-t-xl`}>
          <h2 className="text-xl font-bold flex items-center">
            <AlertTriangle className="w-6 h-6 mr-2" />
            Controlled Substance - Prescription Required
          </h2>
          <p className={`${classes.smallText} text-red-100 mt-1`}>
            Schedule {product.schedule_type} Drug - All details mandatory by law
          </p>
        </div>

        <form className={theme.components.card.padding.md}>
          {/* Prescription Details Card */}
          <div className={`${theme.components.card.base} ${theme.components.card.padding.sm} 
            mb-4 border-2 border-red-200`}>
            <h3 className={`${classes.formLabel} mb-3 text-red-700`}>
              Prescription Information
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className={classes.formGroup}>
                <label className={classes.formLabel}>
                  Prescription Number *
                </label>
                <input
                  type="text"
                  className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}
                  placeholder="RX-12345"
                  required
                />
              </div>
              
              <div className={classes.formGroup}>
                <label className={classes.formLabel}>
                  Prescription Date *
                </label>
                <input
                  type="date"
                  className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}
                  max={today}
                  required
                />
              </div>
            </div>
          </div>

          {/* Doctor Details */}
          <div className={`${theme.components.card.base} ${theme.components.card.padding.sm} 
            mb-4`}>
            <h3 className={classes.formLabel}>Doctor Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}
                placeholder="Doctor Name *"
                required
              />
              <input
                type="text"
                className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}
                placeholder="Registration No. (MCI/12345/2020) *"
                pattern="^[A-Z]{2,4}\/\d{4,6}\/\d{4}$"
                required
              />
            </div>
          </div>

          {/* Patient Details */}
          <div className={`${theme.components.card.base} ${theme.components.card.padding.sm} 
            mb-4`}>
            <h3 className={classes.formLabel}>Patient Details</h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}
                placeholder="Patient Name *"
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}
                  placeholder="Age *"
                  min="1"
                  max="150"
                  required
                />
                <select className={`${theme.components.input.base} ${theme.components.input.sizes.sm}`}>
                  <option value="">Gender *</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
            </div>
            <textarea
              className={`${theme.components.input.base} ${theme.components.input.sizes.sm} mt-3`}
              placeholder="Patient Address *"
              rows="2"
              required
            />
          </div>

          {/* Action Buttons using theme */}
          <div className={`flex justify-end gap-3 pt-4 border-t ${theme.colors.gray[200]}`}>
            <button
              type="button"
              onClick={onCancel}
              className={`${theme.components.button.base} ${theme.components.button.sizes.md} 
                ${theme.components.button.variants.secondary}`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${theme.components.button.base} ${theme.components.button.sizes.md} 
                ${theme.components.button.variants.danger}`}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Verify & Dispense
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
```

---

## 5. Compliance Dashboard Widget

```jsx
const ComplianceDashboard = () => {
  return (
    <div className={`${theme.components.card.base} ${theme.components.card.shadow.md} 
      ${theme.components.card.padding.md}`}>
      
      <h3 className={`${classes.sectionTitle} mb-4`}>
        Compliance Status
      </h3>

      {/* License Expiry Alerts */}
      <div className="space-y-3">
        {expiringLicenses.map(license => {
          const daysLeft = getDaysToExpiry(license.expiry_date);
          const urgency = daysLeft <= 7 ? 'danger' : daysLeft <= 30 ? 'warning' : 'success';
          
          return (
            <div
              key={license.id}
              className={`p-3 rounded-lg border ${
                urgency === 'danger' ? classes.statusError :
                urgency === 'warning' ? classes.statusWarning :
                classes.statusSuccess
              }`}
            >
              <div className={classes.flexBetween}>
                <div>
                  <p className={`font-medium ${
                    urgency === 'danger' ? 'text-red-800' :
                    urgency === 'warning' ? 'text-amber-800' :
                    'text-green-800'
                  }`}>
                    {license.name}
                  </p>
                  <p className={classes.smallText}>
                    License: {license.number}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`${theme.components.badge.base} ${
                    theme.components.badge.variants[urgency]
                  }`}>
                    {daysLeft <= 0 ? 'EXPIRED' : `${daysLeft} days`}
                  </span>
                  <p className={`${classes.smallText} mt-1`}>
                    {formatDate(license.expiry_date)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Stats using theme colors */}
      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t">
        <div className="text-center">
          <p className={`text-2xl font-bold ${theme.colors.danger.DEFAULT}`}>
            {stats.expired}
          </p>
          <p className={classes.smallText}>Expired</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${theme.colors.warning.DEFAULT}`}>
            {stats.expiring}
          </p>
          <p className={classes.smallText}>Expiring Soon</p>
        </div>
        <div className="text-center">
          <p className={`text-2xl font-bold ${theme.colors.secondary.DEFAULT}`}>
            {stats.valid}
          </p>
          <p className={classes.smallText}>Valid</p>
        </div>
      </div>
    </div>
  );
};
```

---

## 6. Form Validation Using Theme

```jsx
// Validation wrapper using theme styles
const FormField = ({ label, required, error, children, helper }) => {
  return (
    <div className={classes.formGroup}>
      <label className={classes.formLabel}>
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className={classes.formErrorText}>
          <XCircle className="w-3 h-3 inline mr-1" />
          {error}
        </p>
      )}
      {!error && helper && (
        <p className={classes.formHelperText}>{helper}</p>
      )}
    </div>
  );
};

// Usage
<FormField
  label="Drug License Number"
  required
  error={errors.drug_license}
  helper="Format: DL-XX-12345"
>
  <input
    type="text"
    className={`${theme.components.input.base} ${
      errors.drug_license ? theme.components.input.states.error : ''
    }`}
    value={formData.drug_license_number}
    onChange={handleChange}
  />
</FormField>
```

---

## 7. Status Indicators Using Theme

```jsx
// License Status Component
const LicenseStatusIndicator = ({ status, expiryDate }) => {
  const daysLeft = getDaysToExpiry(expiryDate);
  
  const getStatusConfig = () => {
    if (status === 'expired' || daysLeft <= 0) {
      return {
        color: theme.colors.danger,
        bg: classes.statusError,
        icon: XCircle,
        text: 'Expired'
      };
    }
    if (daysLeft <= 7) {
      return {
        color: theme.colors.danger,
        bg: classes.statusError,
        icon: AlertTriangle,
        text: `${daysLeft} days`
      };
    }
    if (daysLeft <= 30) {
      return {
        color: theme.colors.warning,
        bg: classes.statusWarning,
        icon: AlertCircle,
        text: `${daysLeft} days`
      };
    }
    return {
      color: theme.colors.secondary,
      bg: classes.statusSuccess,
      icon: CheckCircle,
      text: 'Valid'
    };
  };
  
  const config = getStatusConfig();
  const Icon = config.icon;
  
  return (
    <div className={`${config.bg} px-3 py-1.5 rounded-lg border inline-flex items-center`}>
      <Icon className="w-4 h-4 mr-1.5" />
      <span className="font-medium text-sm">{config.text}</span>
    </div>
  );
};
```

---

## Summary: Theme Compatibility ✅

Your existing theme provides:

1. **All Input Styles Needed**
   - Base styles ✅
   - Error states ✅
   - Success states ✅
   - Disabled states ✅

2. **Card Components for Sections**
   - Base card styles ✅
   - Different padding sizes ✅
   - Shadow variants ✅

3. **Status & Alert Styles**
   - Success/Error/Warning/Info classes ✅
   - Badge variants ✅
   - Color palette for urgency ✅

4. **Button Variants**
   - Primary/Secondary/Danger ✅
   - Different sizes ✅
   - Ghost/Link styles ✅

5. **Typography Classes**
   - Form labels ✅
   - Helper text ✅
   - Error text ✅
   - Section titles ✅

**NO NEW THEME COMPONENTS NEEDED! Your theme handles everything perfectly.**

---

## Implementation Priority

### Week 1: Critical Fields
```javascript
const criticalFields = {
  customer: ['drug_license_number', 'drug_license_validity', 'whatsapp_number'],
  supplier: ['drug_license_number', 'bank_details'],
  product: ['schedule_type', 'is_narcotic'],
  invoice: ['place_of_supply', 'narcotic_records']
};
```

### Week 2: Business Fields
```javascript
const businessFields = {
  customer: ['credit_rating', 'assigned_salesperson_id', 'territory_id'],
  supplier: ['quality_rating', 'delivery_rating'],
  batch: ['manufacturing_date', 'qc_status'],
  payment: ['clearance_date', 'clearance_status']
};
```

### Week 3-4: Enhancement Fields
```javascript
const enhancementFields = {
  customer: ['loyalty_tier', 'kyc_status', 'communication_preferences'],
  supplier: ['compliance_rating', 'brand_authorizations'],
  product: ['storage_condition', 'therapeutic_class'],
  all: ['internal_notes', 'analytics_fields']
};
```

---

*Your theme is production-ready for all new fields. No theme modifications needed!*