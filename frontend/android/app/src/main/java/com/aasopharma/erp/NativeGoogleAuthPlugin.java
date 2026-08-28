package com.aasopharma.erp;

import android.app.Activity;

import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "NativeGoogleAuth")
public class NativeGoogleAuthPlugin extends Plugin {
    private static final Pattern HASHED_NONCE = Pattern.compile("^[a-f0-9]{64}$");
    private static final Pattern GOOGLE_WEB_CLIENT_ID = Pattern.compile(
        "^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$"
    );

    private final AtomicBoolean signInInFlight = new AtomicBoolean(false);

    @PluginMethod
    public void signIn(PluginCall call) {
        String nonce = call.getString("nonce");
        if (!isValidNonce(nonce)) {
            call.reject("Native Google sign-in received an invalid nonce", "INVALID_NONCE");
            return;
        }
        if (!isConfiguredClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)) {
            call.reject("Native Google sign-in is not configured", "CONFIGURATION_MISSING");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Android sign-in is unavailable", "NATIVE_AUTH_UNAVAILABLE");
            return;
        }
        if (!signInInFlight.compareAndSet(false, true)) {
            call.reject("Google sign-in is already open", "SIGN_IN_IN_PROGRESS");
            return;
        }

        try {
            GetSignInWithGoogleOption googleOption =
                new GetSignInWithGoogleOption.Builder(BuildConfig.GOOGLE_WEB_CLIENT_ID)
                    .setNonce(nonce)
                    .build();
            GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(googleOption)
                .build();
            CredentialManager.create(getContext()).getCredentialAsync(
                activity,
                request,
                null,
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse result) {
                        signInInFlight.set(false);
                        resolveGoogleCredential(call, result.getCredential());
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        signInInFlight.set(false);
                        if (error instanceof GetCredentialCancellationException) {
                            call.reject("Google sign-in was cancelled", "AUTH_CANCELLED");
                            return;
                        }
                        if (error instanceof NoCredentialException) {
                            call.reject("No Google credential is available", "NO_CREDENTIAL");
                            return;
                        }
                        call.reject("Android could not complete Google sign-in", "NATIVE_SIGN_IN_FAILED");
                    }
                }
            );
        } catch (RuntimeException exception) {
            signInInFlight.set(false);
            call.reject(
                "Android could not start Google sign-in",
                "NATIVE_SIGN_IN_FAILED",
                exception
            );
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        try {
            CredentialManager.create(getContext()).clearCredentialStateAsync(
                new ClearCredentialStateRequest(),
                null,
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override
                    public void onResult(Void result) {
                        call.resolve();
                    }

                    @Override
                    public void onError(ClearCredentialException error) {
                        call.reject(
                            "Android could not clear the Google credential state",
                            "CLEAR_CREDENTIAL_STATE_FAILED"
                        );
                    }
                }
            );
        } catch (RuntimeException exception) {
            call.reject(
                "Android could not clear the Google credential state",
                "CLEAR_CREDENTIAL_STATE_FAILED",
                exception
            );
        }
    }

    private static void resolveGoogleCredential(PluginCall call, Credential credential) {
        if (!(credential instanceof CustomCredential) ||
            !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
            call.reject("Android returned an unexpected credential", "INVALID_CREDENTIAL");
            return;
        }

        try {
            GoogleIdTokenCredential googleCredential =
                GoogleIdTokenCredential.createFrom(credential.getData());
            String idToken = googleCredential.getIdToken();
            if (idToken == null || idToken.isBlank()) {
                call.reject("Google returned an empty ID token", "INVALID_CREDENTIAL");
                return;
            }
            JSObject response = new JSObject();
            response.put("idToken", idToken);
            call.resolve(response);
        } catch (RuntimeException exception) {
            call.reject("Google returned an invalid ID token", "INVALID_CREDENTIAL", exception);
        }
    }

    static boolean isValidNonce(String nonce) {
        return nonce != null && HASHED_NONCE.matcher(nonce).matches();
    }

    static boolean isConfiguredClientId(String clientId) {
        return clientId != null && GOOGLE_WEB_CLIENT_ID.matcher(clientId).matches();
    }
}
