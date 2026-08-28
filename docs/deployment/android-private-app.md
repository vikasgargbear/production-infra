# Private Android app

The AASOPharma Android app is a private, sideloadable Capacitor shell. It is
not configured for a Play Store listing. The package identifier is
`com.aasopharma.erp`.

The shell loads one certified HTTPS frontend origin. By default this is the
pinned Railway pilot frontend:

```text
https://aasopharma-erp-pilot-production-eb9b.up.railway.app
```

Set `CAPACITOR_SERVER_URL` at both Capacitor sync and Gradle build time to
target another certified origin. Never build a distributable APK against an
unreconciled deployment or a localhost URL.

## Security and navigation contract

- Cleartext HTTP and mixed content are disabled.
- Google OAuth leaves the WebView and opens in the system browser. Capacitor's
  WebView client sends HTTPS URLs outside the configured app origin to the
  system URL handler.
- OAuth returns through an HTTPS Android App Link for the configured frontend
  host. `MainActivity` accepts only `https` links whose host exactly matches
  the build-time host; custom URL schemes are intentionally unsupported.
- The host must publish a matching Digital Asset Links document before OAuth
  is considered ready. A manifest with `android:autoVerify="true"` is not
  sufficient by itself.
- The Android back button navigates WebView history before leaving the app.
- External links use the system browser. Standard file inputs use Capacitor's
  Android document picker. Secure HTTP(S) downloads use Android's download
  manager and are stored in the app-specific Downloads directory. Browser
  `blob:` downloads need a separate product-level export contract and are not
  claimed by this wrapper.

## Build a private debug APK

The build requires Node 22+, JDK 17+ and the Android SDK for API 36.

```bash
cd frontend
export CAPACITOR_SERVER_URL=https://aasopharma-erp-pilot-production-eb9b.up.railway.app
npm ci
npm run mobile:check
npm run mobile:build:debug
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The debug APK is suitable only for private device testing. A distributable
release APK needs a long-lived signing key kept outside Git, an intentional
version bump, release hardening, and a matching release-certificate fingerprint
on the frontend host.

## Verify the OAuth return App Link

Get the SHA-256 fingerprint of the certificate that signs the APK:

```bash
keytool -list -v \
  -alias androiddebugkey \
  -keystore "$HOME/.android/debug.keystore" \
  -storepass android -keypass android
```

Generate the host document from the fingerprint:

```bash
cd frontend
AASOPHARMA_ANDROID_SHA256='AA:BB:...:FF' npm run mobile:app-links
```

Publish the generated file at exactly:

```text
https://<CAPACITOR_SERVER_URL host>/.well-known/assetlinks.json
```

It must return `200`, without a redirect, as JSON. Also allow the same HTTPS
return URL in Supabase's redirect allow-list. Rebuild and reinstall after any
host or signing-certificate change.

On Android 12 or newer, force and inspect verification:

```bash
adb shell pm verify-app-links --re-verify com.aasopharma.erp
adb shell pm get-app-links com.aasopharma.erp
```

The configured domain must report `verified` before testing Google OAuth. Test
the full sequence: start Google sign-in in the app, complete consent in the
system browser, return to the app, exchange the Supabase session, then complete
organization creation or invitation acceptance.

## Manual device checks

1. Launch on a fresh install and confirm the certified Railway origin loads.
2. Confirm Google consent opens outside the app in the system browser.
3. Confirm the verified HTTPS callback returns to the existing app task.
4. Complete new-organization and invitation onboarding separately.
5. Navigate through three screens and confirm Back moves through history before
   exiting.
6. Open an external link and confirm it stays in the system browser.
7. Upload a document with a standard file input and download a secure server
   file; confirm completion in Android's download notification.
8. Rotate the device, background/resume, sign out, and repeat sign-in.
