package com.aasopharma.erp;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeGoogleAuthPlugin.class);
        registerPlugin(PrivateFileDownloadPlugin.class);
        super.onCreate(savedInstanceState);

        bridge.getWebView().setWebViewClient(new SystemBrowserOAuthWebViewClient(bridge, this));
        configureBackNavigation();
        configureDownloads();
        openVerifiedAppLink(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openVerifiedAppLink(intent);
    }

    private void configureBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = bridge.getWebView();
                if (isRootAppDestination(webView.getUrl())) {
                    finish();
                    return;
                }
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                finish();
            }
        });
    }

    static boolean isRootAppDestination(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) {
            return false;
        }

        Uri uri = Uri.parse(rawUrl);
        String path = uri.getPath();
        String fragment = uri.getFragment();
        boolean rootPath = path == null || path.isEmpty() || "/".equals(path);
        boolean rootFragment =
            fragment == null || fragment.isEmpty() || "/home".equals(fragment);
        return isTrustedAppLink(uri) && rootPath && rootFragment;
    }

    private void configureDownloads() {
        bridge.getWebView().setDownloadListener(
            (url, userAgent, contentDisposition, mimeType, contentLength) -> {
                Uri uri = Uri.parse(url);
                if (!"https".equalsIgnoreCase(uri.getScheme())) {
                    Toast.makeText(this, "Only secure downloads are supported", Toast.LENGTH_SHORT).show();
                    return;
                }

                String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request request = new DownloadManager.Request(uri)
                    .setMimeType(mimeType)
                    .setTitle(filename)
                    .setDescription("Downloading from AASOPharma ERP")
                    .setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                    )
                    .setDestinationInExternalFilesDir(
                        this,
                        Environment.DIRECTORY_DOWNLOADS,
                        filename
                    );

                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null && !cookies.isBlank()) {
                    request.addRequestHeader("Cookie", cookies);
                }
                if (userAgent != null && !userAgent.isBlank()) {
                    request.addRequestHeader("User-Agent", userAgent);
                }

                try {
                    DownloadManager manager =
                        (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    manager.enqueue(request);
                    Toast.makeText(this, "Download started", Toast.LENGTH_SHORT).show();
                } catch (RuntimeException exception) {
                    Toast.makeText(this, "Unable to start download", Toast.LENGTH_LONG).show();
                }
            }
        );
    }

    private void openVerifiedAppLink(Intent intent) {
        Uri uri = intent == null ? null : intent.getData();
        if (uri == null) {
            return;
        }
        if (!isTrustedAppLink(uri)) {
            return;
        }

        bridge.getWebView().loadUrl(uri.toString());
    }

    static boolean isTrustedAppLink(Uri uri) {
        return uri != null &&
            isTrustedAppLink(uri.getScheme(), uri.getHost()) &&
            uri.getUserInfo() == null &&
            (uri.getPort() == -1 || uri.getPort() == 443);
    }

    static boolean isTrustedAppLink(String scheme, String host) {
        return "https".equalsIgnoreCase(scheme) &&
            host != null &&
            BuildConfig.APP_HOST.equalsIgnoreCase(host);
    }
}
