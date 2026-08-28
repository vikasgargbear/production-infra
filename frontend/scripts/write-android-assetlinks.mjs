import fs from 'node:fs';
import path from 'node:path';

const fingerprint = (process.env.AASOPHARMA_ANDROID_SHA256 || '')
    .trim()
    .toUpperCase();

if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint)) {
    console.error(
        'Set AASOPHARMA_ANDROID_SHA256 to the signing certificate SHA-256 fingerprint.',
    );
    process.exit(1);
}

const assetLinks = [
    {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: 'com.aasopharma.erp',
            sha256_cert_fingerprints: [fingerprint],
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
