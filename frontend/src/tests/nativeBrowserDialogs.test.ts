import fs from 'fs';
import path from 'path';

const sourceRoot = path.resolve(process.cwd(), 'src');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const testFilePattern = /(?:^|\/)(?:__tests__\/|[^/]+\.(?:test|spec)\.[^/]+$)/;
const nativeDialogPattern = /(?:\bwindow\s*\.\s*)?\b(?:alert|confirm)\s*\(/;

const listSourceFiles = (directory: string): string[] => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(candidate);
    return sourceExtensions.has(path.extname(entry.name)) ? [candidate] : [];
  });

test('production frontend source never invokes native alert or confirm dialogs', () => {
  const violations = listSourceFiles(sourceRoot)
    .filter(file => !testFilePattern.test(file.split(path.sep).join('/')))
    .filter(file => nativeDialogPattern.test(fs.readFileSync(file, 'utf8')))
    .map(file => path.relative(sourceRoot, file));

  expect(violations).toEqual([]);
});
