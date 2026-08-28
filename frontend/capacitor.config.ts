import type { CapacitorConfig } from '@capacitor/cli';

const defaultServerUrl =
    'https://aasopharma-erp-pilot-production-eb9b.up.railway.app';
const serverUrl = (process.env.CAPACITOR_SERVER_URL || defaultServerUrl).replace(/\/$/, '');

if (!serverUrl.startsWith('https://')) {
    throw new Error('CAPACITOR_SERVER_URL must be a public HTTPS origin');
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
    },
    plugins: {
        App: {
            disableBackButtonHandler: false,
        },
    },
};

export default config;
