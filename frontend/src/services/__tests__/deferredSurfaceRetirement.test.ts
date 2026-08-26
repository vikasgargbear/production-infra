import fs from 'fs';
import path from 'path';


const srcRoot = path.resolve(__dirname, '../..');
const read = (relativePath: string): string =>
  fs.readFileSync(path.join(srcRoot, relativePath), 'utf8');


describe('deferred production surfaces', () => {
  test('payroll and loyalty modules are absent from the production API boundary', () => {
    const apiIndex = read('services/api/index.ts');

    expect(apiIndex).not.toMatch(/modules\/payroll/);
    expect(apiIndex).not.toContain('payroll:');
    expect(apiIndex).not.toContain('loyaltyPointsApi');
    expect(fs.existsSync(path.join(srcRoot, 'services/api/modules/payroll'))).toBe(false);
    expect(fs.existsSync(path.join(srcRoot, 'services/api/modules/sales/loyaltyPoints.api.ts'))).toBe(false);
  });

  test('payroll cannot be reached from the application shell or home actions', () => {
    const shell = `${read('App.tsx')}\n${read('components/Home.tsx')}`;

    expect(shell).not.toContain('PayrollHub');
    expect(shell).not.toMatch(/['"]payroll['"]/);
    expect(fs.existsSync(path.join(srcRoot, 'components/payroll'))).toBe(false);
  });

  test('fabricated prescription and loyalty navigation stays retired', () => {
    for (const deferredId of [
      'quick-prescription',
      "Today's Prescriptions",
      'drug-interaction',
      "id: 'loyalty'",
      'narcotic-register',
      'clinical-decision',
    ]) {
      expect(read('App.tsx')).not.toContain(deferredId);
    }
    expect(fs.existsSync(path.join(srcRoot, 'components/global/navigation/Sidebar.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(
      srcRoot, 'services/api/modules/compliance/compliance.api.ts',
    ))).toBe(false);
    expect(fs.existsSync(path.join(srcRoot, 'components/compliance/NarcoticRegister.tsx'))).toBe(false);
  });

  test('employee reads remain exported while unused department CRUD is retired', () => {
    const apiIndex = read('services/api/index.ts');

    expect(apiIndex).toContain('employeesApi');
    expect(apiIndex).not.toContain('departmentsApi');
    expect(fs.existsSync(path.join(srcRoot, 'services/api/modules/org/departments.api.ts'))).toBe(false);
  });

  test('legacy cache-first workers are retired and their caches are purged', () => {
    const appEntry = read('index.tsx');
    const workerTombstone = fs.readFileSync(
      path.resolve(srcRoot, '../public/service-worker.js'),
      'utf8',
    );

    expect(appEntry).toContain('registration.unregister()');
    expect(appEntry).toContain('window.caches.delete');
    expect(workerTombstone).toContain('self.registration.unregister()');
    expect(workerTombstone).toContain('caches.delete');
    expect(workerTombstone).not.toContain("addEventListener('fetch'");
    expect(workerTombstone).not.toContain('respondWith');
  });

  test('zero-consumer compatibility clients and unreachable shells stay retired', () => {
    [
      'components/global/pdf/GlobalPDFGenerator.ts',
      'components/master/utils/DataValidationEngine.tsx',
      'components/master/utils/BulkOperations.tsx',
      'services/api/modules/audit/audit.api.ts',
      'services/api/modules/auth/auth.api.ts',
      'services/api/modules/compliance/taxEntries.api.ts',
      'services/api/modules/inventory/conversions.api.ts',
      'services/api/modules/org/organizations.api.ts',
      'services/api/modules/purchase/supplierInvoices.api.ts',
      'services/api/modules/settings/setup.api.ts',
      'services/api/modules/settings/utils.api.ts',
    ].forEach(relativePath => {
      expect(fs.existsSync(path.join(srcRoot, relativePath))).toBe(false);
    });

    const apiIndex = read('services/api/index.ts');
    [
      'auditApi',
      'authApi',
      'taxEntriesApi',
      'conversionsApi',
      'organizationsApi',
      'supplierInvoicesApi',
      'setupApi',
      'utilsApi',
    ].forEach(retiredExport => expect(apiIndex).not.toContain(retiredExport));

    const masterHub = read('components/master/MasterHub.tsx');
    const masterUtils = read('components/master/utils/index.ts');
    expect(masterHub).not.toMatch(/DataValidationEngine|BulkOperations/);
    expect(masterUtils).not.toMatch(/DataValidationEngine|BulkOperations/);
  });

  test('retirement preserves canonical invoice PDF and cloud-session authority', () => {
    const invoicePdfPath = path.join(srcRoot, 'utils/invoicePdfGenerator.ts');
    expect(fs.existsSync(invoicePdfPath)).toBe(true);
    expect(read('components/sales/invoice/invoicelist/components/InvoiceTable.tsx'))
      .toContain('utils/invoicePdfGenerator');

    const authContext = read('contexts/AuthContext.tsx');
    const erpSession = read('services/auth/erpSessionStorage.ts');
    const apiClient = read('services/api/apiClient.ts');
    expect(authContext).toContain('saveErpSession');
    expect(erpSession).toContain('ERP_SESSION_KEYS');
    expect(apiClient).toContain('getErpAccessToken');
  });
});
