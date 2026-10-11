package com.folio.finance;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Offline, locally stored UI; no Internet permission required. */
public final class MainActivity extends Activity {
    private WebView web;
    private boolean loaded;

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(246,247,250));
        getWindow().setNavigationBarColor(Color.rgb(247,248,250));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR |
            android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(246,247,250));
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                loaded = true;
                refresh();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) { return true; }
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportZoom(false);
        WebView.setWebContentsDebuggingEnabled(false);
        web.addJavascriptInterface(new NativeApi(), "FolioNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }
    @Override protected void onResume() { super.onResume(); refresh(); }
    private void refresh() {
        if (loaded && web != null) web.post(() -> web.evaluateJavascript("window.folioNativeRefresh&&window.folioNativeRefresh()", null));
    }
    @Override public void onBackPressed() {
        if (loaded) web.evaluateJavascript("window.folioGoHome&&window.folioGoHome()", null);
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        if(web != null) { web.removeJavascriptInterface("FolioNative"); web.destroy(); }
        super.onDestroy();
    }

    public final class NativeApi {
        @JavascriptInterface public String getPendingTransactions() { return NativeStore.getPending(MainActivity.this).toString(); }
        @JavascriptInterface public void ackTransactions(String ids) { NativeStore.ack(MainActivity.this, ids); }
        @JavascriptInterface public boolean captureEnabled() { return NativeStore.isCaptureEnabled(MainActivity.this); }
        @JavascriptInterface public void setCaptureEnabled(boolean value) { NativeStore.setCaptureEnabled(MainActivity.this, value); }
        @JavascriptInterface public void clearPending() { NativeStore.clearQueue(MainActivity.this); }
        @JavascriptInterface public void shareCsv(String data) {
            runOnUiThread(() -> {
                Intent share = new Intent(Intent.ACTION_SEND);
                share.setType("text/csv");
                share.putExtra(Intent.EXTRA_TEXT, data);
                startActivity(Intent.createChooser(share, "Export Folio transactions"));
            });
        }
        @JavascriptInterface public String getSourcePackages() { return NativeStore.getSources(MainActivity.this).toString(); }
        @JavascriptInterface public void setSourcePackages(String list) { NativeStore.setSources(MainActivity.this, list); }
        @JavascriptInterface public boolean notificationAccessGranted() {
            String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
            ComponentName component = new ComponentName(MainActivity.this, FinanceNotificationListener.class);
            return enabled != null && enabled.contains(component.flattenToString());
        }
        @JavascriptInterface public void openNotificationSettings() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        }
    }
}
