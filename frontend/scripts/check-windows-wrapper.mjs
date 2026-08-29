import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const config = JSON.parse(read('src-tauri/tauri.conf.json'));
if (config.identifier !== 'com.aasopharma.erp') throw new Error('Windows identifier drifted');
if (!config.bundle?.targets?.includes('nsis')) throw new Error('NSIS setup target is required');
if (config.bundle?.windows?.webviewInstallMode?.type !== 'offlineInstaller') {
  throw new Error('Windows setup must bundle the offline WebView2 installer');
}
if (config.bundle?.windows?.nsis?.installMode !== 'currentUser') {
  throw new Error('Windows setup must remain scoped to the current user');
}
if (config.app?.security?.csp !== null) throw new Error('Remote ERP must not inherit a misleading local CSP');
if (!fs.existsSync(path.join(root, 'src-tauri/icons/icon.ico'))) {
  throw new Error('Windows installer icon is missing');
}

const rust = read('src-tauri/src/main.rs');
for (const contract of [
  'https://aasopharma-erp-pilot-production-eb9b.up.railway.app',
  'rgihahbmkrmhitjdjvev.supabase.co',
  'rewrite_google_oauth_for_desktop',
  'is_allowed_app_return',
  'open::that_detached',
  'aasopharma',
]) {
  if (!rust.includes(contract)) throw new Error(`Missing Windows security contract: ${contract}`);
}

const callback = read('public/desktop-oauth-callback.html');
if (!callback.includes("new URL('aasopharma://oauth/callback')")) {
  throw new Error('Desktop OAuth callback does not return to the installed app');
}
if (!callback.includes("returnTo.origin !== allowedOrigin")) {
  throw new Error('Desktop OAuth callback is missing its app-origin allowlist');
}
if (/localStorage|sessionStorage|document\.cookie/.test(callback)) {
  throw new Error('Desktop OAuth callback must not persist authentication material');
}

console.log('Windows private app wrapper contract is valid.');
