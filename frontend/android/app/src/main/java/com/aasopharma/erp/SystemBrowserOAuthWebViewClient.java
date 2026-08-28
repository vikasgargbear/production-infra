package com.aasopharma.erp;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.widget.Toast;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Set;
import java.util.regex.Pattern;

final class SystemBrowserOAuthWebViewClient extends BridgeWebViewClient {
    private static final String OAUTH_PATH = "/auth/v1/authorize";
    private static final Pattern CODE_CHALLENGE = Pattern.compile("^[A-Za-z0-9_-]{43,128}$");
    private static final Pattern INVITATION_TOKEN = Pattern.compile("^[A-Za-z0-9._~-]{8,2048}$");
    private static final Pattern AUTHORIZATION_ID = Pattern.compile("^[A-Za-z0-9_-]{16,512}$");

    private final MainActivity activity;

    SystemBrowserOAuthWebViewClient(Bridge bridge, MainActivity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        if (!request.isForMainFrame()) {
            return super.shouldOverrideUrlLoading(view, request);
        }

        Uri uri = request.getUrl();
        if (isSupabaseAuthorizeEndpoint(uri)) {
            if (!isValidGoogleOAuthRequest(uri)) {
                Toast.makeText(activity, "Blocked an invalid Google sign-in request", Toast.LENGTH_LONG).show();
                return true;
            }
            return openInSystemBrowser(uri, "No system browser is available for Google sign-in");
        }

        if (isAppOrigin(uri)) {
            return super.shouldOverrideUrlLoading(view, request);
        }

        if (isSecureWebUrl(uri)) {
            return openInSystemBrowser(uri, "Unable to open this secure link");
        }

        return super.shouldOverrideUrlLoading(view, request);
    }

    private boolean openInSystemBrowser(Uri uri, String failureMessage) {
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException exception) {
            Toast.makeText(activity, failureMessage, Toast.LENGTH_LONG).show();
        }
        // A matched OAuth or external HTTPS URL must never fall back into the WebView.
        return true;
    }

    static boolean isSupabaseAuthorizeEndpoint(Uri uri) {
        return isSecureWebUrl(uri) &&
            BuildConfig.SUPABASE_HOST.equalsIgnoreCase(uri.getHost()) &&
            OAUTH_PATH.equals(uri.getPath());
    }

    static boolean isValidGoogleOAuthRequest(Uri uri) {
        if (!isSupabaseAuthorizeEndpoint(uri) || uri.getFragment() != null) {
            return false;
        }

        Set<String> names = uri.getQueryParameterNames();
        if (!names.contains("provider") || !names.contains("redirect_to") ||
            !names.contains("code_challenge") || !names.contains("code_challenge_method") ||
            !hasSingleValue(uri, "provider") || !hasSingleValue(uri, "redirect_to") ||
            !hasSingleValue(uri, "code_challenge") ||
            !hasSingleValue(uri, "code_challenge_method")) {
            return false;
        }
        if (!"google".equals(uri.getQueryParameter("provider")) ||
            !"s256".equalsIgnoreCase(uri.getQueryParameter("code_challenge_method"))) {
            return false;
        }

        String challenge = uri.getQueryParameter("code_challenge");
        String redirect = uri.getQueryParameter("redirect_to");
        return challenge != null && CODE_CHALLENGE.matcher(challenge).matches() &&
            redirect != null && isAllowedReturnUri(Uri.parse(redirect));
    }

    static boolean isAllowedReturnUri(Uri uri) {
        if (!isAppOrigin(uri) || uri.getFragment() != null) {
            return false;
        }

        Set<String> names = uri.getQueryParameterNames();
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) {
            if (names.isEmpty()) {
                return true;
            }
            String invitationToken = uri.getQueryParameter("invitation_token");
            return names.size() == 1 && names.contains("invitation_token") &&
                hasSingleValue(uri, "invitation_token") &&
                invitationToken != null && INVITATION_TOKEN.matcher(invitationToken).matches();
        }

        if ("/oauth/consent".equals(path)) {
            String authorizationId = uri.getQueryParameter("authorization_id");
            return names.size() == 1 && names.contains("authorization_id") &&
                hasSingleValue(uri, "authorization_id") &&
                authorizationId != null && AUTHORIZATION_ID.matcher(authorizationId).matches();
        }

        return false;
    }

    private static boolean hasSingleValue(Uri uri, String name) {
        return uri.getQueryParameters(name).size() == 1;
    }

    static boolean isAppOrigin(Uri uri) {
        return isSecureWebUrl(uri) &&
            BuildConfig.APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    static boolean isSecureWebUrl(Uri uri) {
        return uri != null &&
            "https".equalsIgnoreCase(uri.getScheme()) &&
            uri.getHost() != null &&
            uri.getUserInfo() == null &&
            (uri.getPort() == -1 || uri.getPort() == 443);
    }
}
