package com.aasopharma.erp;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.util.Base64InputStream;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "PrivateFileDownload")
public class PrivateFileDownloadPlugin extends Plugin {
    private static final int MAX_BYTES = 50 * 1024 * 1024;

    @PluginMethod
    public void save(PluginCall call) {
        String filename = sanitizeFilename(call.getString("filename", "aasopharma-export"));
        String mimeType = sanitizeMimeType(call.getString("mimeType", "application/octet-stream"));
        String base64 = call.getString("base64");
        if (base64 == null || base64.isBlank() || decodedSizeUpperBound(base64) > MAX_BYTES) {
            call.reject("File is empty or exceeds the 50 MB Android export limit", "INVALID_FILE");
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, "documentCreated");
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Uri destination = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }

        getBridge().execute(() -> writeDocument(call, destination));
    }

    private void writeDocument(PluginCall call, Uri destination) {
        String base64 = call.getString("base64");
        if (base64 == null) {
            call.reject("Export data was unavailable", "INVALID_FILE");
            return;
        }

        byte[] encoded = base64.getBytes(StandardCharsets.US_ASCII);
        try (
            InputStream input = new Base64InputStream(
                new ByteArrayInputStream(encoded),
                Base64.DEFAULT
            );
            OutputStream output = getContext().getContentResolver().openOutputStream(destination, "wt")
        ) {
            if (output == null) {
                call.reject("Android could not open the selected destination", "WRITE_FAILED");
                return;
            }
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > MAX_BYTES) {
                    throw new IOException("Decoded export exceeds 50 MB");
                }
                output.write(buffer, 0, read);
            }
            output.flush();
            JSObject response = new JSObject();
            response.put("saved", true);
            call.resolve(response);
        } catch (IllegalArgumentException | IOException exception) {
            call.reject("Android could not save this export", "WRITE_FAILED", exception);
        }
    }

    static int decodedSizeUpperBound(String base64) {
        return (base64.length() / 4) * 3 + 3;
    }

    static String sanitizeFilename(String filename) {
        String cleaned = filename == null ? "" : filename
            .replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_")
            .trim();
        if (cleaned.isEmpty()) {
            return "aasopharma-export";
        }
        return cleaned.length() > 120 ? cleaned.substring(0, 120) : cleaned;
    }

    static String sanitizeMimeType(String mimeType) {
        if (mimeType != null && mimeType.matches("^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$")) {
            return mimeType;
        }
        return "application/octet-stream";
    }
}
