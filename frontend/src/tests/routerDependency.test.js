const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const SOURCE_ROOT = path.join(FRONTEND_ROOT, 'src');

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
}

test('unused React Router dependency is not reintroduced', () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(FRONTEND_ROOT, 'package.json'), 'utf8')
  );
  const packageName = ['react', 'router', 'dom'].join('-');

  expect(packageJson.dependencies?.[packageName]).toBeUndefined();
  expect(packageJson.devDependencies?.[packageName]).toBeUndefined();
});

test('custom tab navigation does not acquire an undeclared router import', () => {
  const routerImport = /(?:from\s+|require\s*\()['"]react-router(?:-dom)?['"]/;
  const offenders = sourceFiles(SOURCE_ROOT)
    .filter((filePath) => filePath !== __filename)
    .filter((filePath) => routerImport.test(fs.readFileSync(filePath, 'utf8')))
    .map((filePath) => path.relative(FRONTEND_ROOT, filePath));

  expect(offenders).toEqual([]);
});
