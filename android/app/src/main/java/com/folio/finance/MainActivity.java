package com.folio.finance;

import android.app.Activity;
import android.Manifest;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;
import android.content.ClipData;
import android.net.Uri;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
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
    private static final int AUDIO_REQUEST = 7612;
    private SpeechRecognizer speech;
    private String pendingVoiceLocale;
    private boolean voiceDelivered;
    private static final int CSV_IMPORT_REQUEST = 7610;
    private static final int JSON_IMPORT_REQUEST = 7611;

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
    private void deliverImportedText(int resultCode, Intent data, String callback) {
        if (resultCode != RESULT_OK || data == null || data.getData() == null || web == null) return;
        try (InputStream in = getContentResolver().openInputStream(data.getData());
             ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            if (in == null) throw new IllegalArgumentException("Unable to read selected document");
            byte[] chunk = new byte[8192];
            int n;
            while ((n = in.read(chunk)) != -1) {
                if (out.size() + n > 2_000_000) throw new IllegalArgumentException("File is larger than 2 MB");
                out.write(chunk, 0, n);
            }
            String text = out.toString(StandardCharsets.UTF_8.name());
            String js = callback + "&&" + callback + "(" + JSONObject.quote(text) + ")";
            web.post(() -> web.evaluateJavascript(js, null));
        } catch (Exception e) {
            web.post(() -> web.evaluateJavascript(
                "window.folioImportError&&window.folioImportError('Could not read the chosen file.')", null));
        }
    }
    private void openImportPicker(int requestCode) {
        try {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("*/*");
            intent.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"text/csv", "text/plain", "application/json", "application/vnd.ms-excel", "application/octet-stream"});
            startActivityForResult(intent, requestCode);
        } catch (Exception ignored) {
            if (web != null) web.evaluateJavascript(
                "window.folioImportError&&window.folioImportError('File picker is unavailable.')", null);
        }
    }
    private void shareDocumentOnUi(String data, String mime, String filename, String title) {
        try {
            File dir = new File(getCacheDir(), "backup");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("cache");
            File out = new File(dir, filename);
            try (OutputStream sink = new FileOutputStream(out)) {
                sink.write((data == null ? "" : data).getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = Uri.parse("content://" + BackupFileProvider.AUTH + "/" + filename);
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType(mime);
            share.putExtra(Intent.EXTRA_STREAM, uri);
            share.putExtra(Intent.EXTRA_SUBJECT, title);
            share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            share.setClipData(ClipData.newRawUri(title, uri));
            if (data != null && data.length() <= 100_000) share.putExtra(Intent.EXTRA_TEXT, data);
            startActivity(Intent.createChooser(share, title));
        } catch (Exception e) {
            Intent share = new Intent(Intent.ACTION_SEND);
            share.setType(mime == null ? "text/plain" : mime);
            share.putExtra(Intent.EXTRA_TEXT, data == null ? "" : data);
            startActivity(Intent.createChooser(share, title));
        }
    }
    private void refresh() {
        if (loaded && web != null) web.post(() -> web.evaluateJavascript("window.folioNativeRefresh&&window.folioNativeRefresh()", null));
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CSV_IMPORT_REQUEST || requestCode == JSON_IMPORT_REQUEST) {
            deliverImportedText(resultCode, data, requestCode == JSON_IMPORT_REQUEST ? "window.folioImportJson" : "window.folioImportCsv");
            return;
        }
        if (requestCode != VOICE_REQUEST || web == null) return;
        String transcript = "";
        String error = "";
        if (resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) transcript = results.get(0);
        } else if (resultCode != RESULT_CANCELED) error = "Speech was not recognized. Please type your request. Nothing was saved. / لم يتم التعرف على الكلام. يمكنك الكتابة. لم يُحفظ شيء.";
        deliverVoice(transcript, error);
    }
    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, grantResults);
        if (requestCode != AUDIO_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startOfflineRecognizer(pendingVoiceLocale);
        } else {
            deliverVoice("", micDeniedMessage());
        }
    }
    /** The system speech screen is a separate app. Folio still has no INTERNET permission. */
    private boolean recognizerInstalled() {
        Intent probe = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        return probe.resolveActivity(getPackageManager()) != null;
    }
    private static String voiceLanguage(String locale) {
        return "ar-EG".equals(locale) ? "ar-EG" : "en-US";
    }
    private Intent voiceIntent(String locale) {
        String language = voiceLanguage(locale);
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Speak a transaction. Folio prefers on-device recognition.");
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        return intent;
    }
    private static String micDeniedMessage() {
        return "MIC_DENIED\nMicrophone permission is off. Allow the microphone for Folio in Android settings, then try voice again. Nothing was saved.\nإذن الميكروفون غير مفعّل. اسمح للميكروفون لتطبيق Folio من إعدادات أندرويد ثم أعد المحاولة. لم يُحفظ شيء.";
    }
    private static String offlinePackMessage() {
        return "OFFLINE_PACK\nOffline speech pack not installed: install Arabic/English offline speech in Google settings. Open the Google app, then Settings, Voice, Offline speech recognition, and download Arabic (Egypt) and English. Folio has no internet permission, so this recognizer cannot download a pack or send audio. You can type, or open the system speech screen. That screen runs in another app and may send audio to its provider.\nحزمة النطق بدون إنترنت غير مثبّتة: ثبّت النطق بالعربية والإنجليزية من إعدادات Google. من تطبيق Google: الإعدادات، ثم الصوت، ثم التعرف على الكلام بدون إنترنت، ثم نزّل العربية (مصر) والإنجليزية. فوليو ليس لديه إذن إنترنت. لم يُحفظ شيء.";
    }
    private static String noRecognizerMessage() {
        return "NO_RECOGNIZER\nNo speech recognizer is installed on this phone. Install the Google app, or type the transaction. Nothing was saved.\nلا يوجد مُتعرّف على الكلام على هذا الهاتف. يمكنك تثبيت تطبيق Google أو كتابة العملية. لم يُحفظ شيء.";
    }
    private void stopSpeech() {
        if (speech == null) return;
        try { speech.cancel(); } catch (RuntimeException ignored) {}
        try { speech.destroy(); } catch (RuntimeException ignored) {}
        speech = null;
    }
    private void startOfflineRecognizer(String locale) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingVoiceLocale = locale;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_REQUEST);
            return;
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            deliverVoice("", recognizerInstalled() ? offlinePackMessage() : noRecognizerMessage());
            return;
        }
        stopSpeech();
        voiceDelivered = false;
        try {
            speech = SpeechRecognizer.createSpeechRecognizer(this);
        } catch (RuntimeException e) {
            speech = null;
            deliverVoice("", offlinePackMessage());
            return;
        }
        if (speech == null) {
            deliverVoice("", offlinePackMessage());
            return;
        }
        speech.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onPartialResults(Bundle partial) {}
            @Override public void onEvent(int eventType, Bundle params) {}
            @Override public void onResults(Bundle results) {
                if (voiceDelivered) return;
                voiceDelivered = true;
                ArrayList<String> heard = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String transcript = heard == null || heard.isEmpty() || heard.get(0) == null ? "" : heard.get(0);
                stopSpeech();
                if (transcript.trim().isEmpty()) deliverVoice("", "Speech was not recognized. Please type your request. Nothing was saved. / لم يتم التعرف على الكلام. يمكنك الكتابة. لم يُحفظ شيء.");
                else deliverVoice(transcript, "");
            }
            @Override public void onError(int code) {
                if (voiceDelivered) return;
                voiceDelivered = true;
                stopSpeech();
                deliverVoice("", voiceError(code));
            }
        });
        try {
            speech.startListening(voiceIntent(locale));
        } catch (SecurityException e) {
            voiceDelivered = true;
            stopSpeech();
            deliverVoice("", micDeniedMessage());
        } catch (RuntimeException e) {
            voiceDelivered = true;
            stopSpeech();
            deliverVoice("", offlinePackMessage());
        }
    }
    private static String voiceError(int code) {
        if (code == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return micDeniedMessage();
        if (code == SpeechRecognizer.ERROR_NETWORK || code == SpeechRecognizer.ERROR_NETWORK_TIMEOUT
                || code == SpeechRecognizer.ERROR_SERVER || code == SpeechRecognizer.ERROR_SERVER_DISCONNECTED
                || code == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || code == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) {
            return offlinePackMessage();
        }
        if (code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
            return "Speech was not recognized. Please type your request. Nothing was saved. / لم يتم التعرف على الكلام. يمكنك الكتابة. لم يُحفظ شيء.";
        }
        return offlinePackMessage();
    }
    private void deliverVoice(String transcript, String error) {
        if (web == null) return;
        final String payload = "window.FolioV2&&window.FolioV2.onVoiceResult(" +
            JSONObject.quote(transcript == null ? "" : transcript) + "," +
            JSONObject.quote(error == null ? "" : error) + ")";
        web.post(() -> web.evaluateJavascript(payload, null));
    }
    @Override public void onBackPressed() {
        if (loaded) web.evaluateJavascript("window.folioGoHome&&window.folioGoHome()", null);
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        stopSpeech();
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
        @JavascriptInterface public void pickCsvFile() { runOnUiThread(() -> openImportPicker(CSV_IMPORT_REQUEST)); }
        @JavascriptInterface public void pickBackupFile() { runOnUiThread(() -> openImportPicker(JSON_IMPORT_REQUEST)); }
        @JavascriptInterface public void startVoiceRecognition(String locale) {
            runOnUiThread(() -> startOfflineRecognizer(locale));
        }
        /** Fallback recognizer UI. It runs outside Folio, which still has no INTERNET permission. */
        @JavascriptInterface public void startSystemVoiceRecognition(String locale) {
            runOnUiThread(() -> {
                if (!recognizerInstalled()) {
                    deliverVoice("", noRecognizerMessage());
                    return;
                }
                try {
                    startActivityForResult(voiceIntent(locale), VOICE_REQUEST);
                } catch (ActivityNotFoundException e) {
                    deliverVoice("", noRecognizerMessage());
                } catch (RuntimeException e) {
                    deliverVoice("", "Speech recognition could not start. You can type instead. Nothing was saved. / تعذر بدء التعرف على الكلام. يمكنك الكتابة. لم يُحفظ شيء.");
                }
            });
        }
        @JavascriptInterface public String getPendingTransactions() { return NativeStore.getPending(MainActivity.this).toString(); }
        @JavascriptInterface public void ackTransactions(String ids) { NativeStore.ack(MainActivity.this, ids); }
        @JavascriptInterface public boolean captureEnabled() { return NativeStore.isCaptureEnabled(MainActivity.this); }
        @JavascriptInterface public void setCaptureEnabled(boolean value) { NativeStore.setCaptureEnabled(MainActivity.this, value); }
        @JavascriptInterface public void clearPending() { NativeStore.clearQueue(MainActivity.this); }
        @JavascriptInterface public void shareCsv(String data) {
            runOnUiThread(() -> shareDocumentOnUi(data, "text/csv", "folio-transactions.csv", "Export Folio transactions"));
        }
        @JavascriptInterface public void shareDocument(String data, String mime, String filename, String title) {
            String safeName = filename != null && filename.matches("[A-Za-z0-9._-]{1,80}") ? filename : "folio-backup.json";
            String safeMime = mime != null && mime.matches("[A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+") ? mime : "application/json";
            String safeTitle = title == null || title.trim().isEmpty() ? "Export Folio backup" : title;
            runOnUiThread(() -> shareDocumentOnUi(data, safeMime, safeName, safeTitle));
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
