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
});
