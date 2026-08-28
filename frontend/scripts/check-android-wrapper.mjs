import fs from 'node:fs';

const requiredText = new Map([
    ['capacitor.config.ts', [
        "appId: 'com.aasopharma.erp'",
        "serverUrl.startsWith('https://')",
        'cleartext: false',
        'webContentsDebuggingEnabled: false',
    ]],
    ['android/app/build.gradle', [
        'applicationId "com.aasopharma.erp"',
        'manifestPlaceholders = [aasopharmaAppHost: aasopharmaAppHost]',
        'buildConfigField "String", "APP_HOST"',
        'buildConfigField "String", "SUPABASE_HOST"',
        'buildConfigField "String", "GOOGLE_WEB_CLIENT_ID"',
        'androidx.credentials:credentials:1.6.0',
        "System.getenv('AASOPHARMA_ANDROID_KEYSTORE')",
        'Release signing is incomplete',
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
        'registerPlugin(PrivateFileDownloadPlugin.class)',
        'registerPlugin(NativeGoogleAuthPlugin.class)',
        'SystemBrowserOAuthWebViewClient(bridge, this)',
        'openVerifiedAppLink(getIntent())',
        'isTrustedAppLink(uri)',
        'BuildConfig.APP_HOST.equalsIgnoreCase(host)',
    ]],
    ['android/app/src/main/java/com/aasopharma/erp/SystemBrowserOAuthWebViewClient.java', [
        'Intent.ACTION_VIEW',
        'Intent.CATEGORY_BROWSABLE',
        'request.isForMainFrame()',
        'BuildConfig.SUPABASE_HOST.equalsIgnoreCase(uri.getHost())',
        'isValidGoogleOAuthRequest(uri)',
        'isAllowedReturnUri(Uri.parse(redirect))',
        'return true;',
    ]],
    ['android/app/src/main/java/com/aasopharma/erp/PrivateFileDownloadPlugin.java', [
        '@CapacitorPlugin(name = "PrivateFileDownload")',
        'Intent.ACTION_CREATE_DOCUMENT',
        'MAX_BYTES = 50 * 1024 * 1024',
    ]],
    ['android/app/src/main/java/com/aasopharma/erp/NativeGoogleAuthPlugin.java', [
        '@CapacitorPlugin(name = "NativeGoogleAuth")',
        'GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID)',
        'CredentialManager.create(getContext()).getCredentialAsync(',
        'GoogleIdTokenCredential.createFrom(credential.getData())',
        'clearCredentialStateAsync(',
    ]],
    ['src/services/mobile/nativeGoogleAuth.ts', [
        "registerPlugin<NativeGoogleAuthPlugin>('NativeGoogleAuth')",
        "Capacitor.getPlatform() === 'android'",
        "crypto.subtle.digest(",
        "nonce: await sha256Hex(nonce)",
    ]],
    ['src/contexts/AuthContext.tsx', [
        'signInWithNativeGoogle()',
        'auth.signInWithIdToken({',
        "provider: 'google'",
        'clearNativeGoogleCredentialState()',
    ]],
    ['src/services/mobile/androidNativeBridge.ts', [
        "Capacitor.getPlatform() !== 'android'",
        "registerPlugin<PrivateFileDownloadPlugin>(",
        'HTMLAnchorElement.prototype.click',
        'item.revokeRequested = true',
    ]],
    ['src/index.tsx', [
        "import { installAndroidNativeBridge } from './services/mobile/androidNativeBridge';",
        'installAndroidNativeBridge();',
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
