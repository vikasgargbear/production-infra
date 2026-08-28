# Private Android app

The AASOPharma Android app is a private, sideloadable Capacitor shell. It is
not configured for Google Play. Its fixed package identifier is
`com.aasopharma.erp`.

The shell loads one HTTPS frontend origin. The checked-in default is:

```text
https://aasopharma-erp-pilot-production-eb9b.up.railway.app
```

Set `CAPACITOR_SERVER_URL` at Capacitor sync and Gradle build time to select a
different reviewed Railway frontend. The value must be an HTTPS origin on port
443, with no credentials, path, query, or fragment.

## Security and navigation contract

- Cleartext HTTP, mixed content, backups, and WebView debugging are disabled.
- On Android, the primary Google sign-in path uses Credential Manager's native
  account picker. The native plugin sends the Google ID token and the unhashed
  nonce to Supabase `signInWithIdToken`; the ERP never accepts an unverified
  Google token directly.
- If Credential Manager or its Google provider is unavailable, the WebView may
  fall back to the reviewed PKCE authorize request on the exact
  `AASOPHARMA_SUPABASE_HOST`. It validates the callback route and opens that
  authorize URL with an Android `ACTION_VIEW` browsable intent. Cancellation or
  an invalid native credential fails closed and never opens Chrome. Google
  OAuth never runs inside the embedded WebView.
- OAuth returns through an HTTPS Android App Link on the configured frontend
  host. Custom URL schemes are intentionally unsupported.
- Accepted return routes are `/`, `/?invitation_token=<token>`, and
  `/oauth/consent?authorization_id=<id>`. Other callback paths are rejected by
  the OAuth launcher.
- Android Back navigates WebView history before exiting the activity. External
  HTTPS links open in the system browser.
- Capacitor handles standard file inputs with Android's document picker.
  Secure server downloads use Android Download Manager. Browser-generated
  `blob:` CSV/PDF exports use the private `ACTION_CREATE_DOCUMENT` plugin, with
  a 50 MB limit and filename/MIME validation.

## Prerequisites and checks

Use Node 22+, JDK 21, Android SDK/API 36, and platform tools containing `adb`.

```bash
cd frontend
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export CAPACITOR_SERVER_URL=https://aasopharma-erp-pilot-production-eb9b.up.railway.app
export AASOPHARMA_SUPABASE_HOST=rgihahbmkrmhitjdjvev.supabase.co
export AASOPHARMA_GOOGLE_WEB_CLIENT_ID=323677199056-omdr0k93cn9mc6mopulgk2n4la0f6biv.apps.googleusercontent.com

npm ci
npm run typecheck
npm run lint:critical
npm run test:ci -- --runInBand
CI=false npm run build
npm run mobile:check
npm run mobile:test:android
```

## Debug APK for private device testing

```bash
cd frontend
npm run mobile:build:debug
adb devices -l
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK uses the fixed `com.aasopharma.erp` package ID but is not a
distributable release. Its certificate may be used temporarily in
`assetlinks.json` only on a dedicated test host.

## Create and protect the release key

Create one long-lived AASOPharma signing key outside Git and outside synced or
shared folders. Back it up in the organization's secrets system. Losing it
prevents upgrades over an installed APK; leaking it lets another party sign an
APK as AASOPharma.

```bash
keytool -genkeypair -v \
  -keystore /secure/path/aasopharma-android-release.jks \
  -alias aasopharma-android \
  -keyalg RSA -keysize 4096 -validity 10000
