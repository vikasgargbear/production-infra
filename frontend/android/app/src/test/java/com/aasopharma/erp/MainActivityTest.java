package com.aasopharma.erp;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

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
}
