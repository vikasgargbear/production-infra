package com.aasopharma.erp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import android.net.Uri;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

@RunWith(RobolectricTestRunner.class)
public class AndroidSecurityContractTest {
    private static final String CHALLENGE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    @Test
    public void acceptsOnlyReviewedGooglePkceAuthorizeRequests() {
        Uri valid = oauthUri("google", appReturn("/"));
        assertTrue(SystemBrowserOAuthWebViewClient.isValidGoogleOAuthRequest(valid));

        assertFalse(SystemBrowserOAuthWebViewClient.isValidGoogleOAuthRequest(
            oauthUri("github", appReturn("/"))
        ));
        assertFalse(SystemBrowserOAuthWebViewClient.isValidGoogleOAuthRequest(
            oauthUri("google", "https://attacker.example/")
        ));
    }

    @Test
    public void acceptsOnlyReviewedOAuthReturnRoutes() {
        assertTrue(SystemBrowserOAuthWebViewClient.isAllowedReturnUri(
            Uri.parse(appReturn("/"))
        ));
        assertTrue(SystemBrowserOAuthWebViewClient.isAllowedReturnUri(
            Uri.parse(appReturn("/?invitation_token=invite-token_123"))
        ));
        assertTrue(SystemBrowserOAuthWebViewClient.isAllowedReturnUri(
            Uri.parse(appReturn("/oauth/consent?authorization_id=abcdefghijklmnop"))
        ));

        assertFalse(SystemBrowserOAuthWebViewClient.isAllowedReturnUri(
            Uri.parse(appReturn("/admin"))
        ));
        assertFalse(SystemBrowserOAuthWebViewClient.isAllowedReturnUri(
            Uri.parse(appReturn("/?invitation_token=short"))
        ));
        assertFalse(SystemBrowserOAuthWebViewClient.isAllowedReturnUri(
            Uri.parse("http://" + BuildConfig.APP_HOST + "/")
        ));
    }

    @Test
    public void rejectsAppLinksWithCredentialsOrNonStandardPorts() {
        assertTrue(MainActivity.isTrustedAppLink(Uri.parse(appReturn("/"))));
        assertFalse(MainActivity.isTrustedAppLink(
            Uri.parse("https://user@" + BuildConfig.APP_HOST + "/")
        ));
        assertFalse(MainActivity.isTrustedAppLink(
            Uri.parse("https://" + BuildConfig.APP_HOST + ":8443/")
        ));
    }

    @Test
    public void constrainsNativeExportMetadata() {
        assertTrue(PrivateFileDownloadPlugin.decodedSizeUpperBound("QUFTTw==") < 50);
        assertTrue(PrivateFileDownloadPlugin.sanitizeFilename("a/b.csv").equals("a_b.csv"));
        assertTrue(PrivateFileDownloadPlugin.sanitizeMimeType("text/csv").equals("text/csv"));
        assertTrue(
            PrivateFileDownloadPlugin.sanitizeMimeType("bad value")
                .equals("application/octet-stream")
        );
    }

    @Test
    public void validatesNativeGoogleConfigurationAndHashedNonce() {
        assertTrue(NativeGoogleAuthPlugin.isConfiguredClientId(
            "323677199056-example.apps.googleusercontent.com"
        ));
        assertFalse(NativeGoogleAuthPlugin.isConfiguredClientId("not-a-client-id"));

        assertTrue(NativeGoogleAuthPlugin.isValidNonce(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
        ));
        assertFalse(NativeGoogleAuthPlugin.isValidNonce("raw-nonce"));
        assertFalse(NativeGoogleAuthPlugin.isValidNonce(null));
    }

    private static Uri oauthUri(String provider, String redirectTo) {
        return new Uri.Builder()
            .scheme("https")
            .authority(BuildConfig.SUPABASE_HOST)
            .path("/auth/v1/authorize")
            .appendQueryParameter("provider", provider)
            .appendQueryParameter("redirect_to", redirectTo)
            .appendQueryParameter("code_challenge", CHALLENGE)
            .appendQueryParameter("code_challenge_method", "s256")
            .appendQueryParameter("prompt", "select_account")
            .build();
    }

    private static String appReturn(String pathAndQuery) {
        return "https://" + BuildConfig.APP_HOST + pathAndQuery;
    }
}