```

Do not commit the keystore, passwords, generated APKs, or a `.env` containing
these values.

## Configure native Google sign-in

Credential Manager uses the Google web OAuth client ID as the server client ID.
The ID is public configuration, not a client secret. The checked-in default is
the same web client used by the canonical Supabase Google provider and can be
overridden with `AASOPHARMA_GOOGLE_WEB_CLIENT_ID`.

In that Google Cloud project's Google Auth Platform client configuration,
register an Android OAuth client with both:

```text
Package name: com.aasopharma.erp
SHA-1: the SHA-1 fingerprint of the permanent release signing certificate
```

Keep the existing web OAuth client first in Supabase's comma-separated Google
client ID list. Add the Android client ID to the same list if it is not already
present. Never put an OAuth client secret in the APK. Confirm `openid`, email,
and profile are the only login scopes unless a separately reviewed feature
requires more.

## Build and verify a signed release APK

Release tasks deliberately fail when any signing value is absent. Increment
`AASOPHARMA_ANDROID_VERSION_CODE` for every distributed APK.

```bash
cd frontend
export CAPACITOR_SERVER_URL=https://aasopharma-erp-pilot-production-eb9b.up.railway.app
export AASOPHARMA_SUPABASE_HOST=rgihahbmkrmhitjdjvev.supabase.co
export AASOPHARMA_GOOGLE_WEB_CLIENT_ID=323677199056-omdr0k93cn9mc6mopulgk2n4la0f6biv.apps.googleusercontent.com
export AASOPHARMA_ANDROID_VERSION_CODE=1
export AASOPHARMA_ANDROID_VERSION_NAME=1.0.0
export AASOPHARMA_ANDROID_KEYSTORE=/secure/path/aasopharma-android-release.jks
export AASOPHARMA_ANDROID_KEY_ALIAS=aasopharma-android
read -s "AASOPHARMA_ANDROID_KEYSTORE_PASSWORD?Keystore password: "
echo
export AASOPHARMA_ANDROID_KEYSTORE_PASSWORD
read -s "AASOPHARMA_ANDROID_KEY_PASSWORD?Key password: "
echo
export AASOPHARMA_ANDROID_KEY_PASSWORD

npm run mobile:build:release

"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify \
  --verbose --print-certs \
  android/app/build/outputs/apk/release/app-release.apk
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging \
  android/app/build/outputs/apk/release/app-release.apk
shasum -a 256 android/app/build/outputs/apk/release/app-release.apk
```

Install or upgrade an APK signed by the same key:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

If Android reports `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, an installed build has
a different certificate. `adb uninstall com.aasopharma.erp` removes that app
and its local app data before a clean install; do not run it without accepting
that data loss.

## Publish and verify the App Link

Read the release certificate fingerprint:

```bash
keytool -list -v \
  -keystore "$AASOPHARMA_ANDROID_KEYSTORE" \
  -alias "$AASOPHARMA_ANDROID_KEY_ALIAS"
```

Generate the host document. The variable accepts comma-separated fingerprints
only when an intentional certificate rotation requires both certificates.

```bash
cd frontend
AASOPHARMA_ANDROID_SHA256='AA:BB:...:FF' npm run mobile:app-links
```

Publish the generated file at exactly:

```text
https://<CAPACITOR_SERVER_URL host>/.well-known/assetlinks.json
```

It must return `200` directly over HTTPS, with `Content-Type: application/json`
and no redirect. The certificate fingerprint must match the installed APK.

In Supabase Auth's production Redirect URLs allow-list, add only the routes the
web app emits:

```text
https://<CAPACITOR_SERVER_URL host>/
https://<CAPACITOR_SERVER_URL host>/?invitation_token=**
https://<CAPACITOR_SERVER_URL host>/oauth/consent?authorization_id=**
```

The fixed paths keep the production allow-list narrow; `**` covers the dynamic
token value. Do not add a blanket host-wide `/**` entry.

After publishing, install the release APK and verify the association:

```bash
adb shell pm verify-app-links --re-verify com.aasopharma.erp
# Verification can take several minutes.
adb shell pm get-app-links com.aasopharma.erp
adb shell am start -W \
  -a android.intent.action.VIEW \
  -c android.intent.category.BROWSABLE \
  -d "https://<CAPACITOR_SERVER_URL host>/"
```

The domain must report `verified` and the test URL must open the installed app
without an app chooser.

## Required physical-device acceptance

Run these checks on at least one supported physical Android device before
distribution:

1. Fresh-install the signed release and confirm the reviewed Railway origin.
2. Start Google sign-in and confirm Android's native account picker opens. A
   successful selection must return directly to the existing app task without
   Chrome. On a device without Credential Manager/Google support, confirm the
   fallback opens the system browser and the verified HTTPS callback returns
   to the existing app task.
3. Complete organization creation and invitation acceptance separately.
4. Navigate through at least three ERP screens. Confirm Back walks WebView
   history, then exits only when history is empty.
5. Open an external HTTPS link and confirm it remains in the system browser.
6. Upload a representative image/PDF through a file input and confirm the
   selected file reaches the ERP form.
7. Download a secure server file and save representative Blob CSV and PDF
   exports. Open each saved file and verify filename, type, and contents.
8. Rotate, background/resume, sign out, repeat sign-in, and confirm no stale
   session or cached frontend replaces the current Railway deployment.
