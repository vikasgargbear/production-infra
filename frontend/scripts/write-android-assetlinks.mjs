import fs from 'node:fs';
import path from 'node:path';

const fingerprints = (process.env.AASOPHARMA_ANDROID_SHA256 || '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);

if (
    fingerprints.length === 0 ||
    fingerprints.some(value => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value))
) {
    console.error(
        'Set AASOPHARMA_ANDROID_SHA256 to one or more comma-separated signing certificate SHA-256 fingerprints.',
    );
    process.exit(1);
}

const assetLinks = [
    {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: 'com.aasopharma.erp',
            sha256_cert_fingerprints: [...new Set(fingerprints)].sort(),
        },
    },
];

const outputPath = path.join(
    process.cwd(),
    'public',
    '.well-known',
    'assetlinks.json',
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(assetLinks, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
