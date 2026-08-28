package com.aasopharma.erp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;

@RunWith(RobolectricTestRunner.class)
public class MainActivityTest {
    @Test
    public void acceptsOnlyHttpsLinksForConfiguredHost() {
        assertTrue(MainActivity.isTrustedAppLink("https", BuildConfig.APP_HOST));
        assertTrue(MainActivity.isTrustedAppLink("HTTPS", BuildConfig.APP_HOST.toUpperCase()));
        assertFalse(MainActivity.isTrustedAppLink("http", BuildConfig.APP_HOST));
        assertFalse(MainActivity.isTrustedAppLink("aasopharma", BuildConfig.APP_HOST));
        assertFalse(MainActivity.isTrustedAppLink("https", "attacker.example"));
        assertFalse(MainActivity.isTrustedAppLink("https", null));
    }

    @Test
    public void exitsOnlyAtTheTrustedApplicationRoot() {
        String origin = "https://" + BuildConfig.APP_HOST;

        assertTrue(MainActivity.isRootAppDestination(origin));
        assertTrue(MainActivity.isRootAppDestination(origin + "/"));
        assertTrue(MainActivity.isRootAppDestination(origin + "/#/home"));
        assertTrue(MainActivity.isRootAppDestination(origin + "/?invitation_token=invite#/home"));

        assertFalse(MainActivity.isRootAppDestination(origin + "/#/sales"));
        assertFalse(MainActivity.isRootAppDestination(origin + "/oauth/consent"));
        assertFalse(MainActivity.isRootAppDestination("https://attacker.example/#/home"));
        assertFalse(MainActivity.isRootAppDestination(null));
    }
}
