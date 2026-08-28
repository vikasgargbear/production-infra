import fs from 'node:fs';

const requiredText = new Map([
    ['capacitor.config.ts', [
        "appId: 'com.aasopharma.erp'",
        "serverUrl.startsWith('https://')",
        'cleartext: false',
    ]],
    ['android/app/build.gradle', [
        'applicationId "com.aasopharma.erp"',
        'manifestPlaceholders = [aasopharmaAppHost: aasopharmaAppHost]',
        'buildConfigField "String", "APP_HOST"',
    ]],
    ['android/app/src/main/AndroidManifest.xml', [
        'android:autoVerify="true"',
        'android:scheme="https"',
        'android:host="${aasopharmaAppHost}"',
        'android:usesCleartextTraffic="false"',
    ]],
    ['android/app/src/main/java/com/aasopharma/erp/MainActivity.java', [
        'configureBackNavigation()',
        'configureDownloads()',
        'openVerifiedAppLink(getIntent())',
        'isTrustedAppLink(uri.getScheme(), uri.getHost())',
        'BuildConfig.APP_HOST.equalsIgnoreCase(host)',
    ]],
]);

for (const [filename, fragments] of requiredText) {
    const contents = fs.readFileSync(filename, 'utf8');
    for (const fragment of fragments) {
        if (!contents.includes(fragment)) {
            throw new Error(`${filename} is missing required contract: ${fragment}`);
        }
    }
}

console.log('Android wrapper contract is valid.');
