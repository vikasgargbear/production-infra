import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, '..');

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: frontendRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().toLowerCase();
  } catch {
    return '';
  }
}

const gitCommit = (
  process.env.RENDER_GIT_COMMIT
  || process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.GITHUB_SHA
  || gitHead()
).trim().toLowerCase();

if (!SHA.test(gitCommit)) {
  throw new Error('A full Git commit SHA is required to publish frontend build metadata.');
}

const outputPath = resolve(frontendRoot, 'build', 'build-metadata.json');
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify({ schema_version: '1.0.0', service: 'aasopharma-erp', git_commit: gitCommit })}\n`,
  { encoding: 'utf8', mode: 0o644 },
);
