import type { CapacitorConfig } from '@capacitor/cli';

const defaultServerUrl =
    'https://aasopharma-erp-pilot-production-eb9b.up.railway.app';
const serverUrl = (process.env.CAPACITOR_SERVER_URL || defaultServerUrl).replace(/\/$/, '');
const parsedServerUrl = new URL(serverUrl);

if (
    !serverUrl.startsWith('https://') ||
    parsedServerUrl.protocol !== 'https:' ||
    !parsedServerUrl.hostname ||
    parsedServerUrl.username ||
    parsedServerUrl.password ||
    (parsedServerUrl.port && parsedServerUrl.port !== '443') ||
    parsedServerUrl.pathname !== '/' ||
    parsedServerUrl.search ||
    parsedServerUrl.hash
) {
    throw new Error('CAPACITOR_SERVER_URL must be an HTTPS origin on port 443');
}

const config: CapacitorConfig = {
    appId: 'com.aasopharma.erp',
    appName: 'AASOPharma ERP',
    webDir: 'build',
    server: {
        url: serverUrl,
        cleartext: false,
        androidScheme: 'https',
    },
    android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false,
    },
    plugins: {
        App: {
            disableBackButtonHandler: false,
        },
    },
};

export default config;
