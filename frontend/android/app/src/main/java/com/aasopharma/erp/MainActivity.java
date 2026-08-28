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
        super.onCreate(savedInstanceState);

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
                if (webView.canGoBack()) {
                    webView.goBack();
                    return;
                }

                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
            }
        });
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
        if (!isTrustedAppLink(uri.getScheme(), uri.getHost())) {
            return;
        }

        bridge.getWebView().loadUrl(uri.toString());
    }

    static boolean isTrustedAppLink(String scheme, String host) {
        return "https".equalsIgnoreCase(scheme) &&
            host != null &&
            BuildConfig.APP_HOST.equalsIgnoreCase(host);
    }
}
