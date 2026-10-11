package com.folio.finance;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.speech.RecognizerIntent;
import java.util.ArrayList;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.view.Gravity;
import android.view.View;


/** Offline, locally stored UI; no Internet permission required. */
public final class MainActivity extends Activity {
    private WebView web;
    private FrameLayout layout;
    private View loadingOverlay;
    private boolean loaded;
    private static final int VOICE_REQUEST = 7609;
    private static final int CSV_IMPORT_REQUEST = 7610;

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
                if (loadingOverlay != null && layout != null) {
                    web.animate().alpha(1f).setDuration(200).start();
                    layout.removeView(loadingOverlay);
                    loadingOverlay = null;
                }
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
        layout = new FrameLayout(this);
        layout.setBackgroundColor(Color.rgb(12,44,35));
        web.setAlpha(0f);
        layout.addView(web,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout brand = new LinearLayout(this);
        brand.setOrientation(LinearLayout.VERTICAL);
        brand.setGravity(Gravity.CENTER);
        brand.setBackgroundColor(Color.rgb(12,44,35));
        ProgressBar spinner = new ProgressBar(this);
        if (spinner.getIndeterminateDrawable()!=null) spinner.getIndeterminateDrawable().setTint(Color.rgb(197,241,116));
        brand.addView(spinner,new LinearLayout.LayoutParams(64,64));
        TextView label = new TextView(this);
        label.setText("folio.");
        label.setTextColor(Color.rgb(243,255,247));
        label.setTextSize(26f);
        label.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1,60);
        lp.topMargin=18;
        brand.addView(label,lp);
        loadingOverlay=brand;
        layout.addView(loadingOverlay,new FrameLayout.LayoutParams(-1,-1));
        setContentView(layout);
        web.loadUrl("file:///android_asset/index.html");
    }
    @Override protected void onResume() { super.onResume(); refresh(); }
    private void refresh() {
        if (loaded && web != null) web.post(() -> web.evaluateJavascript("window.folioNativeRefresh&&window.folioNativeRefresh()", null));
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CSV_IMPORT_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && web != null) {
                try (InputStream in = getContentResolver().openInputStream(data.getData());
                     ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                    if (in == null) throw new IllegalArgumentException("Unable to read selected document");
                    byte[] chunk = new byte[8192];
                    int n;
                    while ((n = in.read(chunk)) != -1) {
                        if (out.size() + n > 2_000_000) throw new IllegalArgumentException("CSV is larger than 2 MB");
                        out.write(chunk, 0, n);
                    }
                    String csv = out.toString(StandardCharsets.UTF_8.name());
                    String js = "window.folioImportCsv&&window.folioImportCsv(" + JSONObject.quote(csv) + ")";
                    web.post(() -> web.evaluateJavascript(js, null));
                } catch (Exception e) {
                    web.post(() -> web.evaluateJavascript(
                        "window.folioImportError&&window.folioImportError('Could not read the chosen CSV file.')", null));
                }
            }
            return;
        }
        if (requestCode != VOICE_REQUEST || web == null) return;
        String transcript = "";
        String error = "";
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) transcript = results.get(0);
        } else if (resultCode != RESULT_CANCELED) error = "Speech was not recognized. Please type your request.";
        final String payload = "window.FolioV2&&window.FolioV2.onVoiceResult(" +
            JSONObject.quote(transcript) + "," + JSONObject.quote(error) + ")";
        web.post(() -> web.evaluateJavascript(payload, null));
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
        @JavascriptInterface public void setDarkChrome(boolean dark) {
            runOnUiThread(() -> {
                getWindow().setStatusBarColor(dark?Color.rgb(12,44,35):Color.rgb(246,247,250));
                getWindow().setNavigationBarColor(dark?Color.rgb(12,44,35):Color.rgb(247,248,250));
                getWindow().getDecorView().setSystemUiVisibility(dark?0:
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
            });
        }
        @JavascriptInterface public void pickCsvFile() {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("*/*");
                    intent.putExtra(Intent.EXTRA_MIME_TYPES,
                        new String[]{"text/csv", "text/plain", "application/vnd.ms-excel", "application/octet-stream"});
                    startActivityForResult(intent, CSV_IMPORT_REQUEST);
                } catch (Exception ignored) {
                    if (web != null) web.evaluateJavascript(
                        "window.folioImportError&&window.folioImportError('File picker is unavailable.')", null);
                }
            });
        }
        @JavascriptInterface public void startVoiceRecognition(String locale) {
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG".equals(locale) ? "ar-EG" : "en-US");
                    intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Tell Folio about your money");
                    intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
                    startActivityForResult(intent, VOICE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    if (web != null) web.evaluateJavascript(
                        "window.FolioV2&&window.FolioV2.onVoiceResult('','Speech recognition is unavailable on this device.')", null);
                }
            });
        }
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
        @JavascriptInterface public String getCaptureDiagnostics() { return NativeStore.diagnostics(MainActivity.this).toString(); }
        @JavascriptInterface public String getObservedSources() { return NativeStore.getObservedSources(MainActivity.this).toString(); }
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
